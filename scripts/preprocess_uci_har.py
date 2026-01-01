from pathlib import Path
import pandas as pd

DATA_DIR = Path("data")
RAW_DIR = DATA_DIR / "raw" / "ucihar" / "UCI HAR Dataset"  # ← Your exact path
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def load_activity_labels() -> dict:
    """Load activity labels from activity_labels.txt."""
    labels_path = RAW_DIR / "activity_labels.txt"
    labels_df = pd.read_csv(labels_path, sep=" ", header=None, names=["id", "label"])
    return dict(zip(labels_df["id"], labels_df["label"]))


def load_features() -> pd.Index:
    """Load feature names from features.txt."""
    features_path = RAW_DIR / "features.txt"
    features = pd.read_csv(
        features_path,
        sep=r"\s+",
        header=None,
        names=["index", "name"],
        engine="python",
    )
    return features["name"]


def load_split(split: str, feature_names: pd.Index, activity_map: dict) -> pd.DataFrame:
    """
    Load X_<split>.txt, y_<split>.txt, subject_<split>.txt.
    split: 'train' or 'test'
    """
    x_path = RAW_DIR / split / f"X_{split}.txt"
    y_path = RAW_DIR / split / f"y_{split}.txt"
    subject_path = RAW_DIR / split / f"subject_{split}.txt"

    print(f"Loading {split}: {x_path}")

    X = pd.read_csv(x_path, delim_whitespace=True, header=None)
    X.columns = feature_names

    y = pd.read_csv(y_path, header=None, names=["activity_id"])
    subject = pd.read_csv(subject_path, header=None, names=["subject_id"])

    df = pd.concat([subject, y, X], axis=1)
    df["activity_label"] = df["activity_id"].map(activity_map)
    df["split"] = split
    return df


def main():
    print(f"Reading UCI HAR from: {RAW_DIR}")
    
    # Load mappings
    activity_map = load_activity_labels()
    feature_names = load_features()
    
    print(f"Loaded {len(activity_map)} activity labels, {len(feature_names)} features")

    # Load train and test
    train_df = load_split("train", feature_names, activity_map)
    test_df = load_split("test", feature_names, activity_map)

    # Combine
    full = pd.concat([train_df, test_df], ignore_index=True)
    
    # Add sample_id
    full.insert(0, "sample_id", range(len(full)))
    
    # Select key columns (subject, activity, first 10 features for now)
    key_cols = ["sample_id", "subject_id", "activity_id", "activity_label", "split"] + list(feature_names[:10])
    full = full[key_cols]

    out_path = PROCESSED_DIR / "uci_har.parquet"
    full.to_parquet(out_path, index=False)
    
    print(f"\n✅ Saved {len(full):,} samples to {out_path}")
    print("\nActivity distribution:")
    print(full["activity_label"].value_counts())
    print("\nSample:")
    print(full[["sample_id", "subject_id", "activity_label", feature_names[0]]].head())


if __name__ == "__main__":
    main()
