import pandas as pd
import joblib

from sqlalchemy import create_engine
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from imblearn.over_sampling import SMOTE


# ==========================================
# DATABASE
# ==========================================

DB_USER = "root"
DB_PASSWORD = "root123"
DB_HOST = "localhost"
DB_NAME = "upi_smart_recovery"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
)


print("\n========================================")
print("     UPI FRAUD RISK MODEL TRAINING")
print("========================================\n")


# ==========================================
# DATABASE CONNECTION
# ==========================================

try:
    check_db = pd.read_sql(
        "SELECT DATABASE() AS database_name",
        engine
    )

    print("Connected Database:")
    print(check_db)
    print()

except Exception as e:
    print("❌ Database connection failed!")
    print(e)
    exit()


# ==========================================
# LOAD DATA
# ==========================================

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

try:
    df = pd.read_sql(query, engine)

except Exception as e:
    print("❌ Error loading data:")
    print(e)
    exit()


print("========================================")
print("DATA LOADED SUCCESSFULLY")
print("========================================")

print("Dataset Shape:", df.shape)
print()

print("Columns:")
print(df.columns.tolist())
print()


# ==========================================
# MISSING VALUES
# ==========================================

print("Missing Values:")
print(df.isnull().sum())
print()

df = df.dropna()

print("Shape after removing missing values:", df.shape)
print()


# ==========================================
# FEATURES / TARGET
# ==========================================

X = df.drop(columns=["fraud_flag"])
y = df["fraud_flag"]


print("Fraud Distribution:")
print(y.value_counts())
print()


# ==========================================
# CATEGORICAL FEATURES
# ==========================================

categorical_features = [
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


# ==========================================
# TRAIN TEST SPLIT
# ==========================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


print("Training Rows:", len(X_train))
print("Testing Rows :", len(X_test))
print()


# ==========================================
# ONE HOT ENCODING
# ==========================================

preprocessor = ColumnTransformer(
    transformers=[
        (
            "categorical",
            OneHotEncoder(handle_unknown="ignore"),
            categorical_features
        )
    ],
    remainder="passthrough"
)


X_train_encoded = preprocessor.fit_transform(X_train)
X_test_encoded = preprocessor.transform(X_test)


print("✅ Categorical encoding completed.")
print()

print("Encoded Training Shape:", X_train_encoded.shape)
print()


# ==========================================
# CONVERT SPARSE → DENSE
# ==========================================

X_train_encoded = X_train_encoded.toarray()
X_test_encoded = X_test_encoded.toarray()


# ==========================================
# SMOTE
# ==========================================

print("========================================")
print("APPLYING SMOTE")
print("========================================")
print()

print("Before SMOTE:")
print(y_train.value_counts())
print()


smote = SMOTE(
    sampling_strategy=0.10,
    random_state=42,
    k_neighbors=3
)


X_train_smote, y_train_smote = smote.fit_resample(
    X_train_encoded,
    y_train
)


print("After SMOTE:")
print(pd.Series(y_train_smote).value_counts())
print()


# ==========================================
# RANDOM FOREST
# ==========================================

print("========================================")
print("TRAINING RANDOM FOREST")
print("========================================")
print()


model = RandomForestClassifier(
    n_estimators=300,
    random_state=42,
    n_jobs=-1
)


model.fit(
    X_train_smote,
    y_train_smote
)


print("✅ Random Forest training completed!")
print()


# ==========================================
# PREDICTION
# ==========================================

y_pred = model.predict(X_test_encoded)


# ==========================================
# MODEL PERFORMANCE
# ==========================================

print("========================================")
print("MODEL PERFORMANCE")
print("========================================")
print()

print("Classification Report:")
print(
    classification_report(
        y_test,
        y_pred,
        zero_division=0
    )
)

print("Confusion Matrix:")
print(
    confusion_matrix(
        y_test,
        y_pred
    )
)

print()


# ==========================================
# PROBABILITY
# ==========================================

y_probability = model.predict_proba(
    X_test_encoded
)[:, 1]


# ==========================================
# THRESHOLD ANALYSIS
# ==========================================

print("========================================")
print("THRESHOLD ANALYSIS")
print("========================================")


for threshold in [0.50, 0.40, 0.30, 0.20, 0.10]:

    y_threshold = (
        y_probability >= threshold
    ).astype(int)

    print("\n----------------------------------------")
    print("Threshold:", threshold)
    print("----------------------------------------")

    print(
        classification_report(
            y_test,
            y_threshold,
            zero_division=0
        )
    )


# ==========================================
# SAVE MODEL
# ==========================================

model_package = {
    "preprocessor": preprocessor,
    "model": model,
    "features": X.columns.tolist(),
    "categorical_features": categorical_features
}


joblib.dump(
    model_package,
    "risk_model.pkl"
)


print("\n========================================")
print("MODEL SAVED SUCCESSFULLY")
print("========================================")

print("\nCreated File: risk_model.pkl")
print("\n✅ 13 FEATURES + SMOTE + RANDOM FOREST COMPLETED!")