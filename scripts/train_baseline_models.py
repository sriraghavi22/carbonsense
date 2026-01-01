from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_percentage_error, r2_score
from sklearn.impute import SimpleImputer
import xgboost as xgb
import joblib

DATA_DIR = Path("data")
EMISSIONS_DIR = DATA_DIR / "processed" / "emissions"
MODELS_DIR = DATA_DIR / "processed" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def prepare_features(df: pd.DataFrame, domain: str) -> tuple:
    """Prepare X, y for ML training (with NaN handling)."""
    if domain == "transport":
        feature_cols = ["distance_km", "hour", "day_of_week", "is_weekend"]
    elif domain == "energy":
        feature_cols = ["kWh", "hour", "day_of_week", "is_weekend"]
    else:
        raise ValueError("Domain must be 'transport' or 'energy'")
    
    X = df[feature_cols].copy()
    y = df["emission_kg"].copy()
    
    # Remove rows with NaN features OR NaN target
    mask = ~(X.isna().any(axis=1) | y.isna())
    X_clean = X[mask]
    y_clean = y[mask]
    
    print(f"  → Raw: {len(X):,} rows → Clean: {len(X_clean):,} rows ({100*len(X_clean)/len(X):.1f}%)")
    
    # Split (80/10/10)
    X_temp, X_test, y_temp, y_test = train_test_split(X_clean, y_clean, test_size=0.2, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(X_temp, y_temp, test_size=0.125, random_state=42)
    
    print(f"  → Train: {len(X_train):,}, Val: {len(X_val):,}, Test: {len(X_test):,}")
    return (X_train, X_val, X_test, y_train, y_val, y_test), feature_cols


def train_models(X_train, X_val, X_test, y_train, y_val, y_test, domain: str, feature_cols: list):
    """Train Linear, RF, XGBoost models."""
    models = {}
    results = {}
    
    # 1. Linear Regression (baseline)
    lr = LinearRegression()
    lr.fit(X_train, y_train)
    models["linear"] = lr
    results["linear"] = evaluate_model(lr, X_val, y_val, X_test, y_test)
    
    # 2. Random Forest
    rf = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)
    models["rf"] = rf
    results["rf"] = evaluate_model(rf, X_val, y_val, X_test, y_test)
    
    # 3. XGBoost
    xgb_model = xgb.XGBRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    xgb_model.fit(X_train, y_train)
    models["xgb"] = xgb_model
    results["xgb"] = evaluate_model(xgb_model, X_val, y_val, X_test, y_test)
    
    print(f"  ✅ {domain}: Linear + RF + XGBoost trained")
    return models, results


def evaluate_model(model, X_val, y_val, X_test, y_test):
    """Compute RMSE, MAPE, R²."""
    val_pred = model.predict(X_val)
    test_pred = model.predict(X_test)
    
    return {
        "val_rmse": np.sqrt(mean_squared_error(y_val, val_pred)),
        "test_rmse": np.sqrt(mean_squared_error(y_test, test_pred)),
        "test_mape": mean_absolute_percentage_error(y_test, test_pred),
        "test_r2": r2_score(y_test, test_pred)
    }


def save_models(models, feature_cols, domain: str):
    """Save trained models."""
    for name, model in models.items():
        joblib.dump(model, MODELS_DIR / f"{domain}_{name}.joblib")
        print(f"  💾 Saved {domain}_{name}.joblib")


def print_results(results: dict, domain: str):
    """Pretty print evaluation results."""
    print(f"\n📊 {domain.upper()} Model Performance (Test Set):")
    print("Model     | RMSE      | MAPE     | R²")
    print("-" * 40)
    for model_name, metrics in results.items():
        print(f"{model_name:8} | {metrics['test_rmse']:9.4f} | "
              f"{metrics['test_mape']:8.1%} | {metrics['test_r2']:6.3f}")


def main():
    print("=== 🚀 CarbonSense Phase 3: Train Baseline Models ===")
    
    # 1. Transport models
    print("\n🚗 TRANSPORT MODELS")
    transport_data = pd.read_parquet(EMISSIONS_DIR / "transport_emissions.parquet")
    (X_train, X_val, X_test, y_train, y_val, y_test), feature_cols_t = prepare_features(transport_data, "transport")
    models_t, results_t = train_models(X_train, X_val, X_test, y_train, y_val, y_test, "transport", feature_cols_t)
    save_models(models_t, feature_cols_t, "transport")
    print_results(results_t, "transport")
    
    # 2. Energy models
    print("\n⚡ ENERGY MODELS")
    energy_data = pd.read_parquet(EMISSIONS_DIR / "energy_emissions.parquet")
    (X_train, X_val, X_test, y_train, y_val, y_test), feature_cols_e = prepare_features(energy_data, "energy")
    models_e, results_e = train_models(X_train, X_val, X_test, y_train, y_val, y_test, "energy", feature_cols_e)
    save_models(models_e, feature_cols_e, "energy")
    print_results(results_e, "energy")
    
    print(f"\n✅ Phase 3 COMPLETE! Models saved to {MODELS_DIR}")
    print("Next: Phase 4 → Bayesian Uncertainty + SHAP Explainability")


if __name__ == "__main__":
    main()
