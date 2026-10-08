// Table definitions for authentication and per-user risk history.
//
// The database already holds only transaction tables (transactions,
// upi_transactions, upi_transactions_etl, transaction_recovery) and none of
// them track a user, so both tables below are new. They are created on
// startup with IF NOT EXISTS, which keeps existing data untouched and makes
// the feature work on a fresh database.
//
// The column migrations further down extend risk_assessments after the fact.
// CREATE TABLE IF NOT EXISTS is a no-op on a table that already exists, so
// without them an existing installation would keep working but would silently
// drop the KNN, root cause and anomaly results from its history.

const db = require("./db");

const STATEMENTS = [
    // ---------------------------------------
    // USERS
    // ---------------------------------------
    `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        phone VARCHAR(20),
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(64) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // ---------------------------------------
    // PER-USER RISK ASSESSMENTS
    // ---------------------------------------
    // user_id matches users.id (INT) and cascades so removing a user removes
    // their assessments.
    `CREATE TABLE IF NOT EXISTS risk_assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        transaction_id VARCHAR(100),
        amount DECIMAL(12,2),
        payment_app VARCHAR(100),
        bank VARCHAR(100),
        device_type VARCHAR(100),
        network_type VARCHAR(100),
        transaction_type VARCHAR(100),
        transaction_time VARCHAR(50),
        risk_level VARCHAR(30),
        risk_probability DECIMAL(8,4),
        prediction VARCHAR(100),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_risk_assessments_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_risk_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];


// ---------------------------------------
// ADDITIVE COLUMN MIGRATIONS
//
// Each entry is applied only when the column is absent, so running
// this on every startup is safe and keeps older rows (which have
// no value for the new columns) readable.
// ---------------------------------------

const RISK_COLUMNS = [
    ["knn_neighbor_count", "INT NULL"],
    ["knn_failed_count", "INT NULL"],
    ["knn_failure_rate", "DECIMAL(8,4) NULL"],
    ["knn_lift", "DECIMAL(8,4) NULL"],
    ["knn_confidence", "VARCHAR(20) NULL"],
    ["knn_sample_size", "INT NULL"],
    ["root_cause_significant", "TINYINT(1) NULL"],
    ["root_cause_top", "VARCHAR(255) NULL"],
    ["root_cause_detail", "MEDIUMTEXT NULL"],
    ["recommendation_title", "VARCHAR(255) NULL"],
    ["recommendation_summary", "MEDIUMTEXT NULL"],
    ["recommendation_actions", "MEDIUMTEXT NULL"],
    ["anomaly_score", "DECIMAL(6,2) NULL"],
    ["anomaly_status", "VARCHAR(20) NULL"],
    ["dataset_rows", "INT NULL"],
];


function existingColumns(table, callback) {
    db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table],
        (err, rows) => {
            if (err) {
                console.error(
                    `Could not read columns for ${table}: ${err.message}`
                );
                return callback(new Set());
            }

            callback(
                new Set(rows.map((row) => row.COLUMN_NAME))
            );
        }
    );
}


function addRiskColumns() {
    return new Promise((resolve) => {
        existingColumns("risk_assessments", (present) => {
            const missing = RISK_COLUMNS.filter(
                ([name]) => !present.has(name)
            );

            if (missing.length === 0) {
                return resolve();
            }

            console.log(
                `Schema: adding ${missing.length} column(s) to ` +
                `risk_assessments ...`
            );

            const runNext = (index) => {
                if (index >= missing.length) return resolve();

                const [name, definition] = missing[index];

                db.query(
                    `ALTER TABLE risk_assessments
                     ADD COLUMN ${name} ${definition}`,
                    (err) => {
                        if (err) {
                            console.error(
                                `Could not add ${name}: ${err.message}`
                            );
                        }

                        runNext(index + 1);
                    }
                );
            };

            runNext(0);
        });
    });
}


function ensureSchema() {
    return new Promise((resolve) => {
        const runNext = (index) => {
            if (index >= STATEMENTS.length) {
                return addRiskColumns().then(resolve);
            }

            db.query(STATEMENTS[index], (err) => {
                if (err) {
                    console.error(
                        `Schema step ${index + 1} failed: ${err.message}`
                    );
                }

                runNext(index + 1);
            });
        };

        runNext(0);
    });
}


module.exports = { ensureSchema, RISK_COLUMNS };
