from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import numpy as np
import pandas as pd  # Add pandas
from pathlib import Path
from typing import Literal, Optional
import uvicorn

# Import the grid service
import sys
sys.path.append(str(Path(__file__).parent))
from grid_service import get_grid_service

app = FastAPI(title="CarbonSense API v2.0 - Context-Aware")

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
valid_domains = ["transport", "energy"]

# Load models with error handling
for domain in valid_domains:
    models[domain] = {}
    for model_name in ["linear", "rf", "xgb", "bayesian"]:
        model_path = MODELS_DIR / f"{domain}_{model_name}.joblib"
        if model_path.exists():
            models[domain][model_name] = joblib.load(model_path)
            print(f"✅ Loaded {domain}_{model_name}")
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
    
    # Get real-time grid intensity for energy domain
    grid_context = None
    if domain == "energy":
        grid_context = grid_service.get_intensity(
            location=request.location,
            hour=request.hour,
            is_weekend=bool(request.is_weekend)
        )
    
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
        except Exception as e:
            results[model_name] = {"error": str(e)}
    
    # Add context-aware adjustment for energy
    print(f"DEBUG results: {results}")
    if domain == "energy" and grid_context and "bayesian" in results and "mean" in results["bayesian"]:
        # Calculate adjusted emissions using real-time grid intensity
        static_intensity = 400  # Default used in training (gCO2/kWh)
        live_intensity = grid_context["intensity_gco2_kwh"]
        
        # Adjust predictions based on live vs static grid
        adjustment_factor = live_intensity / static_intensity
        
        results["context_aware"] = {
            "mean": results["bayesian"]["mean"] * adjustment_factor,
            "ci_lower": results["bayesian"]["ci_lower"] * adjustment_factor,
            "ci_upper": results["bayesian"]["ci_upper"] * adjustment_factor,
            "description": "Adjusted using real-time grid intensity"
        }
    
    # Build response
    response = {
        "status": "success",
        "domain": domain,
        "predictions": results,
        "models_used": list(results.keys())
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
        print(f"DEBUG response grid_context: {response.get('grid_context')}")
        
        # Add comparison message
        if domain == "energy":
            comparison = grid_service.compare_live_vs_static(request.location)
            response["grid_context"]["comparison"] = {
                "static_average": comparison["static_average"],
                "difference_percent": comparison["difference_percent"],
                "message": comparison["message"]
            }
    print(f"DEBUG FULL RESPONSE: {response}")
    return response


@app.get("/grid-intensity/{location}")
async def get_grid_intensity(
    location: str = "UK",
    hour: Optional[int] = None,
    is_weekend: bool = False
):
    """
    Get current grid carbon intensity for a location.
    
    Supported locations: UK, California, India
    """
    try:
        result = grid_service.get_intensity(location, hour, is_weekend)
        comparison = grid_service.compare_live_vs_static(location)
        
        return {
            "status": "success",
            "location": location,
            "intensity": result,
            "comparison": comparison
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models_loaded": {d: len(models[d]) for d in valid_domains},
        "grid_service": "active",
        "features": [
            "Real-time UK grid intensity (Carbon Intensity API)",
            "Real-time California grid (WattTime/ElectricityMaps)",
            "Temporal modeling for India",
            "Context-aware emission adjustments",
            "Uncertainty quantification (Bayesian)"
        ]
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)