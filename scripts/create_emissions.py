from pathlib import Path
import pandas as pd
import numpy as np

DATA_DIR = Path("data")
PROCESSED_DIR = DATA_DIR / "processed"
EMISSIONS_DIR = PROCESSED_DIR / "emissions"
EMISSIONS_DIR.mkdir(parents=True, exist_ok=True)


def defra_transport_emissions(distance_km: float, mode: str = "car") -> float:
    factors = {"car": 0.19, "bus": 0.10, "bike": 0.00, "walk": 0.00, "unknown": 0.15}
    return distance_km * factors.get(mode, 0.15)


def defra_energy_emissions(kwh: float, grid_intensity_g_per_kwh: float = 400) -> float:
    return (kwh * grid_intensity_g_per_kwh) / 1000.0


def add_temporal_features(df: pd.DataFrame, time_col: str) -> pd.DataFrame:
    """Add hour, day_of_week, is_weekend (robust datetime parsing)."""
    # Force parse datetime with multiple formats
    df[time_col] = pd.to_datetime(df[time_col], errors='coerce', infer_datetime_format=True)
    
    # For any remaining NaT, use median time (noon Thursday)
    valid_mask = df[time_col].notna()
    df.loc[valid_mask, "hour"] = df.loc[valid_mask, time_col].dt.hour
    df.loc[~valid_mask, "hour"] = 12  # Noon fallback
    
    df.loc[valid_mask, "day_of_week"] = df.loc[valid_mask, time_col].dt.dayofweek
    df.loc[~valid_mask, "day_of_week"] = 3  # Thursday fallback
    
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    
    # Ensure numeric
    df["hour"] = df["hour"].astype(int)
    df["day_of_week"] = df["day_of_week"].astype(int)
    
    print(f"  Temporal features: {valid_mask.sum()} valid times, {(~valid_mask).sum()} imputed")
    return df


def create_transport_emissions() -> pd.DataFrame:
    print("📦 Loading GeoLife trips...")
    trips = pd.read_parquet(PROCESSED_DIR / "geolife_trips.parquet")
    
    print(f"  → {len(trips):,} trips, avg {trips['distance_km'].mean():.2f} km")
    print(f"  Raw start_time sample: {trips['start_time'].head()}")
    
    # Add emissions
    trips["emission_kg"] = trips.apply(
        lambda row: defra_transport_emissions(row["distance_km"], row["mode"]), axis=1
    )
    
    # Filter zero-distance
    trips = trips[trips["distance_km"] > 0].copy()
    
    # Fix temporal features
    trips = add_temporal_features(trips, "start_time")
    
    feature_cols = ["distance_km", "hour", "day_of_week", "is_weekend"]
    
    out_path = EMISSIONS_DIR / "transport_emissions.parquet"
    trips.to_parquet(out_path, index=False)
    
    print(f"✅ Transport: {len(trips):,} trips")
    print(f"   Temporal sample: {trips[['hour', 'day_of_week']].head()}")
    return trips


def create_energy_emissions() -> pd.DataFrame:
    print("📦 Loading UK Smart Meter data...")
    energy = pd.read_parquet(PROCESSED_DIR / "uk_energy_hourly.parquet")
    
    print(f"  → {len(energy):,} hourly records, avg {energy['kWh'].mean():.3f} kWh")
    
    energy = energy[energy["kWh"] > 0].copy()
    energy["emission_kg"] = energy["kWh"].apply(
        lambda kwh: defra_energy_emissions(kwh, grid_intensity_g_per_kwh=400)
    )
    
    energy = add_temporal_features(energy, "timestamp")
    
    feature_cols = ["kWh", "hour", "day_of_week", "is_weekend"]
    
    out_path = EMISSIONS_DIR / "energy_emissions.parquet"
    energy.to_parquet(out_path, index=False)
    
    print(f"✅ Energy: {len(energy):,} hourly records")
    return energy


def main():
    print("=== 🚀 CarbonSense Phase 2: FIXED Emissions (Temporal Parsing) ===")
    transport = create_transport_emissions()
    energy = create_energy_emissions()
    
    print(f"\n🎯 ML-Ready Datasets:")
    print(f"  Transport features OK: {transport[['hour', 'day_of_week']].notna().all().all()}")
    print(f"  Energy features OK:    {energy[['hour', 'day_of_week']].notna().all().all()}")


if __name__ == "__main__":
    main()
