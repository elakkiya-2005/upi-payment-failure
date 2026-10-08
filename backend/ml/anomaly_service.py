"""
============================================================
 TRANSACTION ANOMALY DETECTION - SCORING SERVICE
============================================================

Loads the Isolation Forest saved by train_anomaly_model.py,
scores every row of the existing `upi_transactions` table and
writes a compact cache file that the Express backend serves
from.

    train_anomaly_model.py   -> fits + saves anomaly_model.pkl
    anomaly_service.py       -> this file, scores + caches

WHY A CACHE FILE
    Scoring 250,000 rows on every HTTP request would be far
    too slow. The result is computed once and cached. The
    cache is rebuilt automatically when the model file is
    newer than the cache, or when --rebuild is passed.

WHAT WRITES TO STDOUT
    Progress goes to stderr. stdout carries exactly one line
    of JSON so the calling process can read the result
    without parsing logs.

BUILDING THE EXPLANATION
    Isolation Forest cannot tell you "this row is odd because
    of X" - it only gives one score per row. Rather than
    inventing a reason, every reason below is a fact that was
    MEASURED on the real dataset:

        * the amount compared to the 1st/99th percentile and
          the z-score of the amount distribution
        * how rare the categorical value is relative to the
          most common value of that same column
        * how rare this exact sender -> receiver bank pair is

    If nothing measurable stands out, the row simply gets no
    reasons. A reason is never fabricated to fill a list.
"""

import json
import os
import sys

import joblib
import numpy as np
import pandas as pd

from sqlalchemy import create_engine


# ==========================================
# DATABASE
# ==========================================

DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "root123")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "3306")
DB_NAME = os.environ.get("DB_NAME", "upi_smart_recovery")


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, "cache")
CACHE_PATH = os.path.join(CACHE_DIR, "anomaly_cache.json")
MODEL_PATH = os.path.join(BASE_DIR, "anomaly_model.pkl")


# Columns that get stored as small integer codes in the
# cache instead of repeated strings.
CATEGORICAL_FEATURES = [
    "transaction_type",
    "sender_bank",
    "receiver_bank",
    "network_type",
    "device_type",
    "transaction_status",
]

NUMERIC_FEATURES = [
    "amount",
    "hour_of_day",
    "is_weekend",
]

FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


# ==========================================
# WHAT COUNTS AS "UNCOMMON"
# ==========================================
# Thresholds are shares of the real dataset. They are stated
# as simple, explainable rules instead of a hidden relative
# comparison, because a user reading the explanation has to
# be able to check the number.
#
#   < 8%  -> a genuinely uncommon category, e.g. 3G, Web,
#            Recharge, or a failed transaction
#   < 2%  -> a genuinely low-traffic hour of the day
#
# A bank route is compared to the MEDIAN route instead. The
# 64 observed routes are all fairly evenly spread, so a fixed
# cut-off would call almost every route "rare", which would
# not be true.

RARE_VALUE_SHARE = 0.08
RARE_HOUR_SHARE = 0.02
RARE_BANK_PAIR_RATIO = 0.6


def log(message):
    print(message, file=sys.stderr, flush=True)


def is_cache_stale():
    """True when the cache is missing or older than the model."""
    if not os.path.exists(CACHE_PATH):
        return True

    if not os.path.exists(MODEL_PATH):
        return True

    return (
        os.path.getmtime(MODEL_PATH) >
        os.path.getmtime(CACHE_PATH)
    )


def load_model():
    if not os.path.exists(MODEL_PATH):
        log(
            "[error] anomaly_model.pkl not found. Run "
            "train_anomaly_model.py first."
        )
        sys.exit(1)

    package = joblib.load(MODEL_PATH)

    log("[model] Loaded anomaly_model.pkl")

    return package


def load_transactions(engine):
    """
    Reads the real dataset.

    `timestamp` is read as a string on purpose: it is only
    used for display, and letting the driver turn it into a
    local-time Date would shift the day for users in
    timezones ahead of UTC.
    """
    columns = ", ".join(
        ["transaction_id", "timestamp"] + FEATURES
    )

    query = f"SELECT {columns} FROM upi_transactions"

    log("[data] Reading upi_transactions ...")

    frame = pd.read_sql(query, engine)

    log(f"[data] Rows read: {len(frame):,}")

    return frame


def clean_frame(frame):
    frame = frame.dropna(subset=FEATURES)

    frame["transaction_id"] = frame[
        "transaction_id"
    ].astype(str)

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

    log(
        f"[data] Rows used by the model: {len(frame):,}"
    )

    return frame


def load_display_values(engine):
    """
    The model works on upper-cased values so that
    "web" and "Web" cannot become two separate categories.
    The UI should still show the value exactly as the
    dataset stores it ("WiFi", "Bill Payment"), so the
    original spelling is looked up separately.
    """
    selects = " UNION ALL ".join(
        f"SELECT '{column}' AS col, {column} AS val "
        f"FROM upi_transactions GROUP BY {column}"
        for column in CATEGORICAL_FEATURES
    )

    display = pd.read_sql(selects, engine)

    mapping = {}

    for column in CATEGORICAL_FEATURES:
        subset = display[display["col"] == column]

        mapping[column] = {
            str(row["val"]).strip().upper(): str(
                row["val"]
            ).strip()
            for _, row in subset.iterrows()
        }

    return mapping


def score_frame(package, frame):
    """Applies the saved model and normalises the raw score."""
    preprocessor = package["preprocessor"]
    model = package["model"]

    log("[model] Encoding features ...")

    encoded = preprocessor.transform(
        frame[FEATURES]
    )

    log("[model] Running IsolationForest ...")

    raw_scores = model.score_samples(encoded)
    predictions = model.predict(encoded)

    is_anomaly = predictions == -1

    # ------------------------------------------------------------
    # Turn the raw path-length score into a 0-100 scale.
    #
    # score_samples() is a *higher is more normal* value, so
    # the rank of a row inside the sorted scores is exactly
    # "how normal is this row". 1 - rank is therefore
    # "how unusual", which is what we want to show.
    # ------------------------------------------------------------

    order = np.argsort(
        raw_scores, kind="mergesort"
    )

    ranks = np.empty(
        len(raw_scores), dtype=np.float64
    )
    ranks[order] = np.arange(len(raw_scores))

    percentiles = (
        ranks / max(len(raw_scores) - 1, 1)
    )

    anomaly_score = np.round(
        (1 - percentiles) * 100, 2
    )

    log(
        f"[result] Anomalies: {int(is_anomaly.sum()):,} "
        f"({is_anomaly.mean():.2%})"
    )

    return raw_scores, anomaly_score, is_anomaly


def share_lookup(stats, feature, value):
    """Share of rows holding `value` in `feature`."""
    value_share = stats.get(feature, {}).get(
        "valueShare", {}
    )

    if str(value) in value_share:
        return value_share[str(value)]

    numeric_match = next(
        (
            share
            for key, share in value_share.items()
            if float(key) == float(value)
        ),
        0.0,
    )

    return numeric_match


def share_series(frame, stats, column):
    """Vector of per-row dataset share for a feature."""
    value_share = stats.get(column, {}).get(
        "valueShare", {}
    )

    return (
        frame[column]
        .map(lambda value: share_lookup(stats, column, value))
        .to_numpy()
    )


def build_reason_flags(package, frame):
    """
    Vectorised measurement of every deviation we are willing
    to report, so the explanation is based on real numbers.
    """
    stats = package["reference_stats"]

    amount = frame["amount"].to_numpy()
    amount_stats = stats["amount"]

    flags = {
        "amountExtremeHigh": amount > amount_stats["p99"],
        "amountExtremeLow": amount < amount_stats["p01"],
    }

    amount_std = amount_stats["std"]

    if amount_std > 0:
        z_scores = (
            (amount - amount_stats["mean"]) / amount_std
        )

        flags["amountZScore"] = np.abs(z_scores) >= 4

    flags["shares"] = {}

    for column in (
        "network_type",
        "device_type",
        "transaction_type",
        "transaction_status",
    ):
        shares = share_series(frame, stats, column)

        flags["shares"][column] = shares

        flags[f"rare_{column}"] = (
            shares < RARE_VALUE_SHARE
        )

    hour_shares = share_series(
        frame, stats, "hour_of_day"
    )

    flags["shares"]["hour_of_day"] = hour_shares

    flags["rare_hour_of_day"] = (
        hour_shares < RARE_HOUR_SHARE
    )

    # Bank pair rarity, measured against the typical route.
    pair_stats = stats["bank_pair"]
    pair_share = pair_stats["pairShare"]

    median_pair_share = pair_stats.get(
        "medianShare", 0.0
    )

    pair_threshold = (
        median_pair_share * RARE_BANK_PAIR_RATIO
    )

    pair_keys = (
        frame["sender_bank"]
        + " -> "
        + frame["receiver_bank"]
    )

    pair_shares = pair_keys.map(
        lambda key: pair_share.get(key, {}).get(
            "share", 1.0
        )
    )

    flags["shares"]["bank_pair"] = (
        pair_shares.to_numpy()
    )

    flags["bankPairThreshold"] = pair_threshold

    flags["rareBankPair"] = (
        pair_shares.to_numpy() < pair_threshold
    )

    return flags


def build_reasons(package, frame, flags, is_anomaly):
    """
    Returns {transaction_id: [reason, ...]} for flagged rows.

    Only anomalous rows get reasons, and only for deviations
    that were actually measured above.

    Ordering is deterministic and documented so the same row
    always explains itself the same way:

        1. amount far outside the distribution
        2. a rare transaction status
        3. a low-traffic hour
        4. the rarest uncommon category on the row
        5. an uncommon bank route

    Within a group the rarest item comes first, so the most
    exceptional fact survives the 4-reason cap.
    """
    stats = package["reference_stats"]

    amount_stats = stats["amount"]
    amount_mean = amount_stats["mean"]
    amount_std = amount_stats["std"]

    shares = flags["shares"]

    failed_share = stats["transaction_status"][
        "valueShare"
    ].get("FAILED", 0.0)

    success_share = 1 - failed_share

    median_pair_share = stats["bank_pair"].get(
        "medianShare", 0.0
    )

    reasons_map = {}

    anomaly_positions = np.flatnonzero(is_anomaly)

    log(
        f"[explain] Building reasons for "
        f"{len(anomaly_positions):,} rows ..."
    )

    for row_index in anomaly_positions:
        row = frame.iloc[row_index]

        amount = float(row["amount"])
        hour = int(row["hour_of_day"])
        sender_bank = row["sender_bank"]
        receiver_bank = row["receiver_bank"]
        network = row["network_type"]
        device = row["device_type"]
        txn_type = row["transaction_type"]

        # Each candidate is (priority, rarity, text).
        # Lower priority wins, then lower rarity (rarer first).
        candidates = []

        # ----- amount ------------------------------------
        if flags["amountZScore"][row_index]:
            z_score = (
                (amount - amount_mean) / amount_std
                if amount_std > 0
                else 0.0
            )

            direction = (
                "above" if z_score > 0 else "below"
            )

            candidates.append((
                10,
                0.0,
                f"Amount Rs {amount:,.0f} is "
                f"{abs(z_score):.1f} standard deviations "
                f"{direction} the average amount of "
                f"Rs {amount_mean:,.0f}.",
            ))

        elif flags["amountExtremeHigh"][row_index]:
            candidates.append((
                20,
                0.0,
                f"Amount Rs {amount:,.0f} is above the 99th "
                f"percentile of the dataset "
                f"(Rs {amount_stats['p99']:,.0f}).",
            ))

        elif flags["amountExtremeLow"][row_index]:
            candidates.append((
                20,
                0.0,
                f"Amount Rs {amount:,.0f} is below the 1st "
                f"percentile of the dataset "
                f"(Rs {amount_stats['p01']:,.0f}).",
            ))

        # ----- status ------------------------------------
        if flags["rare_transaction_status"][row_index]:
            candidates.append((
                30,
                failed_share,
                f"This transaction returned a FAILED result, while "
                f"{success_share:.1%} of the dataset succeeded. "
                f"Failures account for only {failed_share:.1%} of "
                f"all transactions.",
            ))

        # ----- hour --------------------------------------
        if flags["rare_hour_of_day"][row_index]:
            hour_share = float(
                shares["hour_of_day"][row_index]
            )

            candidates.append((
                40,
                hour_share,
                f"{hour:02d}:00 is a low-traffic hour - only "
                f"{hour_share:.2%} of the dataset was "
                f"transacted at this hour.",
            ))

        # ----- categories --------------------------------
        category_candidates = []

        if flags["rare_network_type"][row_index]:
            network_share = float(
                shares["network_type"][row_index]
            )

            category_candidates.append((
                50,
                network_share,
                f"Network '{network.title()}' is uncommon - "
                f"only {network_share:.2%} of all "
                f"transactions used it.",
            ))

        if flags["rare_device_type"][row_index]:
            device_share = float(
                shares["device_type"][row_index]
            )

            category_candidates.append((
                50,
                device_share,
                f"Device '{device.title()}' is uncommon - "
                f"only {device_share:.2%} of all "
                f"transactions came from it.",
            ))

        if flags["rare_transaction_type"][row_index]:
            type_share = float(
                shares["transaction_type"][row_index]
            )

            category_candidates.append((
                50,
                type_share,
                f"Transaction type '{txn_type.title()}' is "
                f"uncommon - only {type_share:.2%} of the "
                f"dataset uses it.",
            ))

        # Keep only the rarest category, so the reason list
        # stays short and the strongest fact leads.
        category_candidates.sort(
            key=lambda item: item[1]
        )

        candidates.extend(category_candidates[:1])

        # ----- bank pair ---------------------------------
        if flags["rareBankPair"][row_index]:
            pair = f"{sender_bank} -> {receiver_bank}"

            details = stats["bank_pair"][
                "pairShare"
            ].get(pair, {})

            pair_share = float(
                shares["bank_pair"][row_index]
            )

            candidates.append((
                60,
                pair_share,
                f"Bank route {sender_bank} to "
                f"{receiver_bank} is used less often than "
                f"the typical route: "
                f"{details.get('count', 0):,} transactions "
                f"({pair_share:.2%} of the dataset, against a "
                f"median of "
                f"{median_pair_share:.2%}).",
            ))

        candidates.sort(key=lambda item: (
            item[0], item[1]
        ))

        reasons_map[row["transaction_id"]] = [
            item[2] for item in candidates[:4]
        ]

    return reasons_map


def build_cache():
    package = load_model()

    engine = create_engine(
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )

    frame = load_transactions(engine)
    frame = clean_frame(frame)

    raw_scores, anomaly_score, is_anomaly = score_frame(
        package, frame
    )

    flags = build_reason_flags(package, frame)

    reasons_map = build_reasons(
        package, frame, flags, is_anomaly
    )

    # ------------------------------------------------------------
    # Compact columnar cache.
    #
    # Categorical columns become small integer codes and the
    # rows are stored as flat arrays. Compared to 250,000
    # objects this keeps both the file and the Node process
    # small enough to keep in memory.
    # ------------------------------------------------------------

    codes = {}
    code_columns = {}
    display_values = load_display_values(engine)

    for column in CATEGORICAL_FEATURES:
        keys = sorted(
            frame[column].unique().tolist()
        )

        lookup = {
            key: index
            for index, key in enumerate(keys)
        }

        # Original spelling, so the UI shows "WiFi" and not
        # "WIFI" while the model still works on the key.
        codes[column] = [
            display_values.get(column, {}).get(
                key, key
            )
            for key in keys
        ]

        code_columns[column] = (
            frame[column]
            .map(lookup)
            .to_numpy()
            .tolist()
        )

    transaction_ids = frame["transaction_id"].tolist()
    timestamps = frame["timestamp"].astype(str).tolist()

    rows = []

    for position in range(len(frame)):
        rows.append([
            transaction_ids[position],
            round(float(frame["amount"].iloc[position]), 2),
            int(frame["hour_of_day"].iloc[position]),
            int(frame["is_weekend"].iloc[position]),
            code_columns["transaction_type"][position],
            code_columns["sender_bank"][position],
            code_columns["receiver_bank"][position],
            code_columns["network_type"][position],
            code_columns["device_type"][position],
            code_columns["transaction_status"][position],
            float(anomaly_score[position]),
            1 if is_anomaly[position] else 0,
        ])

    cache = {
        "meta": {
            "generatedAt": pd.Timestamp.utcnow().isoformat(),
            "algorithm": "IsolationForest",
            "library": "scikit-learn",
            "params": package["params"],
            "features": package["features"],
            "numericFeatures": package["numeric_features"],
            "categoricalFeatures": package[
                "categorical_features"
            ],
            "trainedAt": package["trained_at"],
            "totalAnalyzed": int(len(frame)),
            "normalTransactions": int(
                (~is_anomaly).sum()
            ),
            "anomalousTransactions": int(is_anomaly.sum()),
            "anomalyPercentage": round(
                float(is_anomaly.mean()) * 100, 2
            ),
            "scoreRange": {
                "min": float(anomaly_score.min()),
                "max": float(anomaly_score.max()),
                "mean": round(
                    float(anomaly_score.mean()), 2
                ),
            },
            "rawScoreReference": package["score_reference"],
        },
        "featureStats": package["reference_stats"],
        "codes": codes,
        "timestamps": timestamps,
        "rows": rows,
        "reasons": reasons_map,
    }

    os.makedirs(CACHE_DIR, exist_ok=True)

    # Write to a temp file first so a crash can never leave a
    # half-written cache behind.
    temp_path = CACHE_PATH + ".tmp"

    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(cache, handle, separators=(",", ":"))

    os.replace(temp_path, CACHE_PATH)

    size_mb = os.path.getsize(CACHE_PATH) / (1024 * 1024)

    log(f"[cache] Wrote {CACHE_PATH} ({size_mb:.1f} MB)")

    return {
        "status": "ok",
        "cachePath": CACHE_PATH,
        "cacheSizeMb": round(size_mb, 2),
        "totalAnalyzed": cache["meta"]["totalAnalyzed"],
        "anomalousTransactions": cache["meta"][
            "anomalousTransactions"
        ],
        "anomalyPercentage": cache["meta"][
            "anomalyPercentage"
        ],
        "reasonsGenerated": len(reasons_map),
        "generatedAt": cache["meta"]["generatedAt"],
    }


def main():
    force = "--rebuild" in sys.argv

    if not force and not is_cache_stale():
        with open(
            CACHE_PATH, "r", encoding="utf-8"
        ) as handle:
            existing = json.load(handle)

        print(json.dumps({
            "status": "cached",
            "cachePath": CACHE_PATH,
            "totalAnalyzed": existing["meta"]["totalAnalyzed"],
            "anomalousTransactions": existing["meta"][
                "anomalousTransactions"
            ],
            "anomalyPercentage": existing["meta"][
                "anomalyPercentage"
            ],
            "reasonsGenerated": len(existing["reasons"]),
            "generatedAt": existing["meta"]["generatedAt"],
        }))

        return

    result = build_cache()

    print(json.dumps(result))


if __name__ == "__main__":
    main()
