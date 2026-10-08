import pandas as pd
import joblib

from sqlalchemy import create_engine
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, average_precision_score
from xgboost import XGBClassifier


print("========== UPI FRAUD RISK - XGBOOST ==========\n")

# --------------------------------------------------
# 1. Connect MySQL
# --------------------------------------------------
engine = create_engine(
    "mysql+pymysql://root:root123@localhost/upi_smart_recovery"
)

# --------------------------------------------------
# 2. Read actual database data
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
print("\nFraud Distribution:")
print(df["fraud_flag"].value_counts())

# --------------------------------------------------
# 3. Features and Target
# --------------------------------------------------
X = df.drop("fraud_flag", axis=1)
y = df["fraud_flag"]

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
    "day_of_week"
]

numeric_columns = [
    "amount",
    "hour_of_day",
    "is_weekend"
]

# --------------------------------------------------
# 4. Train/Test Split
# --------------------------------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

print("\nTrain Size:", X_train.shape)
print("Test Size:", X_test.shape)

# --------------------------------------------------
# 5. One Hot Encoding
# --------------------------------------------------
preprocessor = ColumnTransformer(
    transformers=[
        (
            "cat",
            OneHotEncoder(
                handle_unknown="ignore",
                sparse_output=False
            ),
            categorical_columns
        )
    ],
    remainder="passthrough"
)

X_train_encoded = preprocessor.fit_transform(X_train)
X_test_encoded = preprocessor.transform(X_test)

print("\nEncoded Train Shape:", X_train_encoded.shape)

# --------------------------------------------------
# 6. Calculate class imbalance
# --------------------------------------------------
negative = (y_train == 0).sum()
positive = (y_train == 1).sum()

scale_pos_weight = negative / positive

print("\nNormal Transactions:", negative)
print("Fraud Transactions:", positive)
print("Scale Pos Weight:", scale_pos_weight)

# --------------------------------------------------
# 7. XGBoost Model
# --------------------------------------------------
model = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    scale_pos_weight=scale_pos_weight,
    objective="binary:logistic",
    eval_metric="logloss",
    random_state=42,
    n_jobs=-1
)

print("\nTraining XGBoost...")
model.fit(X_train_encoded, y_train)

print("Training Completed!")

# --------------------------------------------------
# 8. Prediction Probability
# --------------------------------------------------
probabilities = model.predict_proba(X_test_encoded)[:, 1]

# --------------------------------------------------
# 9. Model Evaluation
# --------------------------------------------------
print("\nROC-AUC:")
print(round(roc_auc_score(y_test, probabilities), 4))

print("\nPR-AUC:")
print(round(average_precision_score(y_test, probabilities), 4))

# --------------------------------------------------
# 10. Test Multiple Thresholds
# --------------------------------------------------
thresholds = [0.50, 0.30, 0.20, 0.10, 0.05, 0.02, 0.01]

for threshold in thresholds:

    predictions = (probabilities >= threshold).astype(int)

    print("\n================================")
    print("Threshold:", threshold)
    print("================================")

    print(classification_report(
        y_test,
        predictions,
        zero_division=0
    ))

    print("Confusion Matrix:")
    print(confusion_matrix(y_test, predictions))

# --------------------------------------------------
# 11. Save Model Package
# --------------------------------------------------
model_package = {
    "model": model,
    "preprocessor": preprocessor,
    "threshold": 0.10,
    "features": list(X.columns)
}

joblib.dump(
    model_package,
    "risk_model_xgb.pkl"
)

print("\n================================")
print("MODEL SAVED SUCCESSFULLY")
print("File: risk_model_xgb.pkl")
print("================================")