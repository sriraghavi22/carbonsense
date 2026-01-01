import os
from pathlib import Path
from typing import List

import pandas as pd

DATA_DIR = Path("data")
RAW_GEOLIFE_DIR = DATA_DIR / "raw" / "geolife"  # Points to your 'Geolife Trajectories 1.3' folder
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def parse_plt_file(filepath: Path, user_id: int, trajectory_id: str) -> pd.DataFrame:
    """
    Parse a single GeoLife .plt file into a DataFrame with:
    user_id, trajectory_id, timestamp, lat, lon
    """
    # GeoLife .plt files have 6-line header; data starts from line 7
    df = pd.read_csv(
        filepath,
        skiprows=6,
        header=None,
        names=[
            "lat",
            "lon",
            "unused1",
            "unused2",
            "altitude",
            "days",
            "date",
            "time",
        ],
    )

    df["timestamp"] = pd.to_datetime(df["date"] + " " + df["time"])
    df["user_id"] = user_id
    df["trajectory_id"] = trajectory_id

    return df[["user_id", "trajectory_id", "timestamp", "lat", "lon"]]


def find_trajectory_dirs(root_dir: Path) -> List[tuple]:
    """
    Find all user trajectory directories in the GeoLife structure.
    Handles paths like: Geolife Trajectories 1.3/Data/000/Trajectory/
    """
    traj_dirs = []
    
    # Look for Data/XXX/Trajectory pattern
    data_dir = root_dir / "Geolife Trajectories 1.3" / "Data"
    if data_dir.exists():
        for user_dir in data_dir.glob("*/"):
            traj_dir = user_dir / "Trajectory"
            if traj_dir.exists():
                traj_dirs.append((int(user_dir.name), traj_dir))
    
    # Fallback: look for any Trajectory folders
    if not traj_dirs:
        for traj_dir in root_dir.rglob("Trajectory"):
            if traj_dir.is_dir():
                user_dir = traj_dir.parent
                user_id = int(user_dir.name) if user_dir.name.isdigit() else len(traj_dirs)
                traj_dirs.append((user_id, traj_dir))
    
    return traj_dirs


def collect_all_points(root_dir: Path) -> pd.DataFrame:
    """
    Walk through RAW_GEOLIFE_DIR and parse all .plt files.
    """
    traj_dirs = find_trajectory_dirs(root_dir)
    print(f"Found {len(traj_dirs)} user trajectory directories")
    
    all_dfs: List[pd.DataFrame] = []
    
    for user_id, traj_dir in traj_dirs:
        plt_files = list(traj_dir.glob("*.plt"))
        print(f"User {user_id}: {len(plt_files)} trajectories in {traj_dir}")
        
        for plt_file in plt_files:
            trajectory_id = f"{user_id}_{plt_file.stem}"
            try:
                df = parse_plt_file(plt_file, user_id=user_id, trajectory_id=trajectory_id)
                all_dfs.append(df)
            except Exception as e:
                print(f"Error processing {plt_file}: {e}")
                continue

    if not all_dfs:
        raise RuntimeError("No .plt files found. Check RAW_GEOLIFE_DIR path.")

    points = pd.concat(all_dfs, ignore_index=True)
    points = points.sort_values(["user_id", "trajectory_id", "timestamp"]).reset_index(drop=True)
    return points


def main():
    print(f"Reading GeoLife from: {RAW_GEOLIFE_DIR}")
    print(f"Looking for structure like: {RAW_GEOLIFE_DIR}/Geolife Trajectories 1.3/Data/*/Trajectory/*.plt")
    
    points = collect_all_points(RAW_GEOLIFE_DIR)
    
    out_path = PROCESSED_DIR / "geolife_points.parquet"
    points.to_parquet(out_path, index=False)
    
    print(f"Saved {len(points):,} points from {points['user_id'].nunique()} users")
    print(f"Sample:")
    print(points.head())
    print(f"\nPoints per user (top 5):")
    print(points['user_id'].value_counts().head())


if __name__ == "__main__":
    main()
