"""
============================================================
 TRANSACTION ANOMALY DETECTION - ISOLATION FOREST
============================================================

A NEW, completely separate model from the existing Random
Forest fraud/risk model in train_model.py.

    Existing : train_model.py  -> RandomForestClassifier
               predict.py      -> fraud_prediction
    This one : train_anomaly_model.py -> IsolationForest
               anomaly_service.py     -> anomaly_score

Nothing in the Random Forest pipeline is read, written or
modified by this module.

------------------------------------------------------------
 WHY ISOLATION FOREST
------------------------------------------------------------
Isolation Forest is an *unsupervised* algorithm. It does not
need labels. It builds many random trees and measures how
quickly a point can be isolated: points that get separated
from the rest in very few splits live in sparse, empty
regions of the feature space, so they are the anomalies.

That is exactly the question we want to ask about UPI
transactions: "does this transaction look like the thousands
of other transactions, or does it sit alone?"

------------------------------------------------------------
 FEATURES
------------------------------------------------------------
Numeric (kept as continuous numbers):
    amount
    hour_of_day
    is_weekend

Categorical (one-hot encoded, NEVER mapped to arbitrary
integers - see build_preprocessor below):
    transaction_type
    sender_bank
    receiver_bank
    network_type
    device_type
    transaction_status

Why one-hot and not LabelEncoder?
    LabelEncoder would turn ["2G", "3G", "4G", "5G"] into
    [1, 2, 3, 4] and Isolation Forest would then treat "5G"
    as "further away from 2G" than "4G" is. The order would
    be an invention of the encoder, not a fact about the
    data. One-hot encoding gives every category its own
    binary dimension, so the distance between two networks
    carries no fake ordering.

transaction_status is included as a *pattern* feature only
(it tells the model how unusual it is for a transaction like
this to fail). It is NOT a fraud label, and an anomaly is
never reported as fraud.

------------------------------------------------------------
 OUTPUT
------------------------------------------------------------
    ml/anomaly_model.pkl

    {
        "model"               : fitted IsolationForest
        "preprocessor"        : fitted ColumnTransformer
        "numeric_features"    : [...]
        "categorical_features": [...]
        "features"            : [...]
        "params"              : {...}
        "reference_stats"     : per-feature distribution of
                                the real dataset, used later
                                to build honest explanations
        "score_reference"     : score distribution used to
                                turn raw scores into a
                                0-100 percentile scale
    }
"""

import json
import os
import sys

import joblib
import numpy as np
import pandas as pd

from sqlalchemy import create_engine

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import IsolationForest


# ==========================================
# DATABASE
# ==========================================
# Credentials come from the environment first (the Express
# backend passes the values from backend/.env to this
# process). The fallbacks match the existing ml scripts.

DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "root123")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "3306")
DB_NAME = os.environ.get("DB_NAME", "upi_smart_recovery")


MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "anomaly_model.pkl"
)


# ==========================================
# FEATURE DEFINITION
# ==========================================

NUMERIC_FEATURES = [
    "amount",
    "hour_of_day",
    "is_weekend",
]

CATEGORICAL_FEATURES = [
    "transaction_type",
    "sender_bank",
    "receiver_bank",
    "network_type",
    "device_type",
    "transaction_status",
]

FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


# ==========================================
# ISOLATION FOREST PARAMETERS
# ==========================================

ISOLATION_FOREST_PARAMS = {
    "n_estimators": 300,
    "contamination": 0.05,   # expect ~5% of rows to be outliers
    "max_samples": "auto",
    "bootstrap": False,
    "random_state": 42,
    "n_jobs": -1,
}


def print_header(text):
    print("\n" + "=" * 60)
    print(text)
    print("=" * 60 + "\n")


def clean_key(value):
    """
    Renders a value as a stable string key.

    Numeric columns are cast to float before their value
    counts are built, which would otherwise produce keys like
    "21.0" and make a later lookup for "21" silently miss.
    """
    if isinstance(value, (float, np.floating)):
        if float(value).is_integer():
            return str(int(value))

        return str(float(value))

    return str(value)


def build_engine():
    return create_engine(
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )


def load_transactions(engine):
    """Reads the existing dataset. No new data is generated."""
    columns = ", ".join(FEATURES)

    query = f"SELECT {columns} FROM upi_transactions"

    print("[data] Reading upi_transactions ...")

    frame = pd.read_sql(query, engine)

    print(f"[data] Rows read: {len(frame):,}")

    return frame


def clean_frame(frame):
    """Drops rows the model cannot actually use."""
    before = len(frame)

    frame = frame.dropna(subset=FEATURES)

    frame["amount"] = frame["amount"].astype(float)
    frame["hour_of_day"] = frame["hour_of_day"].astype(int)
    frame["is_weekend"] = frame["is_weekend"].astype(int)

    for column in CATEGORICAL_FEATURES:
        frame[column] = (
            frame[column]
            .astype(str)
            .str.strip()
            .str.upper()
        )

    print(
        f"[data] Rows after removing incomplete rows: "
        f"{len(frame):,} (dropped {before - len(frame):,})"
    )

    return frame


def build_preprocessor():
    """
    One-hot encodes the categorical features and leaves the
    numeric features on their own scale.

    Isolation Forest picks a random value between a feature's
    observed min and max, so it is already invariant to linear
    rescaling. That is why there is deliberately no scaler
    here - adding one would change nothing mathematically and
    would only add a second thing that can go wrong.
    """
    return ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(
                    handle_unknown="ignore",
                    dtype=np.float32,
                ),
                CATEGORICAL_FEATURES,
            ),
            (
                "numeric",
                "passthrough",
                NUMERIC_FEATURES,
            ),
        ],
        remainder="drop",
    )


def build_reference_stats(frame):
    """
    Real measured distributions of the dataset.

    These exist for one reason only: the frontend has to
    explain *why* a transaction was flagged, and an honest
    explanation can only quote real numbers from the real
    dataset. Nothing here is invented.
    """
    stats = {}

    for column in NUMERIC_FEATURES:
        series = frame[column].astype(float)

        quantiles = series.quantile(
            [0.01, 0.25, 0.5, 0.75, 0.99]
        )

        stats[column] = {
            "min": float(series.min()),
            "max": float(series.max()),
            "mean": float(series.mean()),
            "std": float(series.std()),
            "p01": float(quantiles.loc[0.01]),
            "p25": float(quantiles.loc[0.25]),
            "median": float(quantiles.loc[0.5]),
            "p75": float(quantiles.loc[0.75]),
            "p99": float(quantiles.loc[0.99]),
            "iqr": float(
                quantiles.loc[0.75] - quantiles.loc[0.25]
            ),
        }

        if series.nunique() <= 48:
            counts = series.value_counts(normalize=True)

            stats[column]["valueShare"] = {
                clean_key(key): float(value)
                for key, value in counts.items()
            }

    for column in CATEGORICAL_FEATURES:
        counts = frame[column].value_counts(normalize=True)

        stats[column] = {
            "distinctValues": int(frame[column].nunique()),
            "mostCommon": clean_key(counts.index[0]),
            "valueShare": {
                clean_key(key): float(value)
                for key, value in counts.items()
            },
        }

    # How often each sender -> receiver bank pair is used.
    pair_counts = (
        frame.groupby(["sender_bank", "receiver_bank"])
        .size()
        .reset_index(name="count")
    )

    pair_total = float(len(frame))

    pair_share = {}

    for _, row in pair_counts.iterrows():
        key = f"{row['sender_bank']} -> {row['receiver_bank']}"

        pair_share[key] = {
            "count": int(row["count"]),
            "share": float(row["count"] / pair_total),
        }

    # The median is the honest baseline for "how often is a
    # route normally used". Comparing against the busiest
    # route would be misleading, because the 64 observed
    # routes are all fairly evenly spread.
    median_pair_share = float(
        np.median(
            [item["share"] for item in pair_share.values()]
        )
    )

    stats["bank_pair"] = {
        "distinctPairs": int(len(pair_share)),
        "medianShare": median_pair_share,
        "mostUsedShare": float(
            max(
                item["share"] for item in pair_share.values()
            )
        ),
        "pairShare": pair_share,
    }

    return stats


def train(frame):
    print_header("PREPARING FEATURES")

    preprocessor = build_preprocessor()

    encoded = preprocessor.fit_transform(frame[FEATURES])

    print(
        f"[model] Encoded matrix shape: {encoded.shape} "
        f"({encoded.nnz:,} non-zero values)"
    )

    print("\n[model] Encoding the categorical columns gives one "
          "independent binary column per category,")
    print("       so no category is treated as "
          "'closer' to another.")

    print_header("TRAINING ISOLATION FOREST")

    model = IsolationForest(**ISOLATION_FOREST_PARAMS)

    model.fit(encoded)

    print("[model] Training complete.")

    # Raw scores on the training data, used to convert the
    # raw path-length score into a readable percentile.
    raw_scores = model.score_samples(encoded)

    score_reference = {
        "min": float(raw_scores.min()),
        "max": float(raw_scores.max()),
        "mean": float(raw_scores.mean()),
        "offset": float(model.offset_),
        "percentiles": {
            str(percentile): float(
                np.percentile(raw_scores, percentile)
            )
            for percentile in (1, 5, 10, 25, 50, 75, 90, 95, 99)
        },
    }

    print(f"[model] Offset: {score_reference['offset']:.4f}")

    return preprocessor, model, score_reference


def main():
    print_header(
        "UPI TRANSACTION ANOMALY DETECTION\n"
        "ISOLATION FOREST TRAINING"
    )

    print(
        f"Database: {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}\n"
    )

    try:
        engine = build_engine()

        connection = pd.read_sql(
            "SELECT DATABASE() AS db", engine
        )

        print(f"[db] Connected to: "
              f"{connection['db'].iloc[0]}")

    except Exception as error:
        print("[db] Database connection failed.")
        print(error)
        sys.exit(1)

    frame = load_transactions(engine)
    frame = clean_frame(frame)

    if frame.empty:
        print("[data] No usable rows found.")
        sys.exit(1)

    print("\n[data] Class balance check (how the features "
          "are distributed)")

    for column in CATEGORICAL_FEATURES:
        share = frame[column].value_counts(normalize=True)

        print(f"\n  {column}:")
        for key, value in share.items():
            print(f"    {str(key):<18} {value:6.2%}")

    print_header("BUILDING FEATURE REFERENCE STATISTICS")

    reference_stats = build_reference_stats(frame)

    print(
        f"[stats] Reference statistics built for "
        f"{len(reference_stats)} feature groups."
    )
    print(
        f"[stats] Distinct bank pairs observed: "
        f"{reference_stats['bank_pair']['distinctPairs']}"
    )

    preprocessor, model, score_reference = train(frame)

    predictions = model.predict(
        preprocessor.transform(frame[FEATURES])
    )

    anomaly_count = int((predictions == -1).sum())

    print("\n[result] Rows flagged as ANOMALY: "
          f"{anomaly_count:,} "
          f"({anomaly_count / len(frame):.2%})")
    print("[result] Rows marked NORMAL:       "
          f"{len(frame) - anomaly_count:,}")

    package = {
        "model": model,
        "preprocessor": preprocessor,
        "features": FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "params": ISOLATION_FOREST_PARAMS,
        "reference_stats": reference_stats,
        "score_reference": score_reference,
        "trained_at": pd.Timestamp.utcnow().isoformat(),
        "training_rows": int(len(frame)),
    }

    joblib.dump(package, MODEL_PATH)

    print_header("MODEL SAVED")

    print(f"Saved: {MODEL_PATH}")

    print(
        f"Training rows: {len(frame):,}  |  "
        f"Features: {len(FEATURES)}  |  "
        f"Anomalies: {anomaly_count:,}"
    )

    print(
        "\nNext step: the Express backend scores the dataset "
        "on demand\nthrough ml/anomaly_service.py, which uses "
        "this saved model."
    )


if __name__ == "__main__":
    main()
