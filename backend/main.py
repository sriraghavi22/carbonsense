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


class PredictRequest(BaseModel):
    domain: Literal["transport", "energy"]
    distance_km: float = Field(None, ge=0)
    kwh: float = Field(None, ge=0)
    hour: int = Field(12, ge=0, le=23)
    day_of_week: int = Field(3, ge=0, le=6)
    is_weekend: int = Field(0, ge=0, le=1)
    location: str = Field("UK", description="Location for grid intensity (UK, India, California)")


@app.post("/predict")
async def predict(request: PredictRequest):
    domain = request.domain
    
    if domain == "transport" and request.distance_km is None:
        raise HTTPException(400, "distance_km required")
    if domain == "energy" and request.kwh is None:
        raise HTTPException(400, "kwh required")
    
    # Get real-time grid intensity and weather for energy domain
    grid_context = None
    weather_context = None
    if domain == "energy":
        grid_context = grid_service.get_intensity(
            location=request.location,
            hour=request.hour,
            is_weekend=bool(request.is_weekend)
        )
        # Add weather data
        weather_context = grid_service.get_weather(request.location)
    
    # Prepare features with proper column names
    if domain == "transport":
        feature_names = ['distance_km', 'hour', 'day_of_week', 'is_weekend']
        features = [request.distance_km, request.hour, request.day_of_week, request.is_weekend]
    else:
        feature_names = ['kWh', 'hour', 'day_of_week', 'is_weekend']
        features = [request.kwh, request.hour, request.day_of_week, request.is_weekend]
    
    # Use pandas DataFrame to preserve feature names
    X = pd.DataFrame([features], columns=feature_names)
    results = {}
    shap_values_result = {}
    
    # Get predictions from all models
    for model_name, model in models.get(domain, {}).items():
        try:
            if model_name == "bayesian":
                pred, std = model.predict(X, return_std=True)
                results[model_name] = {
                    "mean": float(pred[0]),
                    "std": float(std[0]),
                    "ci_lower": float(pred[0] - 1.96*std[0]),
                    "ci_upper": float(pred[0] + 1.96*std[0])
                }
            else:
                pred = model.predict(X)[0]
                results[model_name] = {"mean": float(pred)}
            
            # Generate SHAP values for tree models
            if model_name in ["rf", "xgb"] and model_name in explainers.get(domain, {}):
                try:
                    explainer = explainers[domain][model_name]
                    shap_values = explainer.shap_values(X)
                    
                    # For regression, shap_values is 1D array
                    if isinstance(shap_values, list):
                        shap_values = shap_values[0]
                    
                    # Get base value (expected value)
                    base_value = explainer.expected_value
                    if isinstance(base_value, list):
                        base_value = base_value[0]
                    
                    # Create feature importance data
                    feature_importance = []
                    for i, feature_name in enumerate(feature_names):
                        feature_importance.append({
                            "feature": feature_name,
                            "value": float(features[i]),
                            "shap_value": float(shap_values[0][i]),
                            "contribution": float(shap_values[0][i])
                        })
                    
                    # Sort by absolute contribution
                    feature_importance.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
                    
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
    
    # Add context-aware adjustment for energy
    if domain == "energy" and grid_context and "bayesian" in results and "mean" in results["bayesian"]:
        # Calculate adjusted emissions using real-time grid intensity
        static_intensity = 400  # Default used in training (gCO2/kWh)
        live_intensity = grid_context["intensity_gco2_kwh"]
        
        # Adjust predictions based on live vs static grid
        adjustment_factor = live_intensity / static_intensity
        
        # Apply weather impact if available
        weather_adjustment = 1.0
        if weather_context and weather_context.get("success"):
            # Apply weather impact score as percentage adjustment
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
    
    # Build response
    response = {
        "status": "success",
        "domain": domain,
        "predictions": results,
        "models_used": list(results.keys()),
        "explainability": shap_values_result
    }
    
    # Add grid context for energy
    if grid_context:
        response["grid_context"] = {
            "intensity_gco2_kwh": grid_context["intensity_gco2_kwh"],
            "source": grid_context["source"],
            "location": grid_context["location"],
            "confidence": grid_context["confidence"],
            "method": grid_context["method"],
            "timestamp": grid_context["timestamp"]
        }
        
        # Add comparison message
        if domain == "energy":
            comparison = grid_service.compare_live_vs_static(request.location)
            response["grid_context"]["comparison"] = {
                "static_average": comparison["static_average"],
                "difference_percent": comparison["difference_percent"],
                "message": comparison["message"]
            }
    
    # Add weather context
    if weather_context and weather_context.get("success"):
        response["weather_context"] = weather_context
    
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)