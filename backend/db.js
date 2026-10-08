const mysql = require("mysql2");
require("dotenv").config();

console.log("Loading database connection...");

const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root",
    database: process.env.DB_NAME || "upi_smart_recovery"
});

db.connect((err) => {
    if (err) {
        console.log("❌ MySQL Connection Failed:", err.message);
    } else {
        console.log("✅ MySQL Connected Successfully!");
    }
});

module.exports = db;