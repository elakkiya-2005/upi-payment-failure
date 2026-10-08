import sys
import json
import joblib
import pandas as pd

# -----------------------------------
# Load trained model package
# -----------------------------------
import os

model_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "risk_model.pkl"
)

package = joblib.load(model_path)

model = package["model"]
preprocessor = package["preprocessor"]

# -----------------------------------
# Read input from Node.js
# -----------------------------------
data = json.loads(sys.argv[1])

# -----------------------------------
# Prepare input
# -----------------------------------
input_data = pd.DataFrame([{
    "amount": float(data["amount"]),
    "transaction_type": data["transaction_type"],
    "merchant_category": data.get("merchant_category", "Other"),
    "sender_age_group": data.get("sender_age_group", "26-35"),
    "receiver_age_group": data.get("receiver_age_group", "26-35"),
    "sender_state": data.get("sender_state", "Tamil Nadu"),
    "sender_bank": data["bank"],
    "receiver_bank": data.get("receiver_bank", data["bank"]),
    "device_type": data["device_type"],
    "network_type": data["network_type"],
    "hour_of_day": int(data["hour_of_day"]),
    "day_of_week": data.get("day_of_week", "Monday"),
    "is_weekend": int(data.get("is_weekend", 0))
}])

# -----------------------------------
# Apply same preprocessing
# -----------------------------------
input_encoded = preprocessor.transform(input_data)

# -----------------------------------
# Prediction
# -----------------------------------
prediction = int(model.predict(input_encoded)[0])

# -----------------------------------
# Fraud probability
# -----------------------------------
probabilities = model.predict_proba(input_encoded)[0]
fraud_probability = float(probabilities[1])

# -----------------------------------
# Risk level
# -----------------------------------
if fraud_probability >= 0.60:
    risk_level = "HIGH"
elif fraud_probability >= 0.30:
    risk_level = "MEDIUM"
else:
    risk_level = "LOW"

# -----------------------------------
# Result
# -----------------------------------
result = {
    "fraud_prediction": prediction,
    "fraud_probability": round(fraud_probability * 100, 2),
    "risk_level": risk_level
}

print(json.dumps(result))