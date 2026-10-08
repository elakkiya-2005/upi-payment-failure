import pandas as pd
import mysql.connector

print("======================================")
print("       UPI TRANSACTION ETL")
print("======================================")


# =====================================================
# 1. EXTRACT
# =====================================================

print("\n[1] EXTRACTING DATA...")

file_path = r"C:\Users\ELAKKIYA\Downloads\upidataset\upi_transactions_2024.csv"

df = pd.read_csv(file_path)

print("Data extracted successfully!")
print("Original rows:", len(df))
print("Original columns:", len(df.columns))

print("\nDataset columns:")
print(df.columns.tolist())


# =====================================================
# 2. TRANSFORM
# =====================================================

print("\n[2] TRANSFORMING DATA...")

# Remove duplicate rows
before = len(df)

df.drop_duplicates(inplace=True)

after = len(df)

print("Duplicates removed:", before - after)


# -----------------------------------------------------
# Convert amount to numeric if available
# -----------------------------------------------------

if "amount" in df.columns:

    df["amount"] = pd.to_numeric(
        df["amount"],
        errors="coerce"
    )


# -----------------------------------------------------
# Remove rows with missing amount
# -----------------------------------------------------

if "amount" in df.columns:

    df.dropna(
        subset=["amount"],
        inplace=True
    )


# -----------------------------------------------------
# Fill missing values
# -----------------------------------------------------

for column in df.columns:

    if df[column].dtype == "object":

        df[column] = df[column].fillna("Unknown")

    else:

        df[column] = df[column].fillna(0)


print("Missing values handled.")


# -----------------------------------------------------
# Clean column names
# -----------------------------------------------------

df.columns = (
    df.columns
    .str.strip()
    .str.lower()
    .str.replace(" ", "_")
)
df.rename(
    columns={"amount_(inr)": "amount"},
    inplace=True
)



print("Column names cleaned.")


# -----------------------------------------------------
# Final transformation result
# -----------------------------------------------------

print("\nTransformation completed!")

print("Final rows:", len(df))
print("Final columns:", len(df.columns))


# =====================================================
# 3. LOAD
# =====================================================

print("\n[3] LOADING DATA INTO MYSQL...")


# -----------------------------------------------------
# MySQL Connection
# -----------------------------------------------------

connection = mysql.connector.connect(
    host="localhost",
    user="root",
    password="root123",
    database="upi_smart_recovery"
)

cursor = connection.cursor()

print("MySQL connected successfully!")


# =====================================================
# LOAD INTO ETL TESTING TABLE
# =====================================================

# Get columns from MySQL table

cursor.execute("""
    DESCRIBE upi_transactions_etl
""")

mysql_columns = [
    row[0]
    for row in cursor.fetchall()
]

print("\nMySQL table columns:")
print(mysql_columns)


# -----------------------------------------------------
# Find common columns
# -----------------------------------------------------

common_columns = [
    column
    for column in mysql_columns
    if column in df.columns
]


print("\nCommon columns:")
print(common_columns)


# -----------------------------------------------------
# Check whether common columns exist
# -----------------------------------------------------

if len(common_columns) == 0:

    print("\nERROR: No matching columns found!")

    cursor.close()
    connection.close()

    exit()


# -----------------------------------------------------
# Prepare INSERT query
# -----------------------------------------------------

column_names = ", ".join(
    f"`{column}`"
    for column in common_columns
)

placeholders = ", ".join(
    ["%s"] * len(common_columns)
)

insert_query = f"""
    INSERT INTO upi_transactions_etl
    ({column_names})
    VALUES
    ({placeholders})
"""


# -----------------------------------------------------
# Prepare data
# -----------------------------------------------------

data = []

for _, row in df.iterrows():

    values = []

    for column in common_columns:

        value = row[column]

        if pd.isna(value):

            value = None

        values.append(value)

    data.append(tuple(values))


# -----------------------------------------------------
# Insert data
# -----------------------------------------------------

print("\nLoading data...")

cursor.executemany(
    insert_query,
    data
)

connection.commit()


print("\n======================================")
print("          ETL COMPLETED")
print("======================================")

print("Rows loaded:", cursor.rowcount)


# =====================================================
# CLOSE CONNECTION
# =====================================================

cursor.close()
connection.close()

print("\nMySQL connection closed.")
print("ETL process completed successfully!")