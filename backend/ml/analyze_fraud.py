import pandas as pd
from sqlalchemy import create_engine

DB_USER = "root"
DB_PASSWORD = "root123"
DB_HOST = "localhost"
DB_NAME = "upi_smart_recovery"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
)

print("\n========================================")
print("       FRAUD FEATURE ANALYSIS")
print("========================================\n")

query = """
SELECT
    amount,
    transaction_type,
    merchant_category,
    sender_age_group,
    receiver_age_group,
    sender_state,
    sender_bank,
    receiver_bank,
    device_type,
    network_type,
    hour_of_day,
    day_of_week,
    is_weekend,
    fraud_flag
FROM upi_transactions
"""

df = pd.read_sql(query, engine)

print("Dataset Shape:", df.shape)
print()

# -----------------------------------------
# Fraud rate by categorical features
# -----------------------------------------

features = [
    "transaction_type",
    "merchant_category",
    "sender_age_group",
    "receiver_age_group",
    "sender_state",
    "sender_bank",
    "receiver_bank",
    "device_type",
    "network_type",
    "hour_of_day",
    "day_of_week",
    "is_weekend"
]

for feature in features:

    print("\n========================================")
    print("FEATURE:", feature)
    print("========================================")

    result = (
        df.groupby(feature)["fraud_flag"]
        .agg(
            transactions="count",
            frauds="sum",
            fraud_rate="mean"
        )
        .sort_values("fraud_rate", ascending=False)
    )

    result["fraud_rate"] = (
        result["fraud_rate"] * 100
    ).round(2)

    print(result.head(15))


# -----------------------------------------
# Amount analysis
# -----------------------------------------

print("\n========================================")
print("AMOUNT ANALYSIS")
print("========================================")

print(
    df.groupby("fraud_flag")["amount"]
    .agg(["count", "mean", "min", "max"])
)

print("\n========================================")
print("ANALYSIS COMPLETED")
print("========================================")