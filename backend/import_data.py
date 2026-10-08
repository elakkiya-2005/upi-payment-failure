import pandas as pd
from sqlalchemy import create_engine

# ==========================================
# CSV FILE PATH
# ==========================================

csv_path = r"C:\Users\ELAKKIYA\Downloads\upidataset\upi_transactions_2024.csv"


# ==========================================
# READ CSV
# ==========================================

print("Reading CSV...")

df = pd.read_csv(csv_path)

print("Total rows:", len(df))
print("Original Columns:")
print(df.columns.tolist())


# ==========================================
# RENAME CSV COLUMNS
# TO MATCH MYSQL TABLE
# ==========================================

df.rename(columns={
    "transaction id": "transaction_id",
    "transaction type": "transaction_type",
    "amount (INR)": "amount"
}, inplace=True)

print("\nUpdated Columns:")
print(df.columns.tolist())


# ==========================================
# MYSQL CONNECTION
# ==========================================

print("\nConnecting to MySQL...")

engine = create_engine(
    "mysql+pymysql://root:root123@localhost:3306/upi_smart_recovery"
)


# ==========================================
# IMPORT DATA
# ==========================================

print("\nImporting data into MySQL...")
print("Please wait...")

df.to_sql(
    name="upi_transactions",
    con=engine,
    if_exists="append",
    index=False,
    chunksize=5000
)


# ==========================================
# SUCCESS MESSAGE
# ==========================================

print("\n===================================")
print("SUCCESS! 🎉")
print("Dataset imported into MySQL.")
print("Total rows imported:", len(df))
print("===================================")