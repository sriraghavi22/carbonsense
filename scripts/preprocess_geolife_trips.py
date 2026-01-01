from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path("data")
PROCESSED_DIR = DATA_DIR / "processed"


def haversine_km(lat1, lon1, lat2, lon2):
    """
    Compute great-circle distance between two points (in degrees) in kilometers.
    """
    R = 6371.0  # Earth radius in km
    lat1_rad = np.radians(lat1)
    lat2_rad = np.radians(lat2)
    dlat = lat2_rad - lat1_rad
    dlon = np.radians(lon2 - lon1)

    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2.0) ** 2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c


def compute_trip_distance_km(df: pd.DataFrame) -> float:
    """
    Compute cumulative Haversine distance over a trajectory dataframe
    sorted by timestamp.
    """
    df = df.sort_values("timestamp")
    lat = df["lat"].values
    lon = df["lon"].values

    if len(df) < 2:
        return 0.0

    dists = haversine_km(lat[:-1], lon[:-1], lat[1:], lon[1:])
    return float(dists.sum())


def aggregate_trips(points_path: Path) -> pd.DataFrame:
    """
    Aggregate point-level GeoLife data into trip-level table:
    user_id, trip_id, start_time, end_time, duration_s, distance_km, mode
    """
    points = pd.read_parquet(points_path)
    grouped = points.groupby(["user_id", "trajectory_id"], sort=False)

    rows = []
    for (user_id, traj_id), g in grouped:
        g = g.sort_values("timestamp")
        start_time = g["timestamp"].min()
        end_time = g["timestamp"].max()
        duration_s = (end_time - start_time).total_seconds()
        distance_km = compute_trip_distance_km(g)

        rows.append(
            {
                "user_id": user_id,
                "trip_id": traj_id,
                "start_time": start_time,
                "end_time": end_time,
                "duration_s": duration_s,
                "distance_km": distance_km,
                "mode": "unknown",  # placeholder, can be updated later
            }
        )

    trips = pd.DataFrame(rows)
    trips = trips.sort_values(["user_id", "start_time"]).reset_index(drop=True)
    return trips


def main():
    points_path = PROCESSED_DIR / "geolife_points.parquet"
    if not points_path.exists():
        raise FileNotFoundError(f"{points_path} not found. Run preprocess_geolife_points.py first.")

    trips = aggregate_trips(points_path)
    out_path = PROCESSED_DIR / "geolife_trips.parquet"
    trips.to_parquet(out_path, index=False)
    print(f"Saved {len(trips)} trips to {out_path}")


if __name__ == "__main__":
    main()
