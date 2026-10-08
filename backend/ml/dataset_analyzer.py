"""Ad-hoc analysis of an uploaded UPI / payment transaction dataset.

This is deliberately separate from `historical_analysis.py`. That module
answers questions about the *fixed* 250,000 row `upi_transactions`
table, where the column names and the meaning of each value are known.
An uploaded file has neither guarantee: the columns may be named
differently, the outcome may be spelled differently, or the file may
have no outcome column at all.

So this module never assumes a schema. It reads the header, infers what
each column appears to be, and then reports *only* the KPIs, charts and
insights the file can actually support. Anything it cannot measure is
listed under `unsupported` with the reason, rather than being silently
omitted or filled with a plausible-looking guess.

Output is a JSON document, either printed once or served one request per
line (see `serve`).

Usage
-----
    python dataset_analyzer.py '{"fileName": "x.csv", "base64": "..."}'
    python dataset_analyzer.py --serve
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import os
import re
import sys
import tempfile
import warnings
from datetime import datetime

import pandas as pd


# ==========================================
# LIMITS
# ==========================================

# The API rejects anything larger before base64 is decoded, so these are
# a second line of defence rather than the primary limit.
MAX_BYTES = 25 * 1024 * 1024

# A dataset large enough to be slow in the browser is trimmed, and the
# response says so. Results are always computed on the rows analysed.
MAX_ROWS = 200_000

# Above this row count a text column is only parsed with vectorised
# strategies. The per-value dateutil fallback is linear and slow enough
# that using it here would make a large upload time out.
MIXED_PARSE_ROW_LIMIT = 5_000

# Cardinality above which a text column is treated as an identifier or
# free text rather than something to group by.
MAX_CATEGORY_VALUES = 60

TOP_N = 8

# A group needs this many rows before its rate is reported, and it must
# beat the dataset baseline by this factor to be called a driver.
MIN_GROUP_SIZE = 30
MIN_USEFUL_LIFT = 1.15

ALLOWED_SUFFIXES = (".csv", ".xlsx", ".xls")


# ==========================================
# COLUMN INFERENCE
# ==========================================

# Ordered: the first pattern that matches wins, so more specific words
# are listed before the general ones.
NAME_HINTS = {
    "identifier": (
        "transaction_id",
        "transactionid",
        "txn_id",
        "txnid",
        "upi_ref",
        "upi_ref_no",
        "reference",
        "ref_no",
        "rrn",
        "id",
    ),
    "timestamp": (
        "timestamp",
        "transaction_time",
        "txn_time",
        "datetime",
        "date_time",
        "created_at",
        "date",
        "time",
    ),
    "status": (
        "transaction_status",
        "txn_status",
        "status",
        "result",
        "outcome",
    ),
    "amount": (
        "amount",
        "amt",
        "txn_amount",
        "transaction_amount",
        "value",
        "total",
    ),
    "flag": (
        "fraud_flag",
        "is_fraud",
        "fraud",
        "flag",
        "is_",
    ),
}

# Values that identify an outcome column even when the header does not.
FAILURE_WORDS = {
    "failed",
    "fail",
    "failure",
    "failure_reason",
    "unsuccessful",
    "unsuccess",
    "declined",
    "decline",
    "rejected",
    "reject",
    "error",
    "cancelled",
    "canceled",
    "pending_failed",
    "returned",
    "returned_failure",
    "nack",
    "denied",
}

SUCCESS_WORDS = {
    "success",
    "successful",
    "successfully",
    "completed",
    "complete",
    "settled",
    "ok",
    "paid",
    "captured",
    "approved",
    "done",
    "true",
    "1",
}

TIMESTAMP_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d-%m-%Y %H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M:%S",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%Y-%m-%d",
    "%H:%M:%S",
    "%H:%M",
)


def _norm(name) -> str:
    """Lower-case a header and collapse separators so that
    "Sender Bank", "sender_bank" and "senderBank" all match the same
    hint."""
    text = str(name).strip().lower()
    for char in (" ", "-", "."):
        text = text.replace(char, "_")
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def _role_from_name(name: str) -> str:
    norm = _norm(name)
    for role, hints in NAME_HINTS.items():
        for hint in hints:
            if hint in norm:
                return role
    return ""


def _is_numeric(series: pd.Series) -> bool:
    return pd.api.types.is_numeric_dtype(series)


def _looks_like_money(values: pd.Series) -> bool:
    """Money columns hold values with two decimal places and a wide
    range. Used only to break ties between candidate amount columns."""
    numbers = pd.to_numeric(values, errors="coerce").dropna()
    if numbers.empty:
        return False
    if numbers.min() < 0:
        return False
    if float(numbers.max()) < 100:
        return False
    return bool((numbers % 1 != 0).mean() > 0.3)


def _role_from_values(series: pd.Series, name: str) -> str:
    lowered = set(
        str(v).strip().lower()
        for v in series.dropna().unique()[:200]
        if str(v).strip()
    )
    if not lowered:
        return ""

    hits = len(lowered & FAILURE_WORDS) + len(lowered & SUCCESS_WORDS)

    # A two-value column where one side is a failure word is an outcome
    # column, whatever the header says.
    if hits and len(lowered) <= 6 and (lowered & FAILURE_WORDS):
        return "status"

    if _is_numeric(series) and lowered <= {"0", "1"}:
        return "flag"

    return ""


def infer_columns(frame: pd.DataFrame) -> list:
    """Describe every column: its inferred role, type and quality."""
    total = len(frame)
    described = []

    for position, name in enumerate(frame.columns):
        series = frame[name]
        column_name = str(name)

        try:
            distinct = int(series.nunique(dropna=True))
        except TypeError:
            distinct = int(series.astype(str).nunique(dropna=True))

        missing = int(series.isna().sum())

        role = _role_from_name(column_name) or _role_from_values(
            series, column_name
        )

        if role == "amount" and not _is_numeric(series):
            role = ""

        if role == "flag" and not _is_numeric(series):
            role = ""

        # An identifier column is only worth calling one if it really is
        # close to unique.
        if role == "identifier" and total and distinct / total < 0.9:
            role = "category"

        if not role:
            if _is_numeric(series):
                role = "measure"
            elif distinct <= MAX_CATEGORY_VALUES:
                role = "category"
            elif total and distinct / total > 0.9:
                role = "identifier"
            else:
                role = "text"

        samples = [
            str(v) for v in series.dropna().unique()[:6]
        ]

        described.append(
            {
                "name": column_name,
                "key": f"c{position}",
                "role": role,
                "dtype": str(series.dtype),
                "distinct": distinct,
                "missing": missing,
                "missingPercent": round(missing / total * 100, 2)
                if total
                else 0.0,
                "samples": samples,
            }
        )

    # An amount column is only useful if it is genuinely numeric.
    numeric_names = {
        d["name"]
        for d in described
        if d["role"] == "amount" and _is_numeric(frame[d["name"]])
    }

    if not numeric_names:
        for described_column in described:
            if described_column["role"] == "measure" and _looks_like_money(
                frame[described_column["name"]]
            ):
                described_column["role"] = "amount"
                numeric_names.add(described_column["name"])
                break

    return described


def column_of(frame: pd.DataFrame, described: list, role: str):
    for entry in described:
        if entry["role"] == role:
            return frame[entry["name"]]
    return None


def find_status_column(frame: pd.DataFrame, described: list):
    """Return (name, failed_values, success_values), or None.

    The status vocabulary is read from the data rather than assumed, so a
    file that spells it "DECLINED" or "NACK" is still understood.

    Returning None rather than a placeholder tuple matters: callers guard
    with `if status_info`, and a tuple is always truthy.
    """
    for entry in described:
        if entry["role"] != "status":
            continue

        series = frame[entry["name"]].dropna()
        values = set(str(v).strip() for v in series.unique())

        failed = {v for v in values if v.lower() in FAILURE_WORDS}
        success = {v for v in values if v.lower() in SUCCESS_WORDS}

        if failed and success:
            return entry["name"], failed, success

        # Only one side present: treat the other side as "everything
        # else" so the rate is still measurable.
        if failed or success:
            return entry["name"], failed, success

    return None


# ==========================================
# READING THE FILE
# ==========================================

def decode_payload(payload: dict) -> bytes:
    encoded = payload.get("base64") or payload.get("content") or ""

    if not encoded:
        raise ValueError(
            "The upload did not contain any file data. Please choose a "
            "CSV or Excel file and try again."
        )

    if "," in encoded[:200] and encoded.lstrip().startswith("data:"):
        encoded = encoded.split(",", 1)[1]

    try:
        raw = base64.b64decode(encoded, validate=False)
    except (binascii.Error, ValueError) as error:
        raise ValueError(
            f"The uploaded file could not be decoded ({error})."
        ) from error

    if not raw:
        raise ValueError("The uploaded file is empty.")

    if len(raw) > MAX_BYTES:
        raise ValueError(
            f"The file is {len(raw) / 1048576:.1f} MB. The limit is "
            f"{MAX_BYTES // 1048576} MB."
        )

    return raw


def read_frame(payload: dict):
    file_name = str(payload.get("fileName") or payload.get("name") or "")
    suffix = os.path.splitext(file_name)[1].lower()

    if suffix and suffix not in ALLOWED_SUFFIXES:
        raise ValueError(
            f"'{suffix}' files are not supported. Upload a "
            f"{', '.join(ALLOWED_SUFFIXES)} file."
        )

    raw = decode_payload(payload)

    # pandas needs a seekable object, so the decoded bytes go to a real
    # file on disk rather than staying in memory.
    handle, path = tempfile.mkstemp(suffix=suffix or ".csv")
    os.close(handle)

    try:
        with open(path, "wb") as target:
            target.write(raw)

        suffix_to_use = suffix or ".csv"

        try:
            if suffix_to_use in (".xlsx", ".xls"):
                frame = pd.read_excel(path)
            else:
                frame = pd.read_csv(path)
        except ImportError as error:
            raise ValueError(
                "Reading this Excel file needs an extra pandas engine "
                f"that is not installed ({error}). Re-save the file as "
                "CSV or .xlsx and try again."
            ) from error
        except UnicodeDecodeError as error:
            raise ValueError(
                "The file is not readable as text. It may be a binary "
                "Excel file saved with an .xlsx extension, or it may be "
                "encoded unusually."
            ) from error
        except Exception as error:  # noqa: BLE001
            if suffix_to_use in (".xlsx", ".xls"):
                raise ValueError(
                    "This Excel file could not be opened. It may be "
                    "corrupt, or it may be a CSV or text file that was "
                    "renamed to .xlsx. Re-saving it from Excel usually "
                    "fixes this."
                ) from error

            raise ValueError(
                f"The file could not be parsed as a table "
                f"({type(error).__name__}: {error}). Check that it is a "
                "comma-separated file with a header row."
            ) from error
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    if frame is None or frame.empty:
        raise ValueError(
            "The file contains no rows, so there is nothing to analyse."
        )

    return frame, file_name, len(raw)


# ==========================================
# KPIs
# ==========================================

def _clean_number(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, 4)


def build_kpis(
    frame: pd.DataFrame,
    described: list,
    file_name: str,
    byte_size: int,
    rows_analysed: int,
    status_info,
    parsed_times: dict,
) -> list:
    kpis = [
        {
            "key": "rows",
            "label": "Transactions Analysed",
            "value": rows_analysed,
            "format": "number",
        },
        {
            "key": "columns",
            "label": "Columns Found",
            "value": len(described),
            "format": "number",
        },
    ]

    amounts = column_of(frame, described, "amount")
    if amounts is not None:
        numbers = pd.to_numeric(amounts, errors="coerce").dropna()
        if not numbers.empty:
            kpis.append(
                {
                    "key": "amountTotal",
                    "label": "Total Amount",
                    "value": _clean_number(numbers.sum()),
                    "format": "currency",
                }
            )
            kpis.append(
                {
                    "key": "amountMean",
                    "label": "Average Transaction",
                    "value": _clean_number(numbers.mean()),
                    "format": "currency",
                }
            )
            kpis.append(
                {
                    "key": "amountMedian",
                    "label": "Median Transaction",
                    "value": _clean_number(numbers.median()),
                    "format": "currency",
                }
            )

    if status_info:
        name, failed_values, success_values = status_info
        status_series = frame[name].astype(str).str.strip()
        known = status_series.isin(failed_values | success_values)
        recognised = int(known.sum())
        failed = int(status_series.isin(failed_values).sum())

        if recognised:
            rate = failed / recognised * 100
            kpis.append(
                {
                    "key": "failureRate",
                    "label": "Failure Rate",
                    "value": round(rate, 2),
                    "format": "percent",
                }
            )
            kpis.append(
                {
                    "key": "failedCount",
                    "label": "Failed Transactions",
                    "value": failed,
                    "format": "number",
                }
            )
            kpis.append(
                {
                    "key": "recognisedStatus",
                    "label": "Outcome Values Recognised",
                    "value": len(failed_values | success_values),
                    "format": "number",
                }
            )

    time_range = build_time_range(frame, described, parsed_times)
    if time_range:
        kpis.append(time_range)

    kpis.append(
        {
            "key": "fileSize",
            "label": "File Size",
            "value": round(byte_size / 1024, 1),
            "format": "kilobytes",
        }
    )

    if file_name:
        kpis.append(
            {"key": "file", "label": "File", "value": file_name, "format": "text"}
        )

    return kpis


MONTH_NUMBERS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Shapes that are common in exported CSVs but are not ISO, and so never
# match a strptime format. Each pattern is rewritten to ISO with plain
# string operations, which stays vectorised and fast.
#
# A JavaScript Date written straight into a CSV produces
# "Tue Oct 08 2024 15:17:28 GMT+0530 (India Standard Time)", which
# otherwise forces dateutil to parse every row individually.
#
# The trailing `.*$` is deliberate: str.replace only substitutes the
# matched span, so the timezone name and any suffix have to be part of
# the match to be discarded.
DATE_TEXT_PATTERNS = (
    # Weekday, month, day, year, time. The weekday is optional so this
    # also covers "Tue, 08 Oct 2024 15:17:28 GMT".
    re.compile(
        r"^(?:\w{3},?\s+)?"
        r"(?P<month>\w{3})\s+"
        r"(?P<day>\d{1,2})\s+"
        r"(?P<year>\d{4})\s+"
        r"(?P<time>\d{1,2}:\d{2}(?::\d{2})?)"
        r"(?P<offset>\s*(?:GMT|UTC)?[+-]\d{2}:?\d{2})?"
        r".*$"
    ),
    # Day, month, year, time, as in "08 Oct 2024 15:17:28".
    re.compile(
        r"^(?P<day>\d{1,2})\s+"
        r"(?P<month>\w{3})\s+"
        r"(?P<year>\d{4})\s+"
        r"(?P<time>\d{1,2}:\d{2}(?::\d{2})?)"
        r"(?P<offset>\s*(?:GMT|UTC)?[+-]\d{2}:?\d{2})?"
        r".*$"
    ),
)


def _to_iso(match) -> str | None:
    """Rewrite a matched non-ISO date to ISO, keeping any UTC offset."""
    parts = match.groupdict()

    month = MONTH_NUMBERS.get(str(parts["month"])[:3].lower())

    if not month:
        return None

    time_part = str(parts["time"])

    if len(time_part) == 5:
        time_part = f"{time_part}:00"

    stamp = (
        f"{int(parts['year']):04d}-{month:02d}-"
        f"{int(parts['day']):02d} {time_part}"
    )

    offset = (parts.get("offset") or "").strip()

    if offset:
        offset = re.sub(r"^(GMT|UTC)", "", offset, flags=re.IGNORECASE)

        if len(offset) == 5 and ":" not in offset:
            offset = f"{offset[:3]}:{offset[3:]}"

        stamp = f"{stamp}{offset}"

    return stamp


def normalise_date_text(series: pd.Series) -> pd.Series:
    """Best-effort rewrite of exotic date text into ISO.

    Only applied when the column is text and no strptime format matched,
    because a JavaScript `Date` written straight into a CSV produces
    'Tue Oct 08 2024 15:17:28 GMT+0530 (India Standard Time)', which
    forces dateutil to parse every row individually.
    """
    text = series.astype(str).str.strip()

    for pattern in DATE_TEXT_PATTERNS:
        text = text.str.replace(pattern, _to_iso, regex=True)

    return text


def _to_datetime(series: pd.Series):
    """Parse a text column into timestamps.

    Only whole-column vectorised strategies are used here. The obvious
    `format="mixed"` fallback looks convenient but parses every single
    value through dateutil one at a time, which turned a 20,000 row file
    into a 14 second job.
    """
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    cleaned = series.astype(str).str.strip()
    cleaned = cleaned.where(cleaned.str.lower() != "nan", None)

    for fmt in TIMESTAMP_FORMATS:
        try:
            parsed = pd.to_datetime(cleaned, format=fmt, errors="coerce")
        except (ValueError, TypeError):
            continue

        if parsed.notna().mean() > 0.8:
            return parsed

    # Exported files often carry a JavaScript-style or RFC date string.
    # Rewriting that to ISO is a string operation, so it is far cheaper
    # than letting dateutil handle the whole column.
    try:
        normalised = normalise_date_text(cleaned)
    except (ValueError, TypeError, re.error):
        normalised = cleaned

    if normalised is not cleaned:
        # The normaliser keeps a UTC offset when the source had one, so
        # both the offset-aware and the naive layout are tried.
        for fmt in ("%Y-%m-%d %H:%M:%S%z", "%Y-%m-%d %H:%M:%S"):
            try:
                parsed = pd.to_datetime(
                    normalised, format=fmt, errors="coerce"
                )
            except (ValueError, TypeError):
                continue

            if parsed.notna().mean() > 0.8:
                return parsed

    # `format="mixed"` parses every value separately through dateutil,
    # which costs well over half a second per thousand rows. It is only
    # worth it on a small column. On a larger one the column is reported
    # as unparseable instead, which is both honest and keeps a big upload
    # from timing out.
    if len(cleaned) > MIXED_PARSE_ROW_LIMIT:
        return pd.Series(
            [pd.NaT] * len(cleaned), index=cleaned.index
        )

    for kwargs in ({"utc": True}, {"utc": True, "dayfirst": True}):
        with warnings.catch_warnings():
            # The point of this branch is to tolerate an unknown layout,
            # so the advisory warning about it is expected.
            warnings.simplefilter("ignore", UserWarning)

            try:
                parsed = pd.to_datetime(cleaned, errors="coerce", **kwargs)
            except (ValueError, TypeError):
                continue

        if parsed.notna().mean() > 0.8:
            return parsed

    return pd.to_datetime(cleaned, errors="coerce", utc=True)


def parse_all_timestamps(frame: pd.DataFrame, described: list) -> dict:
    """Parse every timestamp column once.

    Both the KPI summary and the charts want the same parsed column, and
    parsing a large text column is the single most expensive step in this
    module, so it happens here and is passed around.
    """
    parsed_times = {}

    for entry in described:
        if entry["role"] != "timestamp":
            continue

        try:
            parsed_times[entry["name"]] = _to_datetime(frame[entry["name"]])
        except (ValueError, TypeError):
            parsed_times[entry["name"]] = pd.Series(
                [pd.NaT] * len(frame), index=frame.index
            )

    return parsed_times


def build_time_range(frame: pd.DataFrame, described: list, parsed_times: dict):
    for entry in described:
        if entry["role"] != "timestamp":
            continue

        parsed = parsed_times.get(entry["name"])

        if parsed is None:
            continue

        parsed = parsed.dropna()

        if parsed.empty:
            continue

        return {
            "key": "period",
            "label": "Period Covered",
            "value": (
                f"{parsed.min():%d %b %Y} to {parsed.max():%d %b %Y}"
            ),
            "format": "text",
        }
    return None


# ==========================================
# CHARTS
# ==========================================

def build_charts(frame, described, status_info, parsed_times) -> list:
    charts = []

    # ---- outcome distribution
    if status_info:
        name, failed_values, success_values = status_info
        counts = frame[name].astype(str).str.strip().value_counts()
        entries = [
            {
                "label": str(label),
                "value": int(value),
                "tone": "danger" if str(label) in failed_values else "ok",
            }
            for label, value in counts.head(TOP_N).items()
        ]
        if entries:
            charts.append(
                {
                    "key": "statusMix",
                    "title": "Outcome distribution",
                    "kind": "bar",
                    "source": name,
                    "entries": entries,
                }
            )

    # ---- amount distribution
    amounts = column_of(frame, described, "amount")
    if amounts is not None:
        numbers = pd.to_numeric(amounts, errors="coerce").dropna()
        if len(numbers) >= 5:
            # Edges are placed explicitly across the observed range.
            # pandas' own binning rounds outwards to "nice" numbers,
            # which produces a bin starting below zero and a label that
            # does not match any row in the file.
            low = float(numbers.min())
            high = float(numbers.max())
            bin_count = min(8, max(2, len(numbers) // 40))

            if high > low:
                width = (high - low) / bin_count
                edges = [low + width * i for i in range(bin_count + 1)]
                edges[-1] = high

                buckets = pd.cut(numbers, bins=edges, include_lowest=True)
                counts = buckets.value_counts().sort_index()

                entries = [
                    {
                        "label": (
                            f"{float(bucket.left):,.0f}"
                            f"–{float(bucket.right):,.0f}"
                        ),
                        "value": int(value),
                        "tone": "primary",
                    }
                    for bucket, value in counts.items()
                    if value > 0
                ]
            else:
                # Every transaction is the same amount.
                entries = [
                    {
                        "label": f"{low:,.0f}",
                        "value": int(len(numbers)),
                        "tone": "primary",
                    }
                ]

            if entries:
                charts.append(
                    {
                        "key": "amountSpread",
                        "title": "Transaction amount distribution",
                        "kind": "bar",
                        "source": "amount",
                        "entries": entries,
                    }
                )

    # ---- failure rate per category
    if status_info:
        name, failed_values, _ = status_info
        status_series = frame[name].astype(str).str.strip()
        failed_mask = status_series.isin(failed_values)
        baseline = failed_mask.mean()

        for entry in described:
            if entry["role"] not in ("category", "flag"):
                continue
            if entry["name"] == name:
                continue

            series = frame[entry["name"]]
            grouped = pd.DataFrame(
                {
                    "group": series.astype(str).str.strip(),
                    "failed": failed_mask,
                }
            )
            grouped = grouped[grouped["group"] != ""]
            grouped = grouped[grouped["group"].str.lower() != "nan"]

            if grouped["group"].nunique() < 2:
                continue

            stats = grouped.groupby("group")["failed"].agg(
                total="size", failures="sum"
            )
            stats = stats[stats["total"] >= MIN_GROUP_SIZE].copy()

            if stats.empty:
                continue

            stats["rate"] = stats["failures"] / stats["total"] * 100
            stats["lift"] = stats["rate"] / (baseline * 100) if baseline > 0 else 0
            stats = stats.sort_values("rate", ascending=False).head(TOP_N)

            if stats.empty:
                continue

            charts.append(
                {
                    "key": f"rate:{entry['name']}",
                    "title": f"Failure rate by {entry['name'].replace('_', ' ')}",
                    "kind": "rateBar",
                    "source": entry["name"],
                    "baselinePercent": round(baseline * 100, 2),
                    "entries": [
                        {
                            "label": str(idx),
                            "value": round(float(row.rate), 2),
                            "total": int(row.total),
                            "failures": int(row.failures),
                            "lift": round(float(row.lift), 3),
                            "tone": "danger"
                            if row.lift >= MIN_USEFUL_LIFT
                            else "ok",
                        }
                        for idx, row in stats.iterrows()
                    ],
                }
            )

    # ---- volume per category, when there is no outcome column
    if not status_info:
        for entry in described:
            if entry["role"] != "category":
                continue
            counts = (
                frame[entry["name"]]
                .astype(str)
                .str.strip()
                .replace("nan", "")
                .replace("", pd.NA)
                .dropna()
                .value_counts()
                .head(TOP_N)
            )
            if len(counts) < 2:
                continue
            charts.append(
                {
                    "key": f"volume:{entry['name']}",
                    "title": f"Transactions by {entry['name'].replace('_', ' ')}",
                    "kind": "bar",
                    "source": entry["name"],
                    "entries": [
                        {
                            "label": str(label),
                            "value": int(value),
                            "tone": "primary",
                        }
                        for label, value in counts.items()
                    ],
                }
            )

    # ---- volume by hour, if a timestamp survived parsing
    for entry in described:
        if entry["role"] != "timestamp":
            continue

        parsed = parsed_times.get(entry["name"])

        if parsed is None or parsed.notna().mean() < 0.5:
            continue

        hours = parsed.dropna().dt.hour.value_counts().sort_index()

        if len(hours) < 2:
            continue

        charts.append(
            {
                "key": "volumeByHour",
                "title": "Transactions by hour of day",
                "kind": "bar",
                "source": entry["name"],
                "entries": [
                    {
                        "label": f"{int(hour):02d}:00",
                        "value": int(value),
                        "tone": "primary",
                    }
                    for hour, value in hours.items()
                ],
            }
        )
        break

    return charts


# ==========================================
# INSIGHTS
# ==========================================

def build_insights(frame, described, status_info, rows_analysed, truncated) -> list:
    insights = []

    # ---- outcome column
    if status_info:
        name, failed_values, success_values = status_info
        known = set(failed_values | success_values)
        series = frame[name].astype(str).str.strip()
        recognised = int(series.isin(known).sum())

        if recognised < len(frame):
            unrecognised = frame[~series.isin(known)][name]
            values = sorted(set(unrecognised.astype(str)))[:6]
            insights.append(
                {
                    "severity": "warning",
                    "title": "Some outcome values were not recognised",
                    "detail": (
                        f"{len(frame) - recognised} of {len(frame)} rows in "
                        f"'{name}' use a value this analyser does not know. "
                        "They are excluded from the failure rate. Recognised "
                        f"values: {', '.join(sorted(known))}. Unrecognised "
                        f"examples: {', '.join(values)}."
                    ),
                }
            )
    else:
        insights.append(
            {
                "severity": "info",
                "title": "No outcome column was found",
                "detail": (
                    "This file has no column that identifies whether a "
                    "transaction failed, so no failure rate can be "
                    "measured. Add a status column with values such as "
                    "SUCCESS and FAILED to unlock failure analysis."
                ),
            }
        )

    # ---- does this look like a transaction dataset at all?
    roles = {entry["role"] for entry in described}

    if not status_info and "amount" not in roles:
        insights.append(
            {
                "severity": "warning",
                "title": "This may not be a transaction dataset",
                "detail": (
                    f"The file parsed, but it has {len(described)} column"
                    f"{'s' if len(described) != 1 else ''} and none of them "
                    "look like a transaction amount or outcome, so only "
                    "simple counts are shown. Check that the delimiter is a "
                    "comma and that the first row is a header."
                ),
            }
        )

    # ---- strongest drivers
    if status_info:
        name, failed_values, _ = status_info
        status_series = frame[name].astype(str).str.strip()
        failed_mask = status_series.isin(failed_values)
        baseline = failed_mask.mean()

        if baseline == 0:
            insights.append(
                {
                    "severity": "info",
                    "title": "No failures in this file",
                    "detail": (
                        f"'{name}' contains no value this analyser reads as "
                        "a failure, so the failure rate is 0% and there is "
                        "no failure pattern to look for. If failures are "
                        "expected, check that the outcome column uses a "
                        "recognisable value such as FAILED or DECLINED."
                    ),
                }
            )
        else:
            drivers = []

            for entry in described:
                if entry["role"] not in ("category", "flag"):
                    continue
                if entry["name"] == name:
                    continue

                grouped = pd.DataFrame(
                    {
                        "group": frame[entry["name"]]
                        .astype(str)
                        .str.strip()
                        .replace("nan", "")
                        .replace("", pd.NA),
                        "failed": failed_mask,
                    }
                ).dropna(subset=["group"])

                if grouped["group"].nunique() < 2:
                    continue

                stats = grouped.groupby("group")["failed"].agg(
                    total="size", failures="sum"
                )
                stats = stats[stats["total"] >= MIN_GROUP_SIZE].copy()

                if stats.empty:
                    continue

                stats["rate"] = stats["failures"] / stats["total"]
                stats["lift"] = stats["rate"] / baseline
                top = stats.sort_values("lift", ascending=False).head(1).iloc[0]

                if top["lift"] >= MIN_USEFUL_LIFT:
                    drivers.append(
                        {
                            "column": entry["name"],
                            "group": str(top.name),
                            "rate": round(float(top["rate"]) * 100, 2),
                            "lift": round(float(top["lift"]), 3),
                            "total": int(top["total"]),
                        }
                    )

            drivers.sort(key=lambda d: d["lift"], reverse=True)

            if drivers:
                listed = "; ".join(
                    f"{d['column']} = {d['group']} at {d['rate']}% "
                    f"({d['lift']}x the {round(baseline * 100, 2)}% baseline, "
                    f"{d['total']:,} rows)"
                    for d in drivers[:3]
                )
                insights.append(
                    {
                        "severity": "warning",
                        "title": "Groups that fail more than the baseline",
                        "detail": (
                            f"Measured against a {round(baseline * 100, 2)}% "
                            f"baseline, requiring at least {MIN_GROUP_SIZE} "
                            f"rows and a {MIN_USEFUL_LIFT}x lift: {listed}."
                        ),
                    }
                )
            else:
                insights.append(
                    {
                        "severity": "info",
                        "title": "No group stands out from the baseline",
                        "detail": (
                            "No category in this file failed "
                            f"{MIN_USEFUL_LIFT}x more often than the "
                            f"{round(baseline * 100, 2)}% overall rate on a "
                            f"sample of at least {MIN_GROUP_SIZE} rows. "
                            "Nothing in this data explains the failures."
                        ),
                    }
                )

    # ---- data quality
    quality = []
    total = len(frame)

    for entry in described:
        if entry["missingPercent"] >= 25:
            quality.append(
                f"'{entry['name']}' is {entry['missingPercent']}% empty"
            )
        elif entry["missing"] > 0:
            quality.append(
                f"'{entry['name']}' has {entry['missing']:,} empty values"
            )

    if described and len(described) == 1:
        quality.append("the file has a single column")

    for entry in described:
        if entry["role"] == "identifier" and total:
            ratio = entry["distinct"] / total
            if ratio < 1:
                quality.append(
                    f"'{entry['name']}' repeats values "
                    f"({entry['distinct']:,} unique in {total:,} rows)"
                )

    if truncated:
        quality.append(
            f"only the first {rows_analysed:,} rows were analysed"
        )

    if quality:
        insights.append(
            {
                "severity": "warning",
                "title": "Data quality notes",
                "detail": ". ".join(quality) + ".",
            }
        )

    if not insights:
        insights.append(
            {
                "severity": "info",
                "title": "Nothing notable found",
                "detail": (
                    "The file parsed cleanly and no issue stood out. There "
                    "is no outcome column, so no failure analysis was "
                    "attempted."
                ),
            }
        )

    return insights


# ==========================================
# UNSUPPORTED
# ==========================================

def build_unsupported(described, status_info, parsed_times) -> list:
    """State plainly what could not be computed, and why.

    Without this the response looks equally informative for a rich file
    and an empty one, which is misleading.
    """
    unsupported = []
    roles = {entry["role"] for entry in described}

    if not status_info:
        unsupported.append(
            {
                "feature": "Failure rate and failure drivers",
                "reason": "No column of transaction outcomes was found.",
            }
        )

    if "amount" not in roles:
        unsupported.append(
            {
                "feature": "Amount statistics",
                "reason": "No numeric amount column was found.",
            }
        )

    # A column that merely looks like a date is not enough. If the values
    # in it cannot be read as dates, the hourly analysis is missing and
    # the file would otherwise give no sign of it, so it is called out
    # with an example of what could not be read.
    if "timestamp" in roles:
        time_names = [
            entry["name"]
            for entry in described
            if entry["role"] == "timestamp"
        ]
        readable = [
            name
            for name in time_names
            if parsed_times.get(name) is not None
            and parsed_times[name].notna().any()
        ]

        if not readable:
            unparsed = ", ".join(time_names[:3])

            unsupported.append(
                {
                    "feature": "Time period and hourly pattern",
                    "reason": (
                        f"{unparsed} looks like a date, but none of its "
                        "values could be read as one. Dates are read as "
                        "YYYY-MM-DD, or as a written date such as "
                        "'2024-10-08 15:17:28' or '08 Oct 2024 15:17'."
                    ),
                }
            )
    else:
        unsupported.append(
            {
                "feature": "Time period and hourly pattern",
                "reason": "No date or time column was found.",
            }
        )

    ignored = [
        entry["name"]
        for entry in described
        if entry["role"] == "text"
    ]
    if ignored:
        unsupported.append(
            {
                "feature": "Grouping by free-text columns",
                "reason": (
                    "Too many distinct values to group by: "
                    + ", ".join(ignored[:5])
                    + ("..." if len(ignored) > 5 else "")
                ),
            }
        )

    return unsupported


# ==========================================
# ENTRY POINT
# ==========================================

def analyse(payload: dict) -> dict:
    frame, file_name, byte_size = read_frame(payload)

    total_rows = len(frame)
    truncated = total_rows > MAX_ROWS

    if truncated:
        frame = frame.head(MAX_ROWS)

    described = infer_columns(frame)
    status_info = find_status_column(frame, described)
    parsed_times = parse_all_timestamps(frame, described)

    return {
        "file": {
            "name": file_name,
            "bytes": byte_size,
            "rowsInFile": total_rows,
            "rowsAnalysed": len(frame),
            "truncated": truncated,
        },
        "analysedAt": datetime.now().isoformat(),
        "columns": described,
        "outcome": {
            "available": bool(status_info),
            "column": status_info[0] if status_info else None,
            "failedValues": sorted(status_info[1]) if status_info else [],
            "successValues": sorted(status_info[2]) if status_info else [],
        },
        "kpis": build_kpis(
            frame,
            described,
            file_name,
            byte_size,
            len(frame),
            status_info,
            parsed_times,
        ),
        "charts": build_charts(frame, described, status_info, parsed_times),
        "insights": build_insights(
            frame, described, status_info, len(frame), truncated
        ),
        "unsupported": build_unsupported(
            described, status_info, parsed_times
        ),
    }


def serve():
    """Long-lived worker mode.

    Importing pandas costs about a second, which is worth avoiding on
    every upload. The process loads once, then answers one JSON request
    per line on stdin with one JSON response per line on stdout.

    Nothing but responses may reach stdout because the Node side reads
    it line by line. Diagnostics go to stderr.
    """
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
                    {"id": request_id, "ok": True, "result": result}
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

    if len(sys.argv) > 1:
        raw_argument = sys.argv[1]
    else:
        # A base64 upload of a few megabytes is far too long for a
        # command line on Windows, so the payload can arrive on stdin.
        raw_argument = sys.stdin.read()

    if not raw_argument.strip():
        print(json.dumps({"error": "No input payload was supplied."}))
        sys.exit(1)

    try:
        payload = json.loads(raw_argument)
    except json.JSONDecodeError as error:
        print(json.dumps({"error": f"Invalid input: {error}"}))
        sys.exit(1)

    try:
        result = analyse(payload)
    except Exception as error:  # noqa: BLE001
        print(
            json.dumps(
                {"error": str(error), "type": type(error).__name__}
            )
        )
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
