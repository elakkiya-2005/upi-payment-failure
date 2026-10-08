import pandas as pd
from sqlalchemy import create_engine


print("========== FRAUD SIGNAL ANALYSIS ==========\n")


# --------------------------------------------------
# 1. MySQL Connection
# --------------------------------------------------

engine = create_engine(
    "mysql+pymysql://root:root123@localhost/upi_smart_recovery"
)


# --------------------------------------------------
# 2. Read Data
# --------------------------------------------------

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


# --------------------------------------------------
# 3. Overall Fraud Rate
# --------------------------------------------------

total = len(df)
fraud_count = df["fraud_flag"].sum()

print("\nTotal Transactions:", total)
print("Fraud Transactions:", fraud_count)

print(
    "Overall Fraud Rate:",
    round((fraud_count / total) * 100, 4),
    "%"
)


# --------------------------------------------------
# 4. Amount Comparison
# --------------------------------------------------

print("\n========== AMOUNT ==========")

print(
    df.groupby("fraud_flag")["amount"]
    .agg(["count", "mean", "median", "min", "max"])
)


# --------------------------------------------------
# 5. Categorical Feature Fraud Rates
# --------------------------------------------------

categorical_columns = [
    "transaction_type",
    "merchant_category",
    "sender_age_group",
    "receiver_age_group",
    "sender_state",
    "sender_bank",
    "receiver_bank",
    "device_type",
    "network_type",
    "day_of_week",
    "is_weekend"
]


for column in categorical_columns:

    print("\n==========================================")
    print("FEATURE:", column)
    print("==========================================")

    result = (
        df.groupby(column)["fraud_flag"]
        .agg(["count", "sum", "mean"])
        .sort_values("mean", ascending=False)
    )

    result["fraud_rate_%"] = result["mean"] * 100

    print(
        result[
            ["count", "sum", "fraud_rate_%"]
        ].round(4).head(15)
    )


# --------------------------------------------------
# 6. Hour-wise Fraud Rate
# --------------------------------------------------

print("\n==========================================")
print("FEATURE: hour_of_day")
print("==========================================")

hour_result = (
    df.groupby("hour_of_day")["fraud_flag"]
    .agg(["count", "sum", "mean"])
    .sort_values("mean", ascending=False)
)

hour_result["fraud_rate_%"] = hour_result["mean"] * 100

print(
    hour_result[
        ["count", "sum", "fraud_rate_%"]
    ].round(4)
)


# --------------------------------------------------
# 7. Correlation
# --------------------------------------------------

print("\n========== NUMERIC CORRELATION ==========")

numeric_columns = [
    "amount",
    "hour_of_day",
    "is_weekend",
    "fraud_flag"
]

print(
    df[numeric_columns]
    .corr()["fraud_flag"]
    .sort_values(ascending=False)
)


# --------------------------------------------------
# 8. Fraud vs Normal Feature Means
# --------------------------------------------------

print("\n========== NUMERIC FEATURE COMPARISON ==========")

comparison = df.groupby("fraud_flag")[
    ["amount", "hour_of_day", "is_weekend"]
].mean()

print(comparison)


print("\n========== ANALYSIS COMPLETED ==========")