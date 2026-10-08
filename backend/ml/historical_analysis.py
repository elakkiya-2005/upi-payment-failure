"""Historical analysis for a single planned UPI transaction.

Combines four real measurements and prints one JSON object:

  1. KNN        - what actually happened to the 25 most similar
                  historical transactions
  2. Root cause - which measured group this transaction falls into
                  that fails more often than the dataset baseline
  3. Advice     - the change with the best measured failure rate,
                  or an honest "nothing stands out" answer
  4. Anomaly    - where the transaction sits on the Isolation
                  Forest scale learned from the same dataset

Every number is a measured aggregate. When a group was built
from too few rows to be meaningful the answer says so instead of
presenting noise as a finding.

Usage:
    python historical_analysis.py '{"amount": 2500, ...}'

The KNN model and the statistics cache are loaded once and kept
in memory, because the Node layer calls this script for every
risk check.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"
KNN_MODEL_PATH = BASE_DIR / "knn_model.pkl"
STATS_PATH = CACHE_DIR / "risk_stats.json"
ANOMALY_MODEL_PATH = BASE_DIR / "anomaly_model.pkl"

# Below this many historical rows in a group, a failure rate is
# not treated as evidence.
MIN_SAMPLE_DEFAULT = 30

# How many similar historical transactions to show as proof.
SAMPLE_NEIGHBOURS = 6

# A cross-tab has to be at least this big to be tested, even if
# the total row count passes the sample floor.
MIN_CROSSTAB_SAMPLE = 120

# An alternative is only worth recommending when it beats the
# current value by at least this proportion. Without it the
# engine happily recommends an iPhone over an Android phone to
# avoid a 0.2 percentage point difference, which is noise on a
# dataset this flat.
MIN_RELATIVE_IMPROVEMENT = 0.10

# The order causes are reported in.
SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}

_knn_package = None
_stats_cache = None
_anomaly_package = None


# ==========================================
# LAZY LOADING
# ==========================================

def load_knn():
    global _knn_package

    if _knn_package is None:
        if not KNN_MODEL_PATH.exists():
            raise FileNotFoundError(
                "knn_model.pkl is missing. Run train_knn.py first."
            )

        _knn_package = joblib.load(KNN_MODEL_PATH)

    return _knn_package


def load_stats():
    global _stats_cache

    if _stats_cache is None:
        if not STATS_PATH.exists():
            raise FileNotFoundError(
                "risk_stats.json is missing. Run build_risk_stats.py first."
            )

        with open(STATS_PATH, encoding="utf-8") as handle:
            _stats_cache = json.load(handle)

    return _stats_cache


def load_anomaly():
    global _anomaly_package

    if _anomaly_package is None:
        if not ANOMALY_MODEL_PATH.exists():
            return None

        _anomaly_package = joblib.load(ANOMALY_MODEL_PATH)

    return _anomaly_package


# ==========================================
# NORMALISATION
#
# The form values are matched against the dataset vocabulary
# case-insensitively so a small spelling difference does not
# silently turn a value into an unknown category.
# ==========================================

def norm(value):
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None

    return str(value).strip()


def norm_hour(value):
    if value is None:
        return None

    try:
        hour = int(value)
    except (TypeError, ValueError):
        return None

    if hour < 0 or hour > 23:
        return None

    return hour


def parse_hour_from_time(value):
    """Accepts '14:30', '2:30 PM' and '14'."""
    if not value:
        return None

    text = str(value).strip()
    match = None

    import re

    match = re.search(
        r"(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?", text
    )

    if not match:
        return None

    hour = int(match.group(1))
    period = (match.group(3) or "").upper()

    if period == "PM" and hour != 12:
        hour += 12

    if period == "AM" and hour == 12:
        hour = 0

    if hour < 0 or hour > 23:
        return None

    return hour


def resolve_input(payload):
    hour = norm_hour(payload.get("hour_of_day"))

    if hour is None:
        hour = parse_hour_from_time(payload.get("time"))

    if hour is None:
        hour = datetime.now().hour

    try:
        amount = float(payload.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0.0

    day_of_week = norm(payload.get("day_of_week")) or datetime.now().strftime(
        "%A"
    )

    is_weekend = payload.get("is_weekend")

    if is_weekend is None:
        is_weekend = 1 if day_of_week in ("Saturday", "Sunday") else 0
    else:
        is_weekend = 1 if int(is_weekend) == 1 else 0

    bank = norm(payload.get("sender_bank")) or norm(payload.get("bank"))

    return {
        "amount": amount,
        "hour_of_day": hour,
        "is_weekend": is_weekend,
        "day_of_week": day_of_week,
        "transaction_type": norm(payload.get("transaction_type")),
        "sender_bank": bank,
        "receiver_bank": norm(payload.get("receiver_bank")) or bank,
        "network_type": norm(payload.get("network_type")),
        "device_type": norm(payload.get("device_type")),
        "payment_app": norm(payload.get("payment_app")),
    }


def hour_band(hour):
    if hour is None:
        return None

    if 0 <= hour <= 5:
        return "Late night (00:00-05:59)"
    if 6 <= hour <= 11:
        return "Morning (06:00-11:59)"
    if 12 <= hour <= 16:
        return "Afternoon (12:00-16:59)"
    if 17 <= hour <= 21:
        return "Evening (17:00-21:59)"

    return "Night (22:00-23:59)"


def amount_band(amount, bands):
    for band in bands:
        if band["min"] <= amount < band["max"]:
            return band

    if bands and amount >= bands[-1]["max"]:
        return bands[-1]

    return None


# ==========================================
# 1. KNN
# ==========================================

def run_knn(context):
    """Looks at what happened to the nearest historical rows."""
    package = load_knn()

    features = package["features"]
    history = package["history"]
    model = package["model"]
    preprocessor = package["preprocessor"]

    row = pd.DataFrame(
        [
            {
                "amount": context["amount"],
                "hour_of_day": context["hour_of_day"],
                "transaction_type": context["transaction_type"],
                "sender_bank": context["sender_bank"],
                "network_type": context["network_type"],
            }
        ]
    )

    # An unseen categorical is encoded as an all-zero block rather
    # than crashing, so the caller is told the value is not part of
    # the dataset instead of receiving a silent guess. Only the
    # categorical columns are checked: an amount will never match a
    # stored value exactly, so comparing it would flag every
    # transaction.
    unknown = []

    categorical = package.get("categorical_features") or [
        column
        for column in features
        if column not in ("amount", "hour_of_day")
    ]

    for column in categorical:
        if column not in features:
            continue

        value = row.iloc[0][column]
        known = history[column].astype(str).str.strip().unique()

        if not any(
            str(known_value).strip().lower() == str(value).strip().lower()
            for known_value in known
        ):
            unknown.append(column)

    encoded = preprocessor.transform(row[features])

    distances, indexes = model.kneighbors(
        encoded, n_neighbors=min(package["neighbor_count"], len(history))
    )

    neighbours = history.iloc[indexes[0]].copy()
    statuses = (
        neighbours[package["target"]].astype(str).str.upper().tolist()
    )

    failed = statuses.count("FAILED")
    total = len(statuses)
    failure_rate = failed / total if total else 0.0

    baseline = load_stats()["dataset"]["failureRate"]

    lift = failure_rate / baseline if baseline > 0 else None

    if total >= 20 and lift is not None:
        if lift >= 1.25:
            confidence = "HIGH"
        elif lift >= 1.10:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
    else:
        confidence = "LOW"

    samples = []

    for position in range(min(SAMPLE_NEIGHBOURS, total)):
        record = neighbours.iloc[position]

        samples.append(
            {
                "transactionId": str(record["transaction_id"]),
                "amount": round(float(record["amount"]), 2),
                "hourOfDay": int(record["hour_of_day"]),
                "transactionType": str(record["transaction_type"]),
                "senderBank": str(record["sender_bank"]),
                "networkType": str(record["network_type"]),
                "status": statuses[position],
                "distance": round(float(distances[0][position]), 4),
            }
        )

    return {
        "available": True,
        "algorithm": "K-Nearest Neighbours",
        "neighborCount": total,
        "failedCount": failed,
        "successCount": total - failed,
        "failureRate": round(failure_rate, 6),
        "failureRatePercent": round(failure_rate * 100, 2),
        "baselineFailureRate": round(baseline, 6),
        "baselineFailureRatePercent": round(baseline * 100, 2),
        "lift": round(lift, 4) if lift is not None else None,
        "confidence": confidence,
        "matchedDistance": round(float(distances[0][0]), 4),
        "unknownFeatures": unknown,
        "features": features,
        "similarTransactions": samples,
        "sufficient": total >= 10,
    }


# ==========================================
# 2. ROOT CAUSE
# ==========================================

def stat_entry(stats, dimension, value):
    """Case-insensitive lookup of one measured group."""
    if value is None:
        return None

    table = stats["dimensions"].get(dimension)

    if not table:
        return None

    if str(value) in table:
        return table[str(value)]

    target = str(value).strip().lower()

    for key, entry in table.items():
        if str(key).strip().lower() == target:
            return entry

    return None


def crosstab_entry(stats, name, values):
    table = stats["crossTabs"].get(name)

    if not table:
        return None

    return table.get("|".join(str(value) for value in values))


def dimension_label(dimension, stats):
    """Human label for a column or for a two-column cross-tab."""
    known = stats.get("dimensionLabels", {})

    if dimension in known:
        return known[dimension]

    if "__" in dimension:
        parts = [
            known.get(part, part.replace("_", " "))
            for part in dimension.split("__")
        ]
        return " + ".join(parts)

    return dimension.replace("_", " ")


def describe(dimension, value, entry, baseline, stats):
    label = dimension_label(dimension, stats)

    rate = entry["failureRate"] * 100
    lift = entry.get("lift") or 1.0

    if lift >= 1.30:
        severity = "HIGH"
    elif lift >= 1.15:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    return {
        "dimension": dimension,
        "dimensionLabel": dimension_label(dimension, stats),
        "value": value,
        "failureRate": entry["failureRate"],
        "failureRatePercent": round(rate, 2),
        "baselineFailureRatePercent": round(baseline * 100, 2),
        "lift": round(lift, 3),
        "sampleSize": entry["total"],
        "failedCount": entry["failed"],
        "severity": severity,
        "sufficient": bool(entry.get("sufficient")),
        "description": (
            f"{rate:.2f}% of the {entry['total']:,} historical "
            f"transactions in this group failed, against a dataset "
            f"baseline of {baseline * 100:.2f}% "
            f"({lift:.2f}x)."
        ),
    }


def collect_causes(context, stats):
    """Every group this transaction belongs to, ranked by lift."""
    baseline = stats["dataset"]["failureRate"]
    min_sample = stats.get("minSample", MIN_SAMPLE_DEFAULT)
    min_lift = stats.get("minUsefulLift", 1.15)

    checks = []

    single = {
        "network_type": context["network_type"],
        "sender_bank": context["sender_bank"],
        "receiver_bank": context["receiver_bank"],
        "transaction_type": context["transaction_type"],
        "device_type": context["device_type"],
        "day_of_week": context["day_of_week"],
        "is_weekend": context["is_weekend"],
        "hour_band": hour_band(context["hour_of_day"]),
    }

    for dimension, value in single.items():
        entry = stat_entry(stats, dimension, value)

        if not entry:
            checks.append(
                {
                    "dimension": dimension,
                    "dimensionLabel": stats.get(
                        "dimensionLabels", {}
                    ).get(dimension, dimension),
                    "value": value,
                    "found": False,
                    "note": "Value does not appear in the dataset.",
                }
            )
            continue

        cause = describe(
            dimension, value, entry, baseline, stats
        )
        cause["found"] = True
        cause["kind"] = "SINGLE"
        checks.append(cause)

    band = amount_band(context["amount"], stats.get("amountBands", []))

    if band:
        cause = describe(
            "amount_band", band["label"], band, baseline, stats
        )
        cause["found"] = True
        cause["kind"] = "SINGLE"
        checks.append(cause)

    pairs = {
        "network_type__transaction_type": [
            context["network_type"],
            context["transaction_type"],
        ],
        "network_type__device_type": [
            context["network_type"],
            context["device_type"],
        ],
        "sender_bank__network_type": [
            context["sender_bank"],
            context["network_type"],
        ],
        "hour_band__network_type": [
            hour_band(context["hour_of_day"]),
            context["network_type"],
        ],
        "transaction_type__device_type": [
            context["transaction_type"],
            context["device_type"],
        ],
    }

    for name, values in pairs.items():
        if any(value is None for value in values):
            continue

        entry = crosstab_entry(stats, name, values)

        if not entry:
            continue

        primary, secondary = name.split("__")

        cause = describe(
            name,
            " + ".join(str(value) for value in values),
            entry,
            baseline,
            stats,
        )
        cause["found"] = True
        cause["kind"] = "INTERACTION"
        cause["dimensions"] = [primary, secondary]
        cause["values"] = [str(value) for value in values]
        cause["sufficient"] = (
            bool(entry.get("sufficient"))
            and entry["total"] >= MIN_CROSSTAB_SAMPLE
        )
        cause["description"] = (
            f"{entry['failureRate'] * 100:.2f}% of the "
            f"{entry['total']:,} transactions matching this "
            f"combination failed, against a dataset baseline of "
            f"{baseline * 100:.2f}% ({cause['lift']:.2f}x). "
            f"This is measured on the combination, not on either "
            f"field on its own."
        )
        checks.append(cause)

    proven = [
        check
        for check in checks
        if check.get("found")
        and check.get("sufficient")
        and check.get("lift") is not None
    ]

    significant = sorted(
        [
            check
            for check in proven
            if check["lift"] >= min_lift
        ],
        key=lambda check: (
            SEVERITY_ORDER.get(check["severity"], 3),
            -check["lift"],
            -check["sampleSize"],
        ),
    )

    thin = [
        {
            "dimension": check["dimension"],
            "value": check["value"],
            "sampleSize": check.get("sampleSize"),
            "note": "Too few historical rows to draw a conclusion.",
        }
        for check in proven
        if not check["sufficient"]
    ]

    return {
        "baselineFailureRate": round(baseline, 6),
        "baselineFailureRatePercent": round(baseline * 100, 2),
        "datasetRows": stats["dataset"]["totalRows"],
        "minSample": min_sample,
        "minUsefulLift": min_lift,
        "causes": significant,
        "checked": [
            check
            for check in sorted(
                proven,
                key=lambda check: -(
                    check.get("lift") or 0
                ),
            )
        ],
        "insufficientGroups": thin,
        "missingValues": [
            check
            for check in checks
            if not check.get("found")
        ],
        "significant": len(significant) > 0,
        # False when a form value does not exist in the dataset,
        # which means no cause could be measured at all. This is
        # different from "nothing significant was found".
        "evaluated": not any(
            not check.get("found") for check in checks
        ),
    }


# ==========================================
# 3. RECOMMENDATION
#
# The advice is the group with the lowest measured failure rate
# in the same dimension, so "try 5G instead" is only ever said
# when 5G really is better in the data.
# ==========================================

def best_alternative(stats, dimension, current_value, min_lift):
    table = stats["dimensions"].get(dimension)

    if not table:
        return None

    baseline = stats["dataset"]["failureRate"]
    current = stat_entry(stats, dimension, current_value)

    candidates = [
        (key, entry)
        for key, entry in table.items()
        if entry.get("sufficient")
        and key.lower() != str(current_value).lower()
    ]

    if not candidates:
        return None

    key, entry = min(
        candidates, key=lambda item: item[1]["failureRate"]
    )

    if not current:
        return None

    current_rate = current["failureRate"]
    relative = (
        (current_rate - entry["failureRate"]) / current_rate
        if current_rate > 0
        else 0.0
    )

    return {
        "dimension": dimension,
        "dimensionLabel": stats.get("dimensionLabels", {}).get(
            dimension, dimension.replace("_", " ")
        ),
        "value": key,
        "failureRatePercent": round(entry["failureRate"] * 100, 2),
        "lift": round(entry["failureRate"] / baseline, 3)
        if baseline > 0
        else None,
        "sampleSize": entry["total"],
        "currentFailureRatePercent": round(current_rate * 100, 2),
        "relativeImprovement": round(relative, 4),
        "absoluteImprovement": round(
            (current_rate - entry["failureRate"]) * 100, 2
        ),
        # Only a clearly better option counts as a recommendation.
        "isBetter": bool(
            entry["failureRate"] < current_rate
            and relative >= MIN_RELATIVE_IMPROVEMENT
        ),
        "clearsBaseline": bool(
            baseline > 0
            and entry["failureRate"] / baseline <= min_lift
        ),
    }


def build_recommendation(context, root_cause, knn, stats):
    baseline = stats["dataset"]["failureRate"]
    min_lift = stats.get("minUsefulLift", 1.15)

    # ---------------------------------------------------------
    # NOT EVALUATED
    #
    # Some form value does not exist in the dataset, so no group
    # could be measured. Saying "conditions look fine" here would
    # be a guess dressed up as an answer.
    # ---------------------------------------------------------

    if not root_cause["evaluated"]:
        missing = ", ".join(
            f"{dimension_label(missing_check['dimension'], stats)} "
            f"'{missing_check['value']}'"
            for missing_check in root_cause["missingValues"]
        )

        return {
            "dataDriven": True,
            "status": "NOT_EVALUATED",
            "title": "Cannot compare against history",
            "summary": (
                f"These values do not appear in the "
                f"{root_cause['datasetRows']:,}-row transaction "
                f"dataset: {missing}. No measured comparison is "
                f"possible, so no failure cause can be reported."
            ),
            "advice": (
                "Pick values from the dropdowns, which are loaded "
                "from the dataset itself."
            ),
            "actions": [],
            "baselineFailureRatePercent": round(baseline * 100, 2),
            "insufficientData": True,
        }

    actions = []
    used_dimensions = set()
    considered = []

    for cause in root_cause["causes"]:
        if cause["kind"] == "SINGLE":
            alternatives = [
                best_alternative(
                    stats, cause["dimension"], cause["value"], min_lift
                )
            ]
        else:
            # For an interaction, only the two fields involved can
            # be changed, so both are offered as options.
            alternatives = [
                best_alternative(
                    stats, dimension, value, min_lift
                )
                for dimension, value in zip(
                    cause.get("dimensions", []),
                    cause.get("values", []),
                )
            ]

        for alternative in alternatives:
            if not alternative:
                continue

            considered.append(alternative)

            if alternative["dimension"] in used_dimensions:
                continue

            if not alternative["isBetter"]:
                continue

            used_dimensions.add(alternative["dimension"])

            actions.append(
                {
                    "action": (
                        f"Use {alternative['value']} as the "
                        f"{alternative['dimensionLabel']} instead of "
                        f"{cause['value']}."
                        if cause["kind"] == "SINGLE"
                        else f"Switch the "
                        f"{alternative['dimensionLabel']} to "
                        f"{alternative['value']}."
                    ),
                    "reason": (
                        f"Historical failure rate falls from "
                        f"{alternative['currentFailureRatePercent']}% to "
                        f"{alternative['failureRatePercent']}% across "
                        f"{alternative['sampleSize']:,} matching "
                        f"transactions, a "
                        f"{alternative['relativeImprovement'] * 100:.0f}% "
                        f"relative reduction."
                    ),
                    "expectedFailureRatePercent": alternative[
                        "failureRatePercent"
                    ],
                    "currentFailureRatePercent": alternative[
                        "currentFailureRatePercent"
                    ],
                    "relativeImprovement": alternative[
                        "relativeImprovement"
                    ],
                    "sampleSize": alternative["sampleSize"],
                    "basedOnCause": {
                        "dimension": cause["dimensionLabel"],
                        "lift": cause["lift"],
                    },
                }
            )

    knn_rate = knn.get("failureRatePercent", 0)
    knn_lift = knn.get("lift")
    neighbour_text = (
        f"The closest {knn.get('neighborCount', 0)} historical "
        f"transactions failed {knn_rate}% of the time, against a "
        f"dataset baseline of "
        f"{root_cause['baselineFailureRatePercent']}%."
    )

    # ---------------------------------------------------------
    # A CAUSE STANDS OUT
    # ---------------------------------------------------------

    if root_cause["significant"]:
        worst = root_cause["causes"][0]

        title = "Conditions above the historical baseline"

        summary = (
            f"{neighbour_text} The strongest measured factor is "
            f"{worst['dimensionLabel']} = {worst['value']} at "
            f"{worst['lift']:.2f}x the baseline, measured across "
            f"{worst['sampleSize']:,} historical transactions."
        )

    # ---------------------------------------------------------
    # NO SINGLE FACTOR, BUT THE NEIGHBOURHOOD IS ELEVATED
    #
    # The KNN measures the combination while the root cause table
    # measures each group on its own, so a raised neighbourhood
    # with no raised single factor is a real and common outcome.
    # Reporting only the single-factor result would hide it.
    # ---------------------------------------------------------

    elif knn_lift is not None and knn_lift >= 1.25 and knn.get("sufficient"):
        title = "Similar transactions fail more often"

        summary = (
            f"{neighbour_text} No single field is above the baseline "
            f"on its own, but transactions like this one fail "
            f"{knn_lift:.2f}x as often as the dataset average. The "
            f"effect only appears in the combination, which is "
            f"consistent with the "
            f"{len(root_cause['checked'])} groups measured here all "
            f"sitting within normal range."
        )

    # ---------------------------------------------------------
    # NOTHING STANDS OUT
    # ---------------------------------------------------------

    else:
        title = "Conditions match the historical baseline"

        summary = (
            f"{neighbour_text} No factor in this transaction stands "
            f"out. On this dataset the failure rate is close to flat "
            f"across network, device, bank and transaction type, so "
            f"there is no measured reason to change these settings."
        )

    if actions:
        advice = (
            "The changes below are the only ones the dataset "
            "supports. Each one is a measured difference, not a "
            "general rule."
        )
    elif root_cause["significant"]:
        title = "No measured improvement available"
        summary = (
            f"{neighbour_text} A factor in this transaction fails "
            f"more often than the baseline, but no alternative value "
            f"in the dataset improves on it by the required "
            f"{MIN_RELATIVE_IMPROVEMENT * 100:.0f}%, so there is no "
            f"supported change to recommend."
        )
        advice = (
            "Retry as planned, or retry later. The data does not "
            "support changing these settings."
        )
    else:
        advice = (
            "Proceed as planned. There is no measured reason to "
            "change the amount, time, bank, device, network or "
            "transaction type."
        )

    return {
        "dataDriven": True,
        "status": "MEASURED",
        "title": title,
        "summary": summary,
        "advice": advice,
        "actions": actions,
        "rejectedAlternatives": [
            {
                "dimension": alternative["dimensionLabel"],
                "value": alternative["value"],
                "currentFailureRatePercent": alternative[
                    "currentFailureRatePercent"
                ],
                "failureRatePercent": alternative[
                    "failureRatePercent"
                ],
                "relativeImprovement": alternative[
                    "relativeImprovement"
                ],
                "reason": (
                    "Improvement is below the "
                    f"{MIN_RELATIVE_IMPROVEMENT * 100:.0f}% threshold, "
                    "so it is treated as noise."
                ),
            }
            for alternative in considered
            if not alternative["isBetter"]
        ],
        "baselineFailureRatePercent": round(baseline * 100, 2),
        "insufficientData": False,
    }


# ==========================================
# 4. ANOMALY
#
# The saved Isolation Forest treats transaction_status as an
# input, which does not exist yet for a planned transaction. The
# majority status of the KNN neighbours is used instead, and the
# substituted value is reported so the number stays auditable.
# ==========================================

def share_of(stats, dimension, value):
    entry = stat_entry(stats, dimension, value)

    if not entry:
        return None

    total = stats["dataset"]["totalRows"]

    return entry["total"] / total if total else None


def run_anomaly(context, estimated_status, stats):
    package = load_anomaly()

    if package is None:
        return {
            "available": False,
            "reason": "anomaly_model.pkl is not available.",
        }

    reference = stats.get("anomalyReference")

    if not reference:
        return {
            "available": False,
            "reason": "Anomaly reference distribution is missing.",
        }

    features = reference["features"]

    row = pd.DataFrame([{**context, "transaction_status": estimated_status}])
    row = row.reindex(columns=features)

    encoded = package["preprocessor"].transform(row[features])
    raw_score = float(package["model"].score_samples(encoded)[0])
    prediction = int(package["model"].predict(encoded)[0])

    quantiles = np.asarray(reference["quantiles"], dtype=np.float64)

    percentile = float(
        np.interp(raw_score, quantiles, np.linspace(0, 100, len(quantiles)))
    )

    anomaly_score = round(100 - percentile, 2)
    is_anomaly = prediction == -1

    # Only measured rarity is used as an explanation. Nothing
    # here claims the transaction is fraudulent.
    reasons = []

    for dimension, column in [
        ("network_type", "network type"),
        ("device_type", "device"),
        ("transaction_type", "transaction type"),
        ("sender_bank", "sender bank"),
    ]:
        share = share_of(stats, dimension, context.get(dimension))

        if share is not None and share < 0.08:
            reasons.append(
                f"{column} '{context.get(dimension)}' covers only "
                f"{share * 100:.1f}% of the historical dataset."
            )

    band = amount_band(context["amount"], stats.get("amountBands", []))

    if band:
        top = stats["amountBands"][-1] if stats["amountBands"] else None

        if top and top["min"] > 0:
            ratio = context["amount"] / top["min"]

            if ratio >= 1:
                reasons.append(
                    f"Amount is {ratio:.1f}x the top decile cut-off of "
                    f"{top['min']:,.0f}."
                )

    if not reasons and is_anomaly:
        reasons.append(
            "The model isolates this combination, but none of its "
            "individual fields is rare in the dataset."
        )

    return {
        "available": True,
        "algorithm": "Isolation Forest",
        "anomalyScore": anomaly_score,
        "status": "ANOMALY" if is_anomaly else "NORMAL",
        "isAnomaly": is_anomaly,
        "rawScore": round(raw_score, 8),
        "rawScoreMin": reference["minRaw"],
        "rawScoreMax": reference["maxRaw"],
        "referenceSize": reference["sampleSize"],
        "substitutedStatus": estimated_status,
        "reasons": reasons,
    }


# ==========================================
# ENTRY POINT
# ==========================================

def analyse(payload):
    context = resolve_input(payload)
    stats = load_stats()

    knn = run_knn(context)

    estimated_status = "SUCCESS"

    if knn.get("available") and knn.get("neighborCount"):
        estimated_status = (
            "FAILED"
            if knn["failedCount"] > knn["successCount"]
            else "SUCCESS"
        )

    root_cause = collect_causes(context, stats)
    recommendation = build_recommendation(
        context, root_cause, knn, stats
    )
    anomaly = run_anomaly(context, estimated_status, stats)

    return {
        "context": context,
        "evaluatedAt": datetime.now().isoformat(),
        "dataset": stats["dataset"],
        "datasetGeneratedAt": stats.get("generatedAt"),
        "knn": knn,
        "rootCause": root_cause,
        "recommendation": recommendation,
        "anomaly": anomaly,
    }


def serve():
    """Long-lived worker mode.

    Loading the KNN package alone takes several seconds, which is
    far too slow to repeat on every risk check. In serve mode the
    models are loaded once and the process then answers one JSON
    request per line on stdin, writing one JSON response per line
    on stdout.

    Nothing except responses may be written to stdout, because the
    Node side parses it line by line. Diagnostics go to stderr.
    """
    try:
        load_knn()
        load_stats()
        load_anomaly()
    except Exception as error:  # noqa: BLE001
        print(
            json.dumps(
                {
                    "op": "fatal",
                    "error": str(error),
                }
            ),
            flush=True,
        )
        sys.exit(1)

    print(json.dumps({"op": "ready"}), flush=True)

    for line in sys.stdin:
        line = line.strip()

        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue

        if message.get("op") == "shutdown":
            break

        request_id = message.get("id")

        try:
            result = analyse(message.get("payload") or {})

            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": True,
                        "result": result,
                    }
                ),
                flush=True,
            )
        except Exception as error:  # noqa: BLE001
            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": False,
                        "error": str(error),
                        "type": type(error).__name__,
                    }
                ),
                flush=True,
            )

    sys.exit(0)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        serve()
        return

    if len(sys.argv) < 2:
        print(
            json.dumps(
                {"error": "No input payload was supplied."}
            )
        )
        sys.exit(1)

    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError as error:
        print(json.dumps({"error": f"Invalid input: {error}"}))
        sys.exit(1)

    try:
        result = analyse(payload)
    except Exception as error:  # noqa: BLE001
        print(
            json.dumps(
                {
                    "error": str(error),
                    "type": type(error).__name__,
                }
            )
        )
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
