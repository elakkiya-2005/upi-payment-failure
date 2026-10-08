import os
from pathlib import Path
from urllib.parse import quote_plus

import joblib
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sklearn.compose import ColumnTransformer
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import OneHotEncoder, StandardScaler


MODEL_PATH = Path(__file__).with_name("knn_model.pkl")
FEATURE_COLUMNS = [
    "amount",
    "hour_of_day",
    "transaction_type",
    "sender_bank",
    "network_type",
]
NUMERIC_COLUMNS = ["amount", "hour_of_day"]
CATEGORICAL_COLUMNS = [
    "transaction_type",
    "sender_bank",
    "network_type",
]
TARGET_COLUMN = "transaction_status"
NEIGHBOR_COUNT = 25


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def get_engine():
    user = quote_plus(os.getenv("DB_USER", "root"))
    password = quote_plus(os.getenv("DB_PASSWORD", ""))
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "3306")
    database = quote_plus(os.getenv("DB_NAME", "upi_smart_recovery"))
    url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
    return create_engine(url)


def load_history():
    query = """
        SELECT
            transaction_id,
            amount,
            hour_of_day,
            transaction_type,
            sender_bank,
            network_type,
            transaction_status
        FROM upi_transactions
    """
    history = pd.read_sql_query(query, get_engine())

    for column in FEATURE_COLUMNS:
        if column in NUMERIC_COLUMNS:
            history[column] = pd.to_numeric(history[column], errors="coerce")
        else:
            history[column] = history[column].astype("string").str.strip()

    history[TARGET_COLUMN] = (
        history[TARGET_COLUMN].astype("string").str.strip().str.upper()
    )
    history = history.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
    history = history[history[TARGET_COLUMN].isin(["SUCCESS", "FAILED"])]
    history["amount"] = history["amount"].astype(float)
    history["hour_of_day"] = history["hour_of_day"].astype(int)

    return history.reset_index(drop=True)


def build_model(history):
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", StandardScaler(), NUMERIC_COLUMNS),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_COLUMNS,
            ),
        ]
    )

    encoded = preprocessor.fit_transform(history[FEATURE_COLUMNS])
    neighbor_count = min(NEIGHBOR_COUNT, len(history))
    model = KNeighborsClassifier(
        n_neighbors=neighbor_count,
        weights="uniform",
        metric="euclidean",
        n_jobs=-1,
    )
    model.fit(encoded, history[TARGET_COLUMN])

    return preprocessor, model, neighbor_count


def main():
    history = load_history()
    if len(history) < 2:
        raise RuntimeError("The transaction dataset does not contain enough rows.")

    status_counts = history[TARGET_COLUMN].value_counts()
    if len(status_counts) < 2:
        raise RuntimeError("The transaction dataset needs both SUCCESS and FAILED rows.")

    preprocessor, model, neighbor_count = build_model(history)
    package = {
        "preprocessor": preprocessor,
        "model": model,
        "features": FEATURE_COLUMNS,
        "numeric_features": NUMERIC_COLUMNS,
        "categorical_features": CATEGORICAL_COLUMNS,
        "target": TARGET_COLUMN,
        "neighbor_count": neighbor_count,
        "history": history[
            ["transaction_id"] + FEATURE_COLUMNS + [TARGET_COLUMN]
        ].copy(),
    }

    joblib.dump(package, MODEL_PATH, compress=3)
    print(f"Loaded {len(history)} historical transactions")
    print(f"Success rows: {int(status_counts.get('SUCCESS', 0))}")
    print(f"Failed rows: {int(status_counts.get('FAILED', 0))}")
    print(f"KNN neighbors: {neighbor_count}")
    print(f"Saved model: {MODEL_PATH}")


if __name__ == "__main__":
    main()
