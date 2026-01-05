from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Literal, Optional
import uvicorn
import shap

# Import the grid service
import sys
sys.path.append(str(Path(__file__).parent))
from grid_service import get_grid_service

from traffic_service import get_traffic_service
from optimization_service import get_optimization_service

VEHICLE_EMISSION_FACTORS = {
    "petrol_car": 0.170,      # kg CO2/km - average petrol car
    "diesel_car": 0.165,      # kg CO2/km - average diesel
    "hybrid": 0.110,          # kg CO2/km - hybrid
    "electric": 0.053,        # kg CO2/km - EV (indirect from grid)
    "motorcycle": 0.113,      # kg CO2/km
    "bus": 0.089,             # kg CO2/km per passenger
    "train": 0.041,           # kg CO2/km per passenger
    "bicycle": 0.000,         # kg CO2/km - zero emissions!
    "walking": 0.000          # kg CO2/km - zero emissions!
}

app = FastAPI(title="CarbonSense API v2.0 - Context-Aware with Explainability")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ABSOLUTE PATH to models (from project root)
PROJECT_ROOT = Path("/Users/raghavi/Documents/College/CarbonSense")
MODELS_DIR = PROJECT_ROOT / "data" / "processed" / "models"

print(f"🔍 Loading models from: {MODELS_DIR.absolute()}")

models = {}
explainers = {}  # Store SHAP explainers
valid_domains = ["transport", "energy"]

# Load models with error handling
for domain in valid_domains:
    models[domain] = {}
    explainers[domain] = {}
    
    for model_name in ["linear", "rf", "xgb", "bayesian"]:
        model_path = MODELS_DIR / f"{domain}_{model_name}.joblib"
        if model_path.exists():
            models[domain][model_name] = joblib.load(model_path)
            print(f"✅ Loaded {domain}_{model_name}")
            
            # Create SHAP explainer for tree-based models
            if model_name in ["rf", "xgb"]:
                try:
                    explainers[domain][model_name] = shap.TreeExplainer(models[domain][model_name])
                    print(f"  ✅ Created SHAP explainer for {domain}_{model_name}")
                except Exception as e:
                    print(f"  ⚠️  Could not create SHAP explainer for {domain}_{model_name}: {e}")
        else:
            print(f"❌ MISSING: {model_path}")

# Initialize grid service
grid_service = get_grid_service()
print("✅ Grid intensity service initialized")

traffic_service = get_traffic_service()
print("✅ Traffic service initialized")

optimization_service = get_optimization_service(grid_service, traffic_service)
print("✅ Optimization service initialized")

class PredictRequest(BaseModel):
    domain: Literal["transport", "energy"]
    distance_km: float = Field(None, ge=0)
    kwh: float = Field(None, ge=0)
    hour: int = Field(12, ge=0, le=23)
    day_of_week: int = Field(3, ge=0, le=6)
    is_weekend: int = Field(0, ge=0, le=1)
    location: str = Field("UK", description="Location for grid intensity (UK, India, California)")
    vehicle_type: str = Field("petrol_car", description="Vehicle type for transport")
    start_lat: Optional[float] = None
    start_lon: Optional[float] = None
    end_lat: Optional[float] = None
    end_lon: Optional[float] = None

@app.post("/predict")
async def predict(request: PredictRequest):
    domain = request.domain
    
    if domain == "transport" and request.distance_km is None:
        raise HTTPException(400, "distance_km required")
    if domain == "energy" and request.kwh is None:
        raise HTTPException(400, "kwh required")
    
    # Context holders
    grid_context = None
    weather_context = None
    traffic_context = None

    if domain == "transport":
        # Fetch weather for transport efficiency
        weather_context = grid_service.get_weather(request.location)

        start_coords = None
        end_coords = None
        
        # ALWAYS prefer user-provided coordinates if available
        if request.start_lat and request.start_lon and request.end_lat and request.end_lon:
            start_coords = (request.start_lat, request.start_lon)
            end_coords = (request.end_lat, request.end_lon)
            print(f"🗺️ Using user-provided coordinates: {start_coords} → {end_coords}")
        else:
            # No coordinates - use time-based estimation only
            print(f"⚠️ No route coordinates provided - using time-based traffic estimation for {request.location}")
            start_coords = None
            end_coords = None

        print(f"🚗 Getting traffic for route: {start_coords} → {end_coords}")

        traffic_context = traffic_service.get_traffic_impact(
            distance_km=request.distance_km,
            location=request.location,
            start_coords=start_coords,
            end_coords=end_coords
        )

        print(
            f"🚦 Traffic: {traffic_context.get('condition', 'Unknown')}, "
            f"method: {traffic_context.get('method', 'Unknown')}"
        )

    if domain == "energy":
        grid_context = grid_service.get_intensity(
            location=request.location,
            hour=request.hour,
            is_weekend=bool(request.is_weekend)
        )
        # Add weather data
        weather_context = grid_service.get_weather(request.location)

    if domain == "transport":
        feature_names = ['distance_km', 'hour', 'day_of_week', 'is_weekend']
        features = [request.distance_km, request.hour, request.day_of_week, request.is_weekend]
    else:
        feature_names = ['kWh', 'hour', 'day_of_week', 'is_weekend']
        features = [request.kwh, request.hour, request.day_of_week, request.is_weekend]

    X = pd.DataFrame([features], columns=feature_names)

    results = {}
    shap_values_result = {}

    # ---------------- MODEL PREDICTIONS ----------------
    for model_name, model in models.get(domain, {}).items():
        try:
            if model_name == "bayesian":
                pred, std = model.predict(X, return_std=True)
                base_pred = float(pred[0])

                adjustment = 1.0

                # Adjust for vehicle type (transport only)
                if domain == "transport":
                    vehicle_factor = VEHICLE_EMISSION_FACTORS.get(
                        request.vehicle_type, 0.170
                    )
                    default_factor = 0.150  # training baseline
                    adjustment = vehicle_factor / default_factor
                    base_pred *= adjustment

                results[model_name] = {
                    "mean": base_pred,
                    "std": float(std[0]) * adjustment,
                    "ci_lower": float((pred[0] - 1.96 * std[0]) * adjustment),
                    "ci_upper": float((pred[0] + 1.96 * std[0]) * adjustment)
                }

            else:
                pred = model.predict(X)[0]

                # Adjust for vehicle type (transport only)
                if domain == "transport":
                    vehicle_factor = VEHICLE_EMISSION_FACTORS.get(
                        request.vehicle_type, 0.170
                    )
                    default_factor = 0.150
                    adjustment = vehicle_factor / default_factor
                    pred *= adjustment

                results[model_name] = {"mean": float(pred)}

            # SHAP explainability
            if model_name in ["rf", "xgb"] and model_name in explainers.get(domain, {}):
                try:
                    explainer = explainers[domain][model_name]
                    shap_values = explainer.shap_values(X)

                    if isinstance(shap_values, list):
                        shap_values = shap_values[0]

                    base_value = explainer.expected_value
                    if isinstance(base_value, list):
                        base_value = base_value[0]

                    feature_importance = []
                    for i, feature_name in enumerate(feature_names):
                        feature_importance.append({
                            "feature": feature_name,
                            "value": float(features[i]),
                            "shap_value": float(shap_values[0][i]),
                            "contribution": float(shap_values[0][i])
                        })

                    feature_importance.sort(
                        key=lambda x: abs(x["shap_value"]),
                        reverse=True
                    )

                    shap_values_result[model_name] = {
                        "base_value": float(base_value),
                        "prediction": float(pred),
                        "feature_importance": feature_importance,
                        "explanation": generate_explanation(feature_importance, domain)
                    }

                except Exception as e:
                    print(f"SHAP calculation error for {model_name}: {e}")
                    shap_values_result[model_name] = {"error": str(e)}

        except Exception as e:
            results[model_name] = {"error": str(e)}

    if domain == "energy" and grid_context and "bayesian" in results and "mean" in results["bayesian"]:
        static_intensity = 400
        live_intensity = grid_context["intensity_gco2_kwh"]
        adjustment_factor = live_intensity / static_intensity

        weather_adjustment = 1.0
        if weather_context and weather_context.get("success"):
            impact_score = weather_context["impact"]["score"]
            weather_adjustment = 1.0 + (impact_score / 100.0)

        final_adjustment = adjustment_factor * weather_adjustment

        results["context_aware"] = {
            "mean": results["bayesian"]["mean"] * final_adjustment,
            "ci_lower": results["bayesian"]["ci_lower"] * final_adjustment,
            "ci_upper": results["bayesian"]["ci_upper"] * final_adjustment,
            "description": "Adjusted using real-time grid intensity and weather conditions",
            "adjustments": {
                "grid_factor": round(adjustment_factor, 3),
                "weather_factor": round(weather_adjustment, 3),
                "total_factor": round(final_adjustment, 3)
            }
        }

    if domain == "transport" and "rf" in results and "mean" in results["rf"]:
        base_prediction = results["rf"]["mean"]

        traffic_multiplier = 1.0
        if traffic_context and traffic_context.get("success"):
            traffic_multiplier = traffic_context.get("emission_multiplier", 1.0)

        weather_multiplier = 1.0
        if weather_context and weather_context.get("success"):
            temp = weather_context.get("temperature", 20)
            condition = weather_context.get("condition", "Clear")
            wind_speed = weather_context.get("wind_speed", 0)

            if temp < 0:
                weather_multiplier += 0.25
            elif temp < 10:
                weather_multiplier += 0.15
            elif temp > 32:
                weather_multiplier += 0.20
            elif temp > 28:
                weather_multiplier += 0.10

            if wind_speed > 10:
                weather_multiplier += 0.08
            elif wind_speed > 7:
                weather_multiplier += 0.05

            if condition in ["Rain", "Snow", "Drizzle"]:
                weather_multiplier += 0.10

        final_multiplier = traffic_multiplier * weather_multiplier

        results["context_aware"] = {
            "mean": base_prediction * final_multiplier,
            "description": "Adjusted for real-time traffic and weather conditions",
            "adjustments": {
                "traffic_multiplier": round(traffic_multiplier, 3),
                "weather_multiplier": round(weather_multiplier, 3),
                "total_multiplier": round(final_multiplier, 3)
            },
            "base_emissions": base_prediction
        }

        # Keep existing traffic-only output (backward compatible)
        results["traffic_aware"] = {
            "mean": base_prediction * traffic_multiplier,
            "description": "Adjusted for real-time traffic conditions",
            "traffic_multiplier": traffic_multiplier,
            "base_emissions": base_prediction
        }

    context_score = calculate_context_score(
        domain=domain,
        traffic_context=traffic_context,
        weather_context=weather_context,
        grid_context=grid_context,
        hour=request.hour,
        is_weekend=request.is_weekend
    )

    response = {
        "status": "success",
        "domain": domain,
        "predictions": results,
        "models_used": list(results.keys()),
        "explainability": shap_values_result,
        "context_score": context_score
    }

    if grid_context:
        response["grid_context"] = {
            "intensity_gco2_kwh": grid_context["intensity_gco2_kwh"],
            "source": grid_context["source"],
            "location": grid_context["location"],
            "confidence": grid_context["confidence"],
            "method": grid_context["method"],
            "timestamp": grid_context["timestamp"]
        }

        if domain == "energy":
            comparison = grid_service.compare_live_vs_static(request.location)
            response["grid_context"]["comparison"] = {
                "static_average": comparison["static_average"],
                "difference_percent": comparison["difference_percent"],
                "message": comparison["message"]
            }

    if weather_context and weather_context.get("success"):
        response["weather_context"] = weather_context

    if traffic_context and traffic_context.get("success"):
        response["traffic_context"] = traffic_context

    return response


def generate_explanation(feature_importance: list, domain: str) -> str:
    """Generate human-readable explanation of SHAP values"""
    
    top_feature = feature_importance[0]
    second_feature = feature_importance[1] if len(feature_importance) > 1 else None
    
    explanation_parts = []
    
    # Main contributor
    feature_name = top_feature["feature"]
    contribution = top_feature["shap_value"]
    value = top_feature["value"]
    
    if domain == "transport":
        if feature_name == "distance_km":
            explanation_parts.append(
                f"Distance ({value:.1f} km) is the primary factor, contributing {abs(contribution):.3f} kg CO₂"
            )
        elif feature_name == "hour":
            time_desc = "rush hour" if 7 <= value <= 9 or 17 <= value <= 19 else "off-peak"
            explanation_parts.append(
                f"Time of day ({int(value)}:00, {time_desc}) contributes {abs(contribution):.3f} kg CO₂"
            )
    else:  # energy
        if feature_name == "kWh":
            explanation_parts.append(
                f"Energy consumption ({value:.1f} kWh) is the main factor, contributing {abs(contribution):.3f} kg CO₂"
            )
        elif feature_name == "hour":
            if 9 <= value <= 17:
                time_desc = "daytime (cleaner grid from solar)"
            elif 18 <= value <= 21:
                time_desc = "evening peak (dirtier grid)"
            else:
                time_desc = "night (moderate grid intensity)"
            
            effect = "reducing" if contribution < 0 else "adding"
            explanation_parts.append(
                f"Time ({int(value)}:00, {time_desc}) is {effect} {abs(contribution):.3f} kg CO₂"
            )
    
    # Secondary contributor
    if second_feature:
        feature_name = second_feature["feature"]
        contribution = second_feature["shap_value"]
        value = second_feature["value"]
        
        if feature_name == "is_weekend":
            day_type = "weekend" if value == 1 else "weekday"
            effect = "reduces" if contribution < 0 else "increases"
            explanation_parts.append(
                f"{day_type.capitalize()} {effect} emissions by {abs(contribution):.3f} kg CO₂"
            )
        elif feature_name == "day_of_week":
            days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            day_name = days[int(value)]
            explanation_parts.append(
                f"{day_name} contributes {abs(contribution):.3f} kg CO₂"
            )
    
    return ". ".join(explanation_parts) + "."


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models_loaded": {d: len(models[d]) for d in valid_domains},
        "explainers_loaded": {d: len(explainers[d]) for d in valid_domains},
        "grid_service": "active",
        "features": [
            "Real-time UK grid intensity (Carbon Intensity API)",
            "Real-time California grid (WattTime/ElectricityMaps)",
            "Temporal modeling for India",
            "Context-aware emission adjustments",
            "Uncertainty quantification (Bayesian)",
            "SHAP explainability (RF, XGBoost)"
        ]
    }

@app.post("/optimize")
async def optimize_timing(request: PredictRequest):
    """Get optimal timing recommendations for the next 24 hours"""
    
    domain = request.domain
    
    if domain == "transport" and request.distance_km is None:
        raise HTTPException(400, "distance_km required")
    if domain == "energy" and request.kwh is None:
        raise HTTPException(400, "kwh required")
    
    try:
        optimization = optimization_service.get_optimal_times(
            domain=domain,
            location=request.location,
            distance_km=request.distance_km if domain == "transport" else None,
            kwh=request.kwh if domain == "energy" else None,
            vehicle_type=request.vehicle_type if domain == "transport" else "petrol_car"
        )
        
        return {
            "status": "success",
            "domain": domain,
            "optimization": optimization
        }
    except Exception as e:
        raise HTTPException(500, f"Optimization failed: {str(e)}")

def calculate_context_score(
    domain: str,
    traffic_context: Optional[Dict],
    weather_context: Optional[Dict],
    grid_context: Optional[Dict],
    hour: int,
    is_weekend: int
) -> Dict:
    """
    Calculate unified context score combining all factors
    Score: 0-100 (0 = worst conditions, 100 = best conditions for low emissions)
    """
    
    score = 50  # Start neutral
    factors = []
    weights = {}
    
    if domain == "transport":
        # Traffic Score (40% weight)
        if traffic_context and traffic_context.get("success"):
            traffic_multiplier = traffic_context.get("emission_multiplier", 1.0)
            if traffic_multiplier >= 1.8:
                traffic_score = 0
                factors.append("🚨 Severe traffic congestion (-40)")
            elif traffic_multiplier >= 1.5:
                traffic_score = -30
                factors.append("⚠️ Heavy traffic (-30)")
            elif traffic_multiplier >= 1.3:
                traffic_score = -15
                factors.append("🟡 Moderate traffic (-15)")
            elif traffic_multiplier >= 1.1:
                traffic_score = -5
                factors.append("🟢 Light traffic (-5)")
            else:
                traffic_score = 10
                factors.append("✅ Free-flowing traffic (+10)")
            
            score += traffic_score
            weights["traffic"] = abs(traffic_score)
        
        # Weather Score (30% weight)
        if weather_context and weather_context.get("success"):
            temp = weather_context.get("temperature", 20)
            condition = weather_context.get("condition", "Clear")
            
            if temp < 0:
                weather_score = -25
                factors.append("❄️ Freezing temps reduce efficiency (-25)")
            elif temp < 10:
                weather_score = -15
                factors.append("🥶 Cold weather impact (-15)")
            elif temp > 32:
                weather_score = -20
                factors.append("🥵 Extreme heat (AC usage) (-20)")
            elif temp > 28:
                weather_score = -10
                factors.append("☀️ Hot weather (AC) (-10)")
            elif 18 <= temp <= 24:
                weather_score = 5
                factors.append("🌤️ Ideal temperature (+5)")
            else:
                weather_score = 0
            
            if condition in ["Rain", "Snow"]:
                weather_score -= 10
                factors.append(f"🌧️ {condition} reduces efficiency (-10)")
            
            score += weather_score
            weights["weather"] = abs(weather_score)
        
        # Time Score (30% weight)
        if 7 <= hour <= 9 or 17 <= hour <= 19:
            time_score = -20
            factors.append("⏰ Rush hour timing (-20)")
        elif 22 <= hour or hour <= 5:
            time_score = 15
            factors.append("🌙 Off-peak hours (+15)")
        elif is_weekend:
            time_score = 10
            factors.append("📅 Weekend travel (+10)")
        else:
            time_score = 0
        
        score += time_score
        weights["time"] = abs(time_score)
        
    else:  # energy
        # Grid Intensity Score (50% weight)
        if grid_context and grid_context.get("intensity_gco2_kwh"):
            intensity = grid_context["intensity_gco2_kwh"]
            
            if intensity < 100:
                grid_score = 30
                factors.append("🌱 Very clean grid (<100 gCO₂/kWh) (+30)")
            elif intensity < 200:
                grid_score = 20
                factors.append("✅ Clean grid (<200 gCO₂/kWh) (+20)")
            elif intensity < 300:
                grid_score = 10
                factors.append("🟢 Moderately clean grid (+10)")
            elif intensity < 400:
                grid_score = 0
                factors.append("🟡 Average grid intensity (0)")
            elif intensity < 500:
                grid_score = -15
                factors.append("🟠 Dirty grid (-15)")
            else:
                grid_score = -30
                factors.append("🔴 Very dirty grid (>500 gCO₂/kWh) (-30)")
            
            score += grid_score
            weights["grid"] = abs(grid_score)
        
        # Weather/Renewable Score (30% weight)
        if weather_context and weather_context.get("success"):
            temp = weather_context.get("temperature", 20)
            clouds = weather_context.get("clouds", 50)
            wind_speed = weather_context.get("wind_speed", 0)
            
            weather_score = 0
            
            # Temperature (HVAC demand)
            if temp < 10:
                weather_score -= 15
                factors.append("🥶 Cold increases heating demand (-15)")
            elif temp > 28:
                weather_score -= 20
                factors.append("🥵 Heat increases cooling demand (-20)")
            elif 18 <= temp <= 22:
                weather_score += 10
                factors.append("🌤️ Mild weather reduces HVAC (+10)")
            
            # Solar generation
            if clouds < 30:
                weather_score += 5
                factors.append("☀️ Clear skies boost solar (+5)")
            
            # Wind generation
            if wind_speed > 7:
                weather_score += 8
                factors.append("💨 High winds boost wind power (+8)")
            
            score += weather_score
            weights["weather"] = abs(weather_score)
        
        # Time Score (20% weight)
        if 9 <= hour <= 17:
            time_score = 10
            factors.append("☀️ Daytime solar generation (+10)")
        elif 18 <= hour <= 21:
            time_score = -20
            factors.append("⚡ Evening peak demand (-20)")
        elif 22 <= hour or hour <= 5:
            time_score = 5
            factors.append("🌙 Night (wind power) (+5)")
        else:
            time_score = 0
        
        if is_weekend:
            time_score += 10
            factors.append("📅 Weekend (lower demand) (+10)")
        
        score += time_score
        weights["time"] = abs(time_score)
    
    # Normalize score to 0-100
    score = max(0, min(100, score))
    
    # Determine rating
    if score >= 80:
        rating = "Excellent"
        rating_emoji = "🌟"
        rating_color = "green"
        message = "Optimal conditions for low emissions!"
    elif score >= 65:
        rating = "Good"
        rating_emoji = "✅"
        rating_color = "lime"
        message = "Favorable conditions for reduced emissions."
    elif score >= 50:
        rating = "Fair"
        rating_emoji = "🟡"
        rating_color = "yellow"
        message = "Average conditions - emissions as expected."
    elif score >= 35:
        rating = "Poor"
        rating_emoji = "🟠"
        rating_color = "orange"
        message = "Unfavorable conditions increasing emissions."
    else:
        rating = "Very Poor"
        rating_emoji = "🔴"
        rating_color = "red"
        message = "High-emission conditions. Consider delaying if possible."
    
    return {
        "score": round(score, 1),
        "rating": rating,
        "rating_emoji": rating_emoji,
        "rating_color": rating_color,
        "message": message,
        "factors": factors,
        "weights": weights,
        "breakdown": {
            "traffic": weights.get("traffic", 0) if domain == "transport" else None,
            "weather": weights.get("weather", 0),
            "grid": weights.get("grid", 0) if domain == "energy" else None,
            "time": weights.get("time", 0)
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)