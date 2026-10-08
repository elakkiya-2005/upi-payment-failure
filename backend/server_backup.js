const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());


// ==========================================
// HOME API
// ==========================================

app.get("/", (req, res) => {
    res.send("UPI Smart Recovery Backend is Running!");
});


// ==========================================
// GET TRANSACTIONS
// ==========================================

app.get("/api/transactions", (req, res) => {

    const query = `
        SELECT *
        FROM upi_transactions
        ORDER BY timestamp DESC
        LIMIT 100
    `;

    db.query(query, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                error: err.message
            });
        }

        res.json(results);
    });

});


// ==========================================
// DASHBOARD ANALYTICS
// ==========================================

app.get("/api/analytics", (req, res) => {

    const query = `
        SELECT
            COUNT(*) AS totalTransactions,

            SUM(
                CASE
                    WHEN UPPER(transaction_status) = 'SUCCESS'
                    THEN 1
                    ELSE 0
                END
            ) AS successfulTransactions,

            SUM(
                CASE
                    WHEN UPPER(transaction_status) = 'FAILED'
                    THEN 1
                    ELSE 0
                END
            ) AS failedTransactions,

            ROUND(
                (
                    SUM(
                        CASE
                            WHEN UPPER(transaction_status) = 'SUCCESS'
                            THEN 1
                            ELSE 0
                        END
                    ) / COUNT(*)
                ) * 100,
                2
            ) AS successRate,

            ROUND(
                (
                    SUM(
                        CASE
                            WHEN UPPER(transaction_status) = 'FAILED'
                            THEN 1
                            ELSE 0
                        END
                    ) / COUNT(*)
                ) * 100,
                2
            ) AS failureRate

        FROM upi_transactions
    `;

    db.query(query, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                error: err.message
            });
        }

        res.json(results[0]);
    });

});


// ==========================================
// BANK-WISE FAILURE ANALYSIS
// ==========================================

app.get("/api/bank-analysis", (req, res) => {

    const query = `
        SELECT
            sender_bank AS bank,

            COUNT(*) AS totalTransactions,

            SUM(
                CASE
                    WHEN UPPER(transaction_status) = 'FAILED'
                    THEN 1
                    ELSE 0
                END
            ) AS failedTransactions,

            ROUND(
                (
                    SUM(
                        CASE
                            WHEN UPPER(transaction_status) = 'FAILED'
                            THEN 1
                            ELSE 0
                        END
                    ) / COUNT(*)
                ) * 100,
                2
            ) AS failureRate

        FROM upi_transactions

        GROUP BY sender_bank

        ORDER BY failedTransactions DESC
    `;

    db.query(query, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                error: err.message
            });
        }

        res.json(results);
    });

});


// ==========================================
// NETWORK-WISE ANALYSIS
// ==========================================

app.get("/api/network-analysis", (req, res) => {

    const query = `
        SELECT
            network_type AS network,

            COUNT(*) AS totalTransactions,

            SUM(
                CASE
                    WHEN UPPER(transaction_status) = 'FAILED'
                    THEN 1
                    ELSE 0
                END
            ) AS failedTransactions,

            ROUND(
                (
                    SUM(
                        CASE
                            WHEN UPPER(transaction_status) = 'FAILED'
                            THEN 1
                            ELSE 0
                        END
                    ) / COUNT(*)
                ) * 100,
                2
            ) AS failureRate

        FROM upi_transactions

        GROUP BY network_type

        ORDER BY failedTransactions DESC
    `;

    db.query(query, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                error: err.message
            });
        }

        res.json(results);
    });

});


// ==========================================
// HOURLY FAILURE ANALYSIS
// ==========================================

app.get("/api/hourly-analysis", (req, res) => {

    const query = `
        SELECT
            hour_of_day AS hour,

            COUNT(*) AS totalTransactions,

            SUM(
                CASE
                    WHEN UPPER(transaction_status) = 'FAILED'
                    THEN 1
                    ELSE 0
                END
            ) AS failedTransactions,

            ROUND(
                (
                    SUM(
                        CASE
                            WHEN UPPER(transaction_status) = 'FAILED'
                            THEN 1
                            ELSE 0
                        END
                    ) / COUNT(*)
                ) * 100,
                2
            ) AS failureRate

        FROM upi_transactions

        GROUP BY hour_of_day

        ORDER BY hour_of_day
    `;

    db.query(query, (err, results) => {

        if (err) {
            console.error(err);

            return res.status(500).json({
                error: err.message
            });
        }

        res.json(results);
    });

});


// ==========================================
// RECOVERY TRACKING API
// REAL MYSQL DATA ONLY
// ==========================================

app.get("/api/recovery", (req, res) => {

    const query = `
        SELECT
            u.transaction_id,
            u.timestamp,
            u.amount,
            u.transaction_status,
            u.transaction_type,
            u.sender_bank,
            u.receiver_bank,
            u.network_type,
            u.device_type,

            r.retry_status,
            r.retry_time,
            r.recovery_status,
            r.recovered_at,
            r.failure_reason,
            r.suggested_retry_time

        FROM upi_transactions u

        LEFT JOIN transaction_recovery r
            ON u.transaction_id = r.transaction_id

        WHERE UPPER(u.transaction_status) = 'FAILED'

        ORDER BY u.timestamp DESC
    `;

    db.query(query, (err, results) => {

        if (err) {
            console.error("Recovery API Error:", err);

            return res.status(500).json({
                error: err.message
            });
        }


        // Convert NULL recovery records into application states.
        // Transactions themselves always come from real MySQL data.

        const formattedResults = results.map((row) => {

            return {

                transaction_id:
                    row.transaction_id,

                timestamp:
                    row.timestamp,

                amount:
                    row.amount,

                transaction_type:
                    row.transaction_type,

                sender_bank:
                    row.sender_bank,

                receiver_bank:
                    row.receiver_bank,

                network_type:
                    row.network_type,

                device_type:
                    row.device_type,


                retry_status:
                    row.retry_status || "PENDING",


                retry_time:
                    row.retry_time || null,


                recovery_status:
                    row.recovery_status || "NOT RETRIED",


                recovered_at:
                    row.recovered_at || null,


                failure_reason:
                    row.failure_reason ||
                    "Failure reason not available in database.",


                suggested_retry_time:
                    row.suggested_retry_time || null

            };

        });


        res.json(formattedResults);

    });

});


// ==========================================
// RECOVERY ANALYTICS
// ==========================================

app.get("/api/recovery/analytics", (req, res) => {

    const query = `

        SELECT

            COUNT(*) AS totalFailed,

            SUM(
                CASE
                    WHEN r.recovery_status = 'RECOVERED'
                    THEN 1
                    ELSE 0
                END
            ) AS recovered,

            SUM(
                CASE
                    WHEN r.recovery_status = 'STILL FAILED'
                    THEN 1
                    ELSE 0
                END
            ) AS stillFailed,

            SUM(
                CASE
                    WHEN r.transaction_id IS NULL
                    OR r.recovery_status = 'NOT RETRIED'
                    THEN 1
                    ELSE 0
                END
            ) AS pendingRetry

        FROM upi_transactions u

        LEFT JOIN transaction_recovery r
            ON u.transaction_id = r.transaction_id

        WHERE UPPER(u.transaction_status) = 'FAILED'

    `;


    db.query(query, (err, results) => {

        if (err) {

            console.error(
                "Recovery Analytics Error:",
                err
            );

            return res.status(500).json({
                error: err.message
            });

        }


        const data = results[0];


        const totalFailed =
            Number(data.totalFailed || 0);

        const recovered =
            Number(data.recovered || 0);


        const recoveryRate =
            totalFailed > 0

                ? Number(
                    (
                        recovered /
                        totalFailed *
                        100
                    ).toFixed(2)
                )

                : 0;


        res.json({

            totalFailed,

            recovered,

            stillFailed:
                Number(
                    data.stillFailed || 0
                ),

            pendingRetry:
                Number(
                    data.pendingRetry || 0
                ),

            recoveryRate

        });

    });

});


// ==========================================
// RETRY FAILED TRANSACTION
// SAVE REAL ACTION TO MYSQL
// ==========================================

app.post(
    "/api/recovery/:transactionId/retry",

    (req, res) => {

        const transactionId =
            req.params.transactionId;


        // First check whether the transaction exists
        // and is actually FAILED.

        const checkQuery = `
            SELECT
                transaction_id,
                transaction_status
            FROM upi_transactions
            WHERE transaction_id = ?
        `;


        db.query(

            checkQuery,

            [transactionId],

            (err, results) => {

                if (err) {

                    return res.status(500).json({
                        error:
                            err.message
                    });

                }


                if (
                    results.length === 0
                ) {

                    return res.status(404).json({
                        error:
                            "Transaction not found"
                    });

                }


                if (
                    String(
                        results[0]
                            .transaction_status
                    ).toUpperCase()
                    !== "FAILED"
                ) {

                    return res.status(400).json({
                        error:
                            "Only failed transactions can be retried"
                    });

                }


                const now =
                    new Date();


                // Check whether recovery record exists

                const recoveryCheckQuery = `
                    SELECT recovery_id
                    FROM transaction_recovery
                    WHERE transaction_id = ?
                `;


                db.query(

                    recoveryCheckQuery,

                    [transactionId],

                    (
                        recoveryErr,
                        recoveryResults
                    ) => {

                        if (
                            recoveryErr
                        ) {

                            return res.status(500)
                                .json({
                                    error:
                                        recoveryErr.message
                                });

                        }


                        if (
                            recoveryResults.length === 0
                        ) {

                            // First real retry action

                            const insertQuery = `

                                INSERT INTO
                                transaction_recovery
                                (
                                    transaction_id,
                                    retry_status,
                                    retry_time,
                                    recovery_status
                                )

                                VALUES
                                (
                                    ?,
                                    'RETRY INITIATED',
                                    ?,
                                    'PENDING'
                                )

                            `;


                            db.query(

                                insertQuery,

                                [
                                    transactionId,
                                    now
                                ],

                                (
                                    insertErr
                                ) => {

                                    if (
                                        insertErr
                                    ) {

                                        return res.status(500)
                                            .json({
                                                error:
                                                    insertErr.message
                                            });

                                    }


                                    res.json({

                                        message:
                                            "Retry initiated successfully",

                                        transactionId,

                                        retryStatus:
                                            "RETRY INITIATED",

                                        retryTime:
                                            now,

                                        recoveryStatus:
                                            "PENDING"

                                    });

                                }

                            );

                        }

                        else {

                            // Existing recovery record

                            const updateQuery = `

                                UPDATE
                                transaction_recovery

                                SET

                                    retry_status =
                                        'RETRY INITIATED',

                                    retry_time = ?,

                                    recovery_status =
                                        'PENDING'

                                WHERE
                                    transaction_id = ?

                            `;


                            db.query(

                                updateQuery,

                                [
                                    now,
                                    transactionId
                                ],

                                (
                                    updateErr
                                ) => {

                                    if (
                                        updateErr
                                    ) {

                                        return res.status(500)
                                            .json({
                                                error:
                                                    updateErr.message
                                            });

                                    }


                                    res.json({

                                        message:
                                            "Retry initiated successfully",

                                        transactionId,

                                        retryStatus:
                                            "RETRY INITIATED",

                                        retryTime:
                                            now,

                                        recoveryStatus:
                                            "PENDING"

                                    });

                                }

                            );

                        }

                    }

                );

            }

        );

    }

);


// ==========================================
// SMART TRANSACTION RISK ANALYSIS
// ==========================================

app.post("/api/risk", (req, res) => {

    console.log(
        "Risk Request:",
        req.body
    );


    const {

        amount,
        time,
        paymentApp,
        bank,
        deviceType,
        networkType,
        transactionType

    } = req.body;


    let score = 0;

    let factors = [];


    // AMOUNT RISK

    const transactionAmount =
        Number(amount);


    if (
        transactionAmount >= 50000
    ) {

        score += 35;

        factors.push(
            "High transaction amount increases failure and fraud risk."
        );

    }

    else if (
        transactionAmount >= 20000
    ) {

        score += 25;

        factors.push(
            "Large transaction amount detected."
        );

    }

    else if (
        transactionAmount >= 10000
    ) {

        score += 15;

        factors.push(
            "Transaction amount is above normal range."
        );

    }

    else if (
        transactionAmount >= 5000
    ) {

        score += 8;

        factors.push(
            "Moderately high transaction amount."
        );

    }


    // NETWORK RISK

    if (
        networkType === "2G"
    ) {

        score += 35;

        factors.push(
            "2G network may cause transaction timeout."
        );

    }

    else if (
        networkType === "3G"
    ) {

        score += 25;

        factors.push(
            "3G network may have unstable connectivity."
        );

    }

    else if (
        networkType === "4G"
    ) {

        score += 10;

        factors.push(
            "Network conditions may vary during transaction."
        );

    }

    else if (
        networkType === "Wi-Fi"
    ) {

        score += 8;

        factors.push(
            "Wi-Fi connection stability may affect the transaction."
        );

    }

    else if (
        networkType === "5G"
    ) {

        score += 2;

    }


    // DEVICE RISK

    if (
        deviceType === "Old Phone"
    ) {

        score += 20;

        factors.push(
            "Older device may cause app performance issues."
        );

    }

    else if (
        deviceType === "Tablet"
    ) {

        score += 8;

        factors.push(
            "Tablet device has moderate transaction risk."
        );

    }

    else if (
        deviceType === "Smartphone"
    ) {

        score += 2;

    }


    // TIME RISK

    if (time) {

        const hour =
            parseInt(
                time.split(":")[0]
            );


        if (
            (
                hour >= 19 &&
                hour <= 22
            )

            ||

            (
                hour >= 8 &&
                hour <= 10
            )
        ) {

            score += 20;

            factors.push(
                "Peak transaction hours may increase bank server load."
            );

        }

        else if (
            hour >= 0 &&
            hour <= 5
        ) {

            score += 12;

            factors.push(
                "Late night transactions may experience maintenance delays."
            );

        }

    }


    // TRANSACTION TYPE RISK

    if (
        transactionType === "P2M"
    ) {

        score += 5;

        factors.push(
            "Merchant transaction may involve additional payment processing."
        );

    }

    else if (
        transactionType ===
        "Bill Payment"
    ) {

        score += 8;

        factors.push(
            "Bill payment requires multiple service validations."
        );

    }

    else if (
        transactionType ===
        "Recharge"
    ) {

        score += 10;

        factors.push(
            "Recharge transaction may depend on external service availability."
        );

    }


    // BANK RISK

    const riskyBanks = [

        "State Bank of India",

        "HDFC Bank",

        "ICICI Bank",

        "Axis Bank"

    ];


    if (
        riskyBanks.includes(bank)
    ) {

        score += 5;

        factors.push(
            "Bank transaction volume may affect server response time."
        );

    }


    // PAYMENT APP RISK

    if (

        paymentApp === "Paytm"

        ||

        paymentApp === "BHIM UPI"

    ) {

        score += 5;

        factors.push(
            "Payment gateway conditions may affect transaction processing."
        );

    }


    // LIMIT SCORE

    if (
        score > 100
    ) {

        score = 100;

    }


    // DETERMINE RISK LEVEL

    let riskLevel;

    let recommendation;


    if (
        score >= 60
    ) {

        riskLevel = "HIGH";

        recommendation = {

            title:
                "High Failure Risk Detected",

            message:
                "We recommend waiting for a better network connection or changing the transaction time before proceeding."

        };

    }

    else if (
        score >= 30
    ) {

        riskLevel = "MEDIUM";

        recommendation = {

            title:
                "Moderate Failure Risk",

            message:
                "The transaction can proceed, but ensure a stable network and verify your bank connection."

        };

    }

    else {

        riskLevel = "LOW";

        recommendation = {

            title:
                "Low Failure Risk",

            message:
                "Transaction conditions appear stable. You can proceed with the payment."

        };

    }


    // NO RISK FACTORS

    if (
        factors.length === 0
    ) {

        factors.push(
            "No major transaction failure indicators detected."
        );

    }


    // SEND RESPONSE

    res.json({

        riskScore:
            score,

        riskLevel:
            riskLevel,

        factors:
            factors,

        recommendation:
            recommendation

    });

});


// ==========================================
// START SERVER
// ==========================================

const PORT =
    process.env.PORT || 5000;


app.listen(

    PORT,

    () => {

        console.log(
            `Server running on http://localhost:${PORT}`
        );

    }

);
