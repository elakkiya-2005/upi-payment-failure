"""Pre-computes the historical failure statistics that back the
KNN-style risk explanations, the root cause analysis and the
data-driven recommendations.

Everything in the cache is a measured aggregate of the real
`upi_transactions` table. No value is invented, and every
aggregate carries the number of rows it was built from so the
API can refuse to state a conclusion drawn from a handful of
rows.

Run:
    python build_risk_stats.py

Output:
    cache/risk_stats.json
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from urllib.parse import quote_plus

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"
CACHE_PATH = CACHE_DIR / "risk_stats.json"
ANOMALY_MODEL_PATH = BASE_DIR / "anomaly_model.pkl"

# An aggregate built from fewer than this many rows is treated
# as unproven. The API reports those as "insufficient data"
# instead of turning noise into a recommendation.
MIN_SAMPLE = 30

# A cause must beat the dataset baseline by at least this
# factor to be worth telling the user about.
MIN_USEFUL_LIFT = 1.15

# How much of the Isolation Forest raw-score distribution to
# keep, so a brand new transaction can be placed on the same
# percentile scale as the historical rows without re-scoring
# 250,000 records per request.
ANOMALY_QUANTILE_STEPS = 2001

COLUMNS = [
    "transaction_id",
    "amount",
    "hour_of_day",
    "is_weekend",
    "day_of_week",
    "transaction_type",
    "transaction_status",
    "sender_bank",
    "receiver_bank",
    "network_type",
    "device_type",
    "merchant_category",
]

# Single-column dimensions, each of which can be a cause on
# its own.
DIMENSIONS = [
    "network_type",
    "sender_bank",
    "receiver_bank",
    "transaction_type",
    "device_type",
    "day_of_week",
    "hour_of_day",
    "is_weekend",
]

# Pairs that are worth crossing, because in UPI the failure
# mode is usually an interaction rather than a single field.
CROSS_TABS = {
    "network_type__transaction_type": [
        "network_type",
        "transaction_type",
    ],
    "network_type__device_type": ["network_type", "device_type"],
    "sender_bank__network_type": ["sender_bank", "network_type"],
    "hour_band__network_type": ["hour_band", "network_type"],
    "transaction_type__device_type": [
        "transaction_type",
        "device_type",
    ],
}

HOUR_BANDS = [
    (0, 5, "Late night (00:00-05:59)"),
    (6, 11, "Morning (06:00-11:59)"),
    (12, 16, "Afternoon (12:00-16:59)"),
    (17, 21, "Evening (17:00-21:59)"),
    (22, 23, "Night (22:00-23:59)"),
]

DIMENSION_LABELS = {
    "network_type": "network",
    "sender_bank": "sender bank",
    "receiver_bank": "receiver bank",
    "transaction_type": "transaction type",
    "device_type": "device",
    "day_of_week": "day of the week",
    "hour_of_day": "hour of the day",
    "is_weekend": "weekend indicator",
    "hour_band": "time of day",
    "amount_band": "amount",
    "merchant_category": "merchant category",
}


def log(message):
    print(message, file=sys.stderr, flush=True)


def get_engine():
    load_dotenv(BASE_DIR.parent / ".env")

    user = quote_plus(os.getenv("DB_USER", "root"))
    password = quote_plus(os.getenv("DB_PASSWORD", ""))
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "3306")
    database = quote_plus(
        os.getenv("DB_NAME", "upi_smart_recovery")
    )

    return create_engine(
        f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    )


def hour_band(hour):
    if hour is None or pd.isna(hour):
        return None

    for low, high, label in HOUR_BANDS:
        if low <= hour <= high:
            return label

    return None


def load_transactions():
    log("[load] Reading upi_transactions ...")

    frame = pd.read_sql_query(
        f"SELECT {', '.join(COLUMNS)} FROM upi_transactions",
        get_engine(),
    )

    frame["amount"] = pd.to_numeric(
        frame["amount"], errors="coerce"
    )
    frame["hour_of_day"] = pd.to_numeric(
        frame["hour_of_day"], errors="coerce"
    )
    frame["is_weekend"] = pd.to_numeric(
        frame["is_weekend"], errors="coerce"
    )

    frame["transaction_status"] = (
        frame["transaction_status"]
        .astype("string")
        .str.strip()
        .str.upper()
    )

    frame = frame.dropna(
        subset=["amount", "hour_of_day", "transaction_status"]
    )
    frame = frame[
        frame["transaction_status"].isin(["SUCCESS", "FAILED"])
    ]

    frame["hour_of_day"] = frame["hour_of_day"].astype(int)
    frame["is_weekend"] = frame["is_weekend"].astype(int)
    frame["failed"] = (
        frame["transaction_status"] == "FAILED"
    ).astype(int)
    frame["hour_band"] = frame["hour_of_day"].map(hour_band)

    log(f"[load] Usable rows: {len(frame):,}")

    return frame.reset_index(drop=True)


def build_amount_bands(frame, baseline_rate):
    """Amount buckets sized by the real distribution.

    Fixed rupee thresholds would leave the top bucket with a
    handful of rows and the bottom one with almost the whole
    dataset, so the cut points are the dataset's own deciles.
    """
    percentiles = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    edges = np.percentile(
        frame["amount"].to_numpy(), percentiles
    )

    # Deciles can repeat when many transactions share an
    # amount. Collapse duplicates so every band is distinct.
    edges = sorted({round(float(edge), 2) for edge in edges})

    bands = []

    for index in range(len(edges) - 1):
        low = edges[index]
        high = edges[index + 1]

        if index == len(edges) - 2:
            mask = frame["amount"] >= low
        else:
            mask = (frame["amount"] >= low) & (
                frame["amount"] < high
            )

        total = int(mask.sum())

        if total == 0:
            continue

        failed = int(frame.loc[mask, "failed"].sum())
        rate = failed / total

        bands.append(
            {
                "index": index,
                "label": f"{low:,.0f} - {high:,.0f}",
                "min": low,
                "max": high,
                "total": total,
                "failed": failed,
                "failureRate": round(rate, 6),
                "lift": round(rate / baseline_rate, 4)
                if baseline_rate > 0
                else None,
                "sufficient": total >= MIN_SAMPLE,
            }
        )

    return bands


def summarise(group):
    total = int(group["failed"].size)
    failed = int(group["failed"].sum())
    rate = failed / total if total > 0 else 0.0

    return total, failed, rate


def build_dimension(frame, column, baseline_rate):
    stats = {}

    for value, group in frame.groupby(column, dropna=True):
        total, failed, rate = summarise(group)

        key = (
            str(int(value))
            if pd.api.types.is_numeric_dtype(group[column])
            else str(value)
        )

        stats[key] = {
            "total": total,
            "failed": failed,
            "failureRate": round(rate, 6),
            "lift": round(rate / baseline_rate, 4)
            if baseline_rate > 0
            else None,
            "sufficient": total >= MIN_SAMPLE,
        }

    return stats


def build_crosstab(frame, columns, baseline_rate):
    keys = columns

    stats = {}

    for values, group in frame.groupby(keys, dropna=True):
        total, failed, rate = summarise(group)

        if not isinstance(values, tuple):
            values = (values,)

        stats["|".join(str(part) for part in values)] = {
            "total": total,
            "failed": failed,
            "failureRate": round(rate, 6),
            "lift": round(rate / baseline_rate, 4)
            if baseline_rate > 0
            else None,
            "sufficient": total >= MIN_SAMPLE,
        }

    return stats


def build_anomaly_reference(frame):
    """Stores the Isolation Forest raw-score distribution.

    The saved model was trained on these same rows, so its
    score_samples() output on them is the natural yardstick for
    placing an unseen transaction on the same 0-100 scale.
    """
    if not ANOMALY_MODEL_PATH.exists():
        log("[anomaly] Model missing, skipping reference.")
        return None

    log("[anomaly] Loading Isolation Forest ...")

    package = joblib.load(ANOMALY_MODEL_PATH)

    features = package.get("features") or [
        "amount",
        "hour_of_day",
        "is_weekend",
        "transaction_type",
        "sender_bank",
        "receiver_bank",
        "network_type",
        "device_type",
        "transaction_status",
    ]

    log(f"[anomaly] Scoring {len(frame):,} rows ...")

    encoded = package["preprocessor"].transform(frame[features])
    raw_scores = package["model"].score_samples(encoded)

    step = max(
        1, len(raw_scores) // (ANOMALY_QUANTILE_STEPS - 1)
    )
    sampled = np.sort(raw_scores)[::step][:ANOMALY_QUANTILE_STEPS]

    meta = package.get("meta") or {}

    log("[anomaly] Reference ready.")

    return {
        "features": features,
        "quantiles": [round(float(value), 8) for value in sampled],
        "minRaw": round(float(raw_scores.min()), 8),
        "maxRaw": round(float(raw_scores.max()), 8),
        "threshold": float(
            package["model"].offset_ * -1
        )
        if hasattr(package["model"], "offset_")
        else None,
        "contamination": float(
            getattr(package["model"], "contamination", 0)
        ),
        "trainedAt": meta.get("trainedAt"),
        "sampleSize": int(len(raw_scores)),
    }


def main():
    frame = load_transactions()

    if len(frame) < MIN_SAMPLE:
        raise RuntimeError(
            "upi_transactions does not contain enough usable rows."
        )

    total_rows = int(len(frame))
    total_failed = int(frame["failed"].sum())
    baseline_rate = total_failed / total_rows

    log(
        f"[stats] Baseline failure rate: "
        f"{baseline_rate:.2%} ({total_failed:,}/{total_rows:,})"
    )

    dimensions = {
        column: build_dimension(frame, column, baseline_rate)
        for column in DIMENSIONS
    }

    # merchant_category is a bonus dimension, kept separate
    # because it is not something the user picks in the form.
    merchant = build_dimension(
        frame, "merchant_category", baseline_rate
    )
    dimensions["merchant_category"] = merchant

    cross_tabs = {
        name: build_crosstab(frame, columns, baseline_rate)
        for name, columns in CROSS_TABS.items()
    }

    amount_bands = build_amount_bands(frame, baseline_rate)

    # hour_band is derived, so it is appended after the raw
    # hour_of_day dimension.
    dimensions["hour_band"] = build_dimension(
        frame, "hour_band", baseline_rate
    )

    payload = {
        "generatedAt": datetime.now(
            timezone.utc
        ).isoformat(),
        "minSample": MIN_SAMPLE,
        "minUsefulLift": MIN_USEFUL_LIFT,
        "dimensionLabels": DIMENSION_LABELS,
        "dataset": {
            "totalRows": total_rows,
            "failedRows": total_failed,
            "successRows": total_rows - total_failed,
            "failureRate": round(baseline_rate, 6),
            "failureRatePercent": round(baseline_rate * 100, 2),
        },
        "dimensions": dimensions,
        "crossTabs": cross_tabs,
        "amountBands": amount_bands,
        "anomalyReference": build_anomaly_reference(frame),
    }

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    with open(CACHE_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))

    log(f"[done] Wrote {CACHE_PATH}")


if __name__ == "__main__":
    main()
