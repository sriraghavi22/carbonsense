from pathlib import Path
import pandas as pd

DATA_DIR = Path("data")
RAW_DIR = DATA_DIR / "raw" / "uk_smart_meter" / "halfhourly_dataset"
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def load_single_block(csv_path: Path) -> pd.DataFrame:
    """Load one block CSV with CORRECT London Smart Meter column mapping."""
    print(f"Loading {csv_path.name}...")
    df = pd.read_csv(csv_path)
    
    # EXACT column names from your CSV sample
    col_map = {
        "LCLid": "household_id",
        "tstp": "timestamp",      # ← This was the issue!
        "energy(kWh/hh)": "kWh"   # ← Exact name from your data
    }
    
    # Rename columns (only those that exist)
    available_cols = {k: v for k, v in col_map.items() if k in df.columns}
    df = df.rename(columns=available_cols)
    
    print(f"  Columns found: {list(df.columns)[:5]}...")  # Debug info
    
    # Convert types
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["household_id"] = df["household_id"].astype(str)
    df["kWh"] = pd.to_numeric(df["kWh"], errors="coerce")
    
    # Keep only required columns, drop invalid rows
    df = df[["household_id", "timestamp", "kWh"]].dropna(subset=["timestamp", "kWh"])
    
    print(f"  → {len(df):,} valid rows, {df['household_id'].nunique():,} households")
    return df


def resample_hourly(df: pd.DataFrame) -> pd.DataFrame:
    """Resample 30-min data to hourly totals per household."""
    print("Resampling to hourly...")
    df = df.set_index("timestamp")
    hourly = (
        df.groupby(["household_id", pd.Grouper(freq="1H")])["kWh"]
        .sum()
        .reset_index()
        .query("kWh > 0")  # Remove zero-consumption hours
        .sort_values(["household_id", "timestamp"])
    )
    print(f"  → {len(hourly):,} hourly rows")
    return hourly


def main():
    # Look for block files in any subfolder (handles halfhourly_dataset/block_X.csv)
    block_files = sorted(RAW_DIR.rglob("block_*.csv"))
    if not block_files:
        raise RuntimeError(f"No block_*.csv files in {RAW_DIR} or subfolders")
    
    print(f"Found {len(block_files)} block files")
    
    # TEMP: Process only first 10 blocks to test (remove later for full run)
    block_files = block_files[:10]  
    print(f"Processing first {len(block_files)} blocks for testing...")
    
    # Load all blocks
    all_dfs = []
    
    for block_file in block_files:
        block_df = load_single_block(block_file)
        all_dfs.append(block_df)
    
    # Concatenate all blocks
    raw_data = pd.concat(all_dfs, ignore_index=True)
    print(f"\nTotal raw data: {len(raw_data):,} rows, {raw_data['household_id'].nunique():,} households")
    
    # Resample to hourly
    hourly = resample_hourly(raw_data)
    
    # Save
    out_path = PROCESSED_DIR / "uk_energy_hourly.parquet"
    hourly.to_parquet(out_path, index=False)
    
    print(f"\n✅ Saved {len(hourly):,} hourly records to {out_path}")
    print("\nSample data:")
    print(hourly.head())


if __name__ == "__main__":
    main()
