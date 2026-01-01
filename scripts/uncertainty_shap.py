from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.linear_model import BayesianRidge
import shap
import joblib
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt

DATA_DIR = Path("data")
MODELS_DIR = DATA_DIR / "processed" / "models"
EMISSIONS_DIR = DATA_DIR / "processed" / "emissions"
UNCERTAINTY_DIR = DATA_DIR / "processed" / "uncertainty"
UNCERTAINTY_DIR.mkdir(parents=True, exist_ok=True)


def train_bayesian_models(domain: str):
    """Train Bayesian Ridge for uncertainty quantification."""
    if domain == "transport":
        data = pd.read_parquet(EMISSIONS_DIR / "transport_emissions.parquet")
        features = ["distance_km", "hour", "day_of_week", "is_weekend"]
    else:
        data = pd.read_parquet(EMISSIONS_DIR / "energy_emissions.parquet")
        features = ["kWh", "hour", "day_of_week", "is_weekend"]
    
    X = data[features]
    y = data["emission_kg"]
    
    # Train Bayesian Ridge
    bayes = BayesianRidge()
    bayes.fit(X, y)
    
    # Save model
    joblib.dump(bayes, MODELS_DIR / f"{domain}_bayesian.joblib")
    
    # Generate predictions with uncertainty
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    pred_mean, pred_std = bayes.predict(X_test, return_std=True)
    
    ci_lower = pred_mean - 1.96 * pred_std
    ci_upper = pred_mean + 1.96 * pred_std
    
    coverage = np.mean((y_test >= ci_lower) & (y_test <= ci_upper))
    
    print(f"\n🔬 {domain.upper()} BAYESIAN RESULTS:")
    print(f"  95% CI Coverage: {coverage:.1%}")
    print(f"  Mean uncertainty: {pred_std.mean():.4f}")
    
    return bayes, X_test.iloc[:100], features


def shap_analysis(model, X_sample, features, domain: str):
    """Generate SHAP explanations (fixed for new SHAP)."""
    if "xgb" in str(type(model)).lower():
        explainer = shap.TreeExplainer(model)
    else:
        explainer = shap.Explainer(model)
    
    shap_values = explainer(X_sample)
    
    # Save SHAP summary plot
    plt.figure()
    shap.plots.bar(shap_values, show=False)
    plt.title(f"{domain.upper()} SHAP Feature Importance")
    plt.tight_layout()
    plt.savefig(UNCERTAINTY_DIR / f"{domain}_shap_bar.png", dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"  📈 SHAP bar plot saved: {domain}_shap_bar.png")
    
    # Save SHAP summary data
    joblib.dump(shap_values, UNCERTAINTY_DIR / f"{domain}_shap_values.joblib")
    print(f"  💾 SHAP values saved: {domain}_shap_values.joblib")


def main():
    print("=== 🚀 CarbonSense Phase 4: Uncertainty + Explainability ===")
    
    # 1. Bayesian Uncertainty
    print("\n🎲 Training Bayesian Models...")
    transport_bayes, transport_sample, transport_features = train_bayesian_models("transport")
    energy_bayes, energy_sample, energy_features = train_bayesian_models("energy")
    
    # 2. SHAP Explainability (on XGBoost models)
    print("\n🔍 Generating SHAP Explanations...")
    transport_xgb = joblib.load(MODELS_DIR / "transport_xgb.joblib")
    energy_xgb = joblib.load(MODELS_DIR / "energy_xgb.joblib")
    
    shap_analysis(transport_xgb, transport_sample, transport_features, "transport")
    shap_analysis(energy_xgb, energy_sample, energy_features, "energy")
    
    print(f"\n✅ Phase 4 COMPLETE!")
    print(f"   Models: data/processed/models/*_bayesian.joblib")
    print(f"   SHAP:  data/processed/uncertainty/*_shap_bar.png")
    print("Next: Phase 5 → FastAPI Backend!")


if __name__ == "__main__":
    main()
