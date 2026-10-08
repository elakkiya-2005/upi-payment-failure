const express = require("express");
const cors = require("cors");
const db = require("./db");
const { spawn } = require("child_process");
const path = require("path");
const anomalyService = require("./anomalyService");
const historicalService = require("./historicalService");
const datasetAnalyzerService = require("./datasetAnalyzerService");
const auth = require("./auth");
const { ensureSchema } = require("./schema");

const app = express();

app.use(cors());


// ==========================================
// BODY PARSERS
// ------------------------------------------
// The dataset upload is registered before the default parser, and with
// its own limit, because express.json() rejects anything over 100kb by
// default. A 25 MB file is roughly 33 MB once base64 encoded, and that
// would be refused with a bare 413 before any handler ran.
//
// Scoping the larger limit to this one path means every other endpoint
// keeps the small default, so a hostile body cannot be posted to, say,
// /api/auth/login.
//
// The extra megabyte of headroom is for the JSON envelope and for
// base64 padding.
const DATASET_MAX_BYTES = 25 * 1024 * 1024;

const DATASET_MAX_JSON_BYTES =
    Math.ceil((DATASET_MAX_BYTES * 4) / 3) + 1024 * 1024;

app.post(
    "/api/dataset/analyze",
    express.json({ limit: DATASET_MAX_JSON_BYTES })
);

app.use(express.json());


// ==========================================
// CREATE AUTH + RISK HISTORY TABLES
// ==========================================

ensureSchema().then(() => {

    console.log("✅ users + risk_assessments tables ready");

}).catch((err) => {

    console.error("❌ Schema initialisation failed:", err.message);

});


// ==========================================
// HOME API
// ==========================================

app.get("/", (req, res) => {
    res.send("UPI Smart Recovery Backend is Running!");
});


// ==========================================
// AUTHENTICATION
// Register / Login / Current user
//
// Accounts live in the users table so the risk history can be tied to a
// stable numeric user_id. The browser only ever receives an id, name, email
// and role, plus a signed token. No user_id is ever accepted from the client
// when deciding who a request belongs to.
// ==========================================

const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
});


app.post("/api/auth/register", (req, res) => {

    const name = String(req.body.name || "").trim();

    const email = String(req.body.email || "")
        .trim()
        .toLowerCase();

    const phone = String(req.body.phone || "").trim();

    const password = String(req.body.password || "");


    if (!name || !email || !password) {

        return res.status(400).json({
            error: "Name, email and password are required."
        });

    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {

        return res.status(400).json({
            error: "Enter a valid email address."
        });

    }

    if (password.length < 6) {

        return res.status(400).json({
            error: "Password must be at least 6 characters."
        });

    }


    db.query(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [email],
        (existingError, existingRows) => {

            if (existingError) {

                return res.status(500).json({
                    error: "Could not verify the email address."
                });

            }

            if (existingRows && existingRows.length > 0) {

                return res.status(409).json({
                    error: "An account with this email already exists. Please sign in."
                });

            }


            const { salt, hash } = auth.hashPassword(password);

            const role = auth.roleForEmail(email);


            db.query(
                `INSERT INTO users (name, email, phone, password_hash, salt, role)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [name, email, phone || null, hash, salt, role],
                (insertError, result) => {

                    if (insertError) {

                        console.error("Register failed:", insertError);

                        return res.status(500).json({
                            error: "Could not create the account."
                        });

                    }

                    const user = {
                        id: result.insertId,
                        name,
                        email,
                        role,
                    };

                    res.status(201).json({
                        user: publicUser(user),
                        token: auth.createToken(user),
                    });

                }
            );

        }
    );

});


app.post("/api/auth/login", (req, res) => {

    const email = String(req.body.email || "")
        .trim()
        .toLowerCase();

    const password = String(req.body.password || "");


    db.query(
        "SELECT * FROM users WHERE email = ? LIMIT 1",
        [email],
        (err, rows) => {

            if (err) {

                console.error("Login failed:", err);

                return res.status(500).json({
                    error: "Could not sign you in right now."
                });

            }

            // One message for unknown email and wrong password so the form
            // does not reveal which accounts exist.
            const invalid = {
                error: "Incorrect email or password."
            };

            if (!rows || rows.length === 0) {

                return res.status(401).json(invalid);

            }

            const account = rows[0];

            if (!auth.verifyPassword(
                password,
                account.salt,
                account.password_hash
            )) {

                return res.status(401).json(invalid);

            }

            res.json({
                user: publicUser(account),
                token: auth.createToken(account),
            });

        }
    );

});


// Confirms the stored token is still valid and returns the current user.
// The frontend calls this on startup so a page refresh keeps the same user.
app.get("/api/auth/me", auth.requireAuth, (req, res) => {

    res.json({ user: publicUser(req.user) });

});


// Signs out on the client. The token is short lived and stateless, so the
// browser simply discards it.
app.post("/api/auth/logout", (req, res) => {

    res.json({ ok: true });

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
            ) AS failureRate,

            SUM(
                CASE
                    WHEN fraud_flag = 1
                    THEN 1
                    ELSE 0
                END
            ) AS highRiskTransactions

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
// RECOVERY TRACKING
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

            r.retry_count,
            r.recovery_status,
            r.recovered_at,
            r.created_at

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

        const formattedResults = results.map((row) => {

            return {
                transaction_id: row.transaction_id,
                timestamp: row.timestamp,
                amount: row.amount,
                transaction_type: row.transaction_type,
                sender_bank: row.sender_bank,
                receiver_bank: row.receiver_bank,
                network_type: row.network_type,
                device_type: row.device_type,

                retry_count:
                    Number(row.retry_count || 0),

                recovery_status:
                    row.recovery_status || "NOT RETRIED",

                recovered_at:
                    row.recovered_at || null,

                created_at:
                    row.created_at || null
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
                    OR r.recovery_status IN ('NOT RETRIED', 'PENDING')
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
                Number(data.stillFailed || 0),

            pendingRetry:
                Number(data.pendingRetry || 0),

            recoveryRate

        });
    });
});


// ==========================================
// RETRY FAILED TRANSACTION
// ==========================================

app.post(
    "/api/recovery/:transactionId/retry",
    (req, res) => {

        const transactionId =
            req.params.transactionId;

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
                        error: err.message
                    });

                }

                if (results.length === 0) {

                    return res.status(404).json({
                        error: "Transaction not found"
                    });

                }

                if (
                    String(
                        results[0].transaction_status
                    ).toUpperCase() !== "FAILED"
                ) {

                    return res.status(400).json({
                        error:
                            "Only failed transactions can be retried"
                    });

                }

                const recoveryCheckQuery = `
                    SELECT
                        recovery_id,
                        retry_count
                    FROM transaction_recovery
                    WHERE transaction_id = ?
                `;

                db.query(
                    recoveryCheckQuery,
                    [transactionId],
                    (recoveryErr, recoveryResults) => {

                        if (recoveryErr) {

                            return res.status(500).json({
                                error:
                                    recoveryErr.message
                            });

                        }

                        if (
                            recoveryResults.length === 0
                        ) {

                            const insertQuery = `
                                INSERT INTO transaction_recovery
                                (
                                    transaction_id,
                                    recovery_status,
                                    retry_count
                                )
                                VALUES
                                (
                                    ?,
                                    'PENDING',
                                    1
                                )
                            `;

                            db.query(
                                insertQuery,
                                [transactionId],
                                (insertErr) => {

                                    if (insertErr) {

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

                                        retryCount: 1,

                                        recoveryStatus:
                                            "PENDING"

                                    });

                                }
                            );

                        } else {

                            const currentRetryCount =
                                Number(
                                    recoveryResults[0]
                                        .retry_count || 0
                                );

                            const newRetryCount =
                                currentRetryCount + 1;

                            const updateQuery = `
                                UPDATE transaction_recovery
                                SET
                                    retry_count = ?,
                                    recovery_status = 'PENDING'
                                WHERE transaction_id = ?
                            `;

                            db.query(
                                updateQuery,
                                [
                                    newRetryCount,
                                    transactionId
                                ],
                                (updateErr) => {

                                    if (updateErr) {

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

                                        retryCount:
                                            newRetryCount,

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
// FAILURE SPIKE WARNING API
// ==========================================

app.get("/api/spike-warnings", (req, res) => {

    const baselineQuery = `
        SELECT
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
            ) AS baselineRate
        FROM upi_transactions
    `;

    db.query(
        baselineQuery,
        (baselineErr, baselineResults) => {

            if (baselineErr) {

                console.error(
                    "Spike Baseline Error:",
                    baselineErr
                );

                return res.status(500).json({
                    error:
                        baselineErr.message
                });

            }

            const baselineRate =
                Number(
                    baselineResults[0]
                        .baselineRate || 0
                );

            const query = `

                SELECT
                    sender_bank AS subsystem,
                    'Bank' AS type,
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


                UNION ALL


                SELECT
                    network_type AS subsystem,
                    'Network Type' AS type,
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


                UNION ALL


                SELECT
                    transaction_type AS subsystem,
                    'Transaction Type' AS type,
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

                GROUP BY transaction_type
            `;

            db.query(
                query,
                (err, results) => {

                    if (err) {

                        console.error(
                            "Spike Warning Error:",
                            err
                        );

                        return res.status(500).json({
                            error:
                                err.message
                        });

                    }

                    const alerts =
                        results
                            .map((row, index) => {

                                const failureRate =
                                    Number(
                                        row.failureRate || 0
                                    );

                                const failedTransactions =
                                    Number(
                                        row.failedTransactions || 0
                                    );

                                const increase =
                                    failureRate -
                                    baselineRate;

                                // Only significant spikes
                                if (increase < 0.5) {
                                    return null;
                                }

                                let severity = "medium";

                                if (increase >= 1) {
                                    severity = "high";
                                }

                                let recommendedAction =
                                    "Moderate failure increase detected. Monitor the system before retrying.";

                                if (
                                    severity === "high"
                                ) {

                                    recommendedAction =
                                        `High failure spike detected for ${row.subsystem}. Consider retrying later or using another option.`;

                                }

                                return {

                                    id:
                                        index + 1,

                                    title:
                                        severity === "high"
                                            ? "High Failure Spike Detected"
                                            : "Moderate Failure Spike Detected",

                                    type:
                                        row.type,

                                    subsystem:
                                        row.subsystem,

                                    period:
                                        "Current Dataset Period",

                                    affectedTransactions:
                                        failedTransactions,

                                    severity:
                                        severity,

                                    baselineRate:
                                        baselineRate,

                                    failureRate:
                                        failureRate,

                                    increase:
                                        Number(
                                            increase.toFixed(2)
                                        ),

                                    recommendedAction:
                                        recommendedAction,

                                    status:
                                        "active"
                                };

                            })
                            .filter(
                                (alert) =>
                                    alert !== null
                            )
                            .sort(
                                (a, b) =>
                                    b.increase -
                                    a.increase
                            );

                    res.json(alerts);

                }
            );
        }
    );
});


// ==========================================
// SMART TRANSACTION RISK ANALYSIS
// + RANDOM FOREST ML FRAUD ANALYSIS
//
// optionalAuth attaches req.user when a valid token is sent. The prediction
// is produced exactly as before whether or not somebody is signed in; the
// assessment is only recorded when there is a user to record it against.
// ==========================================

// Records one assessment for the signed-in user.
//
// This never rejects: a failed insert is logged and the caller still gets
// the risk result, so saving can never break risk prediction.
function saveRiskAssessment(req, details) {

    if (!req.user) return Promise.resolve(false);

    const {
        amount,
        time,
        paymentApp,
        bank,
        deviceType,
        networkType,
        transactionType,
        transactionId,
        riskLevel,
        riskProbability,
        prediction,
        history
    } = details;

    // The historical block is optional. When the analysis worker is
    // unavailable the assessment is still recorded, just without the
    // KNN, root cause and anomaly columns.
    const knn = history?.knn || null;
    const rootCause = history?.rootCause || null;
    const recommendation = history?.recommendation || null;
    const anomaly = history?.anomaly || null;

    const topCause = rootCause?.causes?.[0] || null;

    const rootCauseDetail = rootCause
        ? JSON.stringify({
              significant: Boolean(rootCause.significant),
              evaluated: Boolean(rootCause.evaluated),
              baselineFailureRatePercent:
                  rootCause.baselineFailureRatePercent,
              causes: rootCause.causes,
              checked: rootCause.checked,
              insufficientGroups: rootCause.insufficientGroups,
              missingValues: rootCause.missingValues,
          })
        : null;

    return new Promise((resolve) => {

        db.query(
            `INSERT INTO risk_assessments (
                user_id, transaction_id, amount, payment_app, bank,
                device_type, network_type, transaction_type, transaction_time,
                risk_level, risk_probability, prediction,
                knn_neighbor_count, knn_failed_count, knn_failure_rate,
                knn_lift, knn_confidence, knn_sample_size,
                root_cause_significant, root_cause_top, root_cause_detail,
                recommendation_title, recommendation_summary,
                recommendation_actions,
                anomaly_score, anomaly_status, dataset_rows
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                transactionId || null,
                Number(amount || 0),
                paymentApp || null,
                bank || null,
                deviceType || null,
                networkType || null,
                transactionType || null,
                time || null,
                riskLevel || null,
                Number.isFinite(riskProbability) ? riskProbability : null,
                prediction === null || prediction === undefined
                    ? null
                    : String(prediction),

                knn?.neighborCount ?? null,
                knn?.failedCount ?? null,
                knn?.failureRate ?? null,
                knn?.lift ?? null,
                knn?.confidence ?? null,
                knn?.neighborCount ?? null,

                rootCause ? (rootCause.significant ? 1 : 0) : null,
                topCause
                    ? `${topCause.dimensionLabel} = ${topCause.value}`
                    : null,
                rootCauseDetail,

                recommendation?.title ?? null,
                recommendation?.summary ?? null,
                recommendation
                    ? JSON.stringify(
                          recommendation.actions || []
                      )
                    : null,

                anomaly?.available ? anomaly.anomalyScore : null,
                anomaly?.available ? anomaly.status : null,

                history?.dataset?.totalRows ?? null
            ],
            (err) => {

                if (err) {

                    console.error(
                        "Risk assessment save failed:",
                        err.message
                    );

                    return resolve(false);

                }

                console.log(
                    `Risk assessment saved for user ${req.user.id}`
                );

                resolve(true);

            }
        );

    });

}


// ==========================================
// RISK CHECK OPTIONS
//
// The dropdowns are filled from the values that actually exist in
// upi_transactions instead of a hand-written list.
//
// This is not cosmetic. The models were trained on the stored
// strings, so a value such as "HDFC Bank" or "Smartphone" is
// encoded as an all-zero unknown block and contributes nothing to
// the prediction, while a value such as "2G" does not exist in the
// dataset at all.
// ==========================================

app.get("/api/risk/options", (req, res) => {

    historicalService
        .getOptions()
        .then((options) => {

            res.json({
                ...options,
                source: "upi_transactions"
            });

        })
        .catch((err) => {

            console.error(
                "Risk options lookup failed:",
                err.message
            );

            res.status(500).json({
                error:
                    "Could not read the dataset options. The risk " +
                    "form needs these values to be valid."
            });

        });

});


app.post("/api/risk", auth.optionalAuth, (req, res) => {

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


    // ==========================================
    // HISTORICAL ANALYSIS (STARTED FIRST)
    //
    // The KNN, root cause, recommendation and anomaly results are
    // requested here so they are computed while the Random Forest
    // runs, instead of adding their runtime to the response.
    //
    // A failure is contained: the check still completes with the
    // Random Forest result and the historical fields come back null
    // with a reason attached.
    // ==========================================

    let historyPromise = historicalService
        .analyse({
            amount,
            time,
            payment_app: paymentApp,
            bank,
            device_type: deviceType,
            network_type: networkType,
            transaction_type: transactionType
        })
        .catch((historyError) => {

            console.error(
                "Historical analysis failed:",
                historyError.message
            );

            return {
                unavailable: true,
                error: historyError.message
            };

        });


    // Turns the analysis result into the response block, including
    // the case where the worker could not be reached.
    //
    // The full measured recommendation is returned under
    // "measuredRecommendation" rather than "recommendation",
    // because the latter is the short title/message pair consumed
    // by the risk banner and is derived in deriveRisk().
    const historyBlock = (history) => {

        if (!history || history.unavailable) {
            return {
                knn: null,
                rootCause: null,
                measuredRecommendation: null,
                anomaly: null,
                dataset: null,
                historyError:
                    history?.error ||
                    "Historical analysis is unavailable."
            };
        }

        return {
            knn: history.knn,
            rootCause: history.rootCause,
            measuredRecommendation: history.recommendation,
            anomaly: history.anomaly,
            dataset: history.dataset,
            context: history.context,
            evaluatedAt: history.evaluatedAt
        };

    };


    // ==========================================
    // FAILURE RISK, DERIVED FROM MEASURED HISTORY
    //
    // This replaces a hand-written rule table that added fixed
    // points for conditions such as "2G" or "Old Phone". Those
    // values do not exist in upi_transactions, so the rules could
    // not be checked against anything, and the score they produced
    // was an opinion rather than a measurement.
    //
    // The score is now the measured failure rate of the closest
    // historical transactions, and the level is decided by how far
    // that rate sits above the dataset baseline.
    // ==========================================

    const unavailableRisk = (reason) => ({
        score: null,
        level: "UNAVAILABLE",
        factors: [reason],
        recommendation: {
            title: "Failure risk could not be measured",
            message: reason
        }
    });

    const deriveRisk = (history) => {

        if (!history || history.unavailable) {
            return unavailableRisk(
                history?.error ||
                "Historical analysis is unavailable."
            );
        }

        const { knn, rootCause, recommendation } = history;

        if (!knn || !rootCause) {
            return unavailableRisk(
                "The analysis result was incomplete."
            );
        }

        // A form value that is not in the dataset means nothing
        // can be compared, so no number is presented as a score.
        if (!rootCause.evaluated) {
            return {
                score: null,
                level: "NOT COMPARABLE",
                factors: [
                    "Some of the selected values do not exist in the " +
                    "transaction dataset, so no failure rate can be " +
                    "measured for this combination."
                ],
                recommendation: {
                    title: recommendation?.title ||
                        "Cannot compare against history",
                    message: recommendation?.summary ||
                        "No measured comparison is possible."
                }
            };
        }

        // The score IS the measured historical failure rate of the
        // nearest transactions, so it is directly interpretable.
        const score = Math.round(knn.failureRatePercent);

        const lift = knn.lift === null ? 1 : knn.lift;

        let level;

        if (lift >= 1.25) level = "HIGH";
        else if (lift >= 1.10) level = "MEDIUM";
        else level = "LOW";

        // Risk factors are the groups that actually measured worse
        // than the baseline. When none did, that is stated plainly
        // instead of being padded with generic advice.
        const factors = rootCause.causes.map((cause) => {
            const prefix =
                cause.kind === "INTERACTION"
                    ? "Combination: "
                    : "";

            return (
                `${prefix}${cause.dimensionLabel} = ${cause.value} ` +
                `failed ${cause.failureRatePercent}% of the time, ` +
                `${cause.lift}x the ${rootCause.baselineFailureRatePercent}% ` +
                `baseline across ${cause.sampleSize.toLocaleString("en-IN")} ` +
                `historical transactions.`
            );
        });

        if (factors.length === 0) {
            factors.push(
                `No factor measured above the ` +
                `${rootCause.baselineFailureRatePercent}% dataset ` +
                `baseline. The ${knn.neighborCount} closest historical ` +
                `transactions failed ${knn.failureRatePercent}% of ` +
                `the time.`
            );
        }

        return {
            score,
            level,
            factors,
            recommendation: {
                title: recommendation?.title ||
                    "Analysis complete",
                message: recommendation?.advice ||
                    "Transaction conditions have been analysed."
            }
        };

    };

    // ==========================================
    // RANDOM FOREST ML PREDICTION
    // ==========================================

    const pythonScript =
        path.join(
            __dirname,
            "ml",
            "predict.py"
        );

    const hourFromTime =
        time
            ? parseInt(
                String(time).split(":")[0]
            )
            : new Date().getHours();


    // Normalize values for ML model

    const mlNetwork =
        networkType === "Wi-Fi"
            ? "WiFi"
            : networkType || "WiFi";

    const mlDevice =
        deviceType || "Web";

    const mlTransactionType =
        transactionType || "P2P";

    const mlBank =
        bank || "SBI";


    const mlInput = {

        amount:
            Number(amount || 0),

        transaction_type:
            mlTransactionType,

        merchant_category:
            "Other",

        sender_age_group:
            "26-35",

        receiver_age_group:
            "26-35",

        sender_state:
            "Tamil Nadu",

        bank:
            mlBank,

        receiver_bank:
            mlBank,

        device_type:
            mlDevice,

        network_type:
            mlNetwork,

        hour_of_day:
            hourFromTime,

        day_of_week:
            "Monday",

        is_weekend:
            0
    };


    const pythonProcess =
        spawn(
            "python",
            [
                pythonScript,
                JSON.stringify(mlInput)
            ],
            {
                cwd:
                    path.join(
                        __dirname,
                        "ml"
                    )
            }
        );


    let pythonOutput = "";
    let pythonError = "";


    pythonProcess.stdout.on(
        "data",
        (data) => {

            pythonOutput +=
                data.toString();

        }
    );


    pythonProcess.stderr.on(
        "data",
        (data) => {

            pythonError +=
                data.toString();

        }
    );


    pythonProcess.on(
        "close",
        async (code) => {

            if (code !== 0) {

                console.error(
                    "ML Prediction Error:",
                    pythonError
                );

                const history =
                    await historyPromise;

                const risk = deriveRisk(history);

                // Still record the check so the history reflects the attempt.
                const saved = await saveRiskAssessment(req, {
                    amount,
                    time,
                    paymentApp,
                    bank,
                    deviceType,
                    networkType,
                    transactionType,
                    transactionId: req.body.transactionId,
                    riskLevel: risk.level,
                    riskProbability: null,
                    prediction: null,
                    history
                });

                return res.json({

                    riskScore:
                        risk.score,

                    riskLevel:
                        risk.level,

                    factors:
                        risk.factors,

                    recommendation:
                        risk.recommendation,

                    mlPrediction:
                        null,

                    mlFraudProbability:
                        null,

                    mlFraudRiskLevel:
                        "UNAVAILABLE",

                    mlError:
                        "Random Forest prediction failed.",

                    ...historyBlock(history),

                    savedToHistory:
                        saved

                });
            }


            try {

                const mlResult =
                    JSON.parse(
                        pythonOutput.trim()
                    );

                const history =
                    await historyPromise;

                const risk = deriveRisk(history);


                // Save before responding. saveRiskAssessment swallows its own
                // errors, so the prediction below is always returned.
                const saved = await saveRiskAssessment(req, {
                    amount,
                    time,
                    paymentApp,
                    bank,
                    deviceType,
                    networkType,
                    transactionType,
                    transactionId: req.body.transactionId,
                    riskLevel: risk.level,
                    riskProbability: mlResult.fraud_probability,
                    prediction: mlResult.fraud_prediction,
                    history
                });


                res.json({

                    // Measured history, not a rule table
                    riskScore:
                        risk.score,

                    riskLevel:
                        risk.level,

                    factors:
                        risk.factors,

                    recommendation:
                        risk.recommendation,


                    // Random Forest ML result
                    mlPrediction:
                        mlResult.fraud_prediction,

                    mlFraudProbability:
                        mlResult.fraud_probability,

                    mlFraudRiskLevel:
                        mlResult.risk_level,


                    // Measured history: KNN neighbourhood, root
                    // causes, data-driven advice and the Isolation
                    // Forest reading for this exact transaction.
                    ...historyBlock(history),


                    // Lets the page confirm the save without a second click
                    savedToHistory:
                        saved

                });

            } catch (parseError) {

                console.error(
                    "ML JSON Parse Error:",
                    parseError
                );

                console.error(
                    "Python Output:",
                    pythonOutput
                );


                const history =
                    await historyPromise;

                const risk = deriveRisk(history);

                const saved =
                    await saveRiskAssessment(req, {
                        amount,
                        time,
                        paymentApp,
                        bank,
                        deviceType,
                        networkType,
                        transactionType,
                        transactionId: req.body.transactionId,
                        riskLevel: risk.level,
                        riskProbability: null,
                        prediction: null,
                        history
                    });


                res.json({

                    riskScore:
                        risk.score,

                    riskLevel:
                        risk.level,

                    factors:
                        risk.factors,

                    recommendation:
                        risk.recommendation,

                    mlPrediction:
                        null,

                    mlFraudProbability:
                        null,

                    mlFraudRiskLevel:
                        "UNAVAILABLE",

                    mlError:
                        "Invalid ML response.",

                    ...historyBlock(history),

                    savedToHistory:
                        saved

                });

            }

        }
    );

});


// ==========================================
// MY RISK HISTORY
//
// Returns only the risk assessments belonging to the signed-in user.
// The user id comes exclusively from the verified token (req.user.id);
// any user_id sent by the client is ignored, so one account can never read
// another account's history.
// ==========================================

app.get("/api/my-risk-history", auth.requireAuth, (req, res) => {

    db.query(
        `SELECT
            id,
            transaction_id,
            amount,
            payment_app,
            bank,
            device_type,
            network_type,
            transaction_type,
            transaction_time,
            risk_level,
            risk_probability,
            prediction,
            knn_neighbor_count,
            knn_failed_count,
            knn_failure_rate,
            knn_lift,
            knn_confidence,
            root_cause_significant,
            root_cause_top,
            root_cause_detail,
            recommendation_title,
            recommendation_summary,
            recommendation_actions,
            anomaly_score,
            anomaly_status,
            dataset_rows,
            created_at
         FROM risk_assessments
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC`,
        [req.user.id],
        (err, rows) => {

            if (err) {

                console.error(
                    "My risk history failed:",
                    err
                );

                return res.status(500).json({
                    error: "Could not load your risk history."
                });

            }

            const summary = {
                total: rows.length,
                high: 0,
                medium: 0,
                low: 0,
                elevatedHistory: 0,
                anomalies: 0
            };

            // MySQL returns JSON columns as strings, so they are
            // parsed here instead of being handed to the client raw.
            const parseJson = (value, fallback) => {
                if (value === null || value === undefined) {
                    return fallback;
                }

                if (typeof value === "object") {
                    return value;
                }

                try {
                    return JSON.parse(value);
                } catch (parseError) {
                    return fallback;
                }
            };

            const assessments = rows.map((row) => {

                const level =
                    String(row.risk_level || "")
                        .toLowerCase();

                if (level === "high") summary.high += 1;
                else if (level === "medium") summary.medium += 1;
                else if (level === "low") summary.low += 1;

                if (row.root_cause_significant === 1) {
                    summary.elevatedHistory += 1;
                }

                if (row.anomaly_status === "ANOMALY") {
                    summary.anomalies += 1;
                }

                return {
                    ...row,
                    root_cause_detail: parseJson(
                        row.root_cause_detail,
                        null
                    ),
                    recommendation_actions: parseJson(
                        row.recommendation_actions,
                        []
                    )
                };

            });


            res.json({
                summary,
                assessments
            });

        }
    );

});


// ==========================================
// BANK-TO-BANK (BANK PAIR) FAILURE ANALYSIS
// ------------------------------------------
// Groups the existing `upi_transactions` table by the
// (sender_bank, receiver_bank) combination and reports
// how each observed bank pair behaves.
//
// Every number is aggregated live from MySQL. Nothing is
// hardcoded and no extra table is created.
// ==========================================

// Whitelist of columns the client is allowed to sort by.
// Used as a guard so the dynamic ORDER BY can never be
// driven by raw user input.
const BANK_PAIR_SORT_COLUMNS = {

    senderBank: "senderBank",

    receiverBank: "receiverBank",

    totalTransactions: "totalTransactions",

    failedTransactions: "failedTransactions",

    successfulTransactions: "successfulTransactions",

    failureRate: "failureRate"
};

// A bank pair that only shows up a couple of times can
// legitimately have a 0% or 100% failure rate, so the
// auto-generated insights ignore pairs below this volume
// unless every pair is smaller than that.
const BANK_PAIR_INSIGHT_MIN_VOLUME = 20;

// Splits a "a, b, c" string produced by GROUP_CONCAT.
function splitList(value) {

    if (!value) {

        return [];
    }

    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

// Finds the best pair for a metric. `highest` controls the
// direction; ties are broken by volume so the most
// meaningful pair wins instead of an arbitrary one.
function pickBankPair(
    pairs,
    metric,
    highest = true
) {

    if (pairs.length === 0) {

        return null;
    }

    const direction = highest ? -1 : 1;

    return [...pairs].sort((a, b) => {

        const metricDiff =
            (a[metric] - b[metric]) * direction;

        if (metricDiff !== 0) {

            return metricDiff;
        }

        return (
            b.totalTransactions -
            a.totalTransactions
        );

    })[0];
}

app.get(
    "/api/bank-pair-analysis",
    (req, res) => {

        const {
            senderBank,
            receiverBank,
            transactionType,
            date,
            dateFrom,
            dateTo,
            minTransactions,
            sortBy = "failedTransactions",
            sortOrder = "desc"
        } = req.query;

        // ------------------------------------------
        // DYNAMIC WHERE CLAUSE (parameterised)
        // ------------------------------------------

        const conditions = [];

        const filterParams = [];

        if (senderBank) {

            conditions.push("sender_bank = ?");

            filterParams.push(senderBank);
        }

        if (receiverBank) {

            conditions.push("receiver_bank = ?");

            filterParams.push(receiverBank);
        }

        if (transactionType) {

            conditions.push("transaction_type = ?");

            filterParams.push(transactionType);
        }

        if (date) {

            conditions.push(
                "DATE(timestamp) = ?"
            );

            filterParams.push(date);
        }

        if (dateFrom) {

            conditions.push(
                "timestamp >= ?"
            );

            filterParams.push(
                `${dateFrom} 00:00:00`
            );
        }

        if (dateTo) {

            conditions.push(
                "timestamp < DATE_ADD(?, INTERVAL 1 DAY)"
            );

            filterParams.push(
                `${dateTo} 00:00:00`
            );
        }

        const whereClause =
            conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}`
                : "";

        // Optional minimum volume guard.
        const requestedMin =
            Number(minTransactions || 0);

        const hasMinVolume =
            !Number.isNaN(requestedMin) &&
            requestedMin > 0;

        // ------------------------------------------
        // SAFE DYNAMIC SORTING
        // ------------------------------------------

        const sortColumn =
            BANK_PAIR_SORT_COLUMNS[sortBy] ||
            BANK_PAIR_SORT_COLUMNS
                .failedTransactions;

        const sortDirection =
            String(sortOrder)
                .toLowerCase() === "asc"
                ? "ASC"
                : "DESC";

        // ------------------------------------------
        // BANK PAIR AGGREGATION
        // ------------------------------------------

        const query = `
            SELECT
                sender_bank AS senderBank,

                receiver_bank AS receiverBank,

                COUNT(*) AS totalTransactions,

                SUM(
                    CASE
                        WHEN UPPER(transaction_status) = 'FAILED'
                        THEN 1
                        ELSE 0
                    END
                ) AS failedTransactions,

                SUM(
                    CASE
                        WHEN UPPER(transaction_status) = 'SUCCESS'
                        THEN 1
                        ELSE 0
                    END
                ) AS successfulTransactions,

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

            ${whereClause}

            GROUP BY sender_bank, receiver_bank

            ${hasMinVolume ? "HAVING COUNT(*) >= ?" : ""}

            ORDER BY
                ${sortColumn} ${sortDirection},
                senderBank ASC,
                receiverBank ASC
        `;

        const params = hasMinVolume
            ? [...filterParams, requestedMin]
            : filterParams;

        db.query(
            query,
            params,
            (err, results) => {

                if (err) {

                    console.error(
                        "Bank Pair Analysis Error:",
                        err
                    );

                    return res.status(500).json({
                        error: err.message
                    });
                }

                // ------------------------------------------
                // NORMALISE ROWS
                // ------------------------------------------

                const pairs = results.map(
                    (row) => {

                        const total =
                            Number(
                                row.totalTransactions || 0
                            );

                        const failed =
                            Number(
                                row.failedTransactions || 0
                            );

                        const successful =
                            Number(
                                row.successfulTransactions || 0
                            );

                        const failureRate =
                            total > 0
                                ? Number(
                                    ((failed / total) * 100)
                                        .toFixed(2)
                                )
                                : 0;

                        return {
                            senderBank:
                                row.senderBank,

                            receiverBank:
                                row.receiverBank,

                            bankPair: `${row.senderBank} → ${row.receiverBank}`,

                            totalTransactions: total,

                            failedTransactions: failed,

                            successfulTransactions: successful,

                            otherTransactions:
                                total -
                                failed -
                                successful,

                            failureRate
                        };

                    }
                );

                // ------------------------------------------
                // SUMMARY
                // ------------------------------------------

                const totalTransactions =
                    pairs.reduce(
                        (sum, p) =>
                            sum + p.totalTransactions,
                        0
                    );

                const failedTransactions =
                    pairs.reduce(
                        (sum, p) =>
                            sum + p.failedTransactions,
                        0
                    );

                const successfulTransactions =
                    pairs.reduce(
                        (sum, p) =>
                            sum +
                            p.successfulTransactions,
                        0
                    );

                const overallFailureRate =
                    totalTransactions > 0
                        ? Number(
                              (
                                  (failedTransactions /
                                      totalTransactions) *
                                  100
                              ).toFixed(2)
                          )
                        : 0;

                // ------------------------------------------
                // AUTO-GENERATED INSIGHTS
                // ------------------------------------------

                const eligible =
                    pairs.filter(
                        (p) =>
                            p.totalTransactions >=
                            BANK_PAIR_INSIGHT_MIN_VOLUME
                    );

                // If every pair is small, fall back to all
                // pairs so the insights are never empty.
                const insightPool =
                    eligible.length > 0
                        ? eligible
                        : pairs;

                const highestFailureRate =
                    pickBankPair(
                        insightPool,
                        "failureRate"
                    );

                const lowestFailureRate =
                    pickBankPair(
                        insightPool,
                        "failureRate",
                        false
                    );

                const mostFailures =
                    pickBankPair(
                        insightPool,
                        "failedTransactions",
                        true
                    );

                // ------------------------------------------
                // FILTER OPTIONS
                // (always read from the full table so the
                //  dropdowns never lose options)
                // ------------------------------------------

                const optionsQuery = `
                    SELECT
                        GROUP_CONCAT(
                            DISTINCT sender_bank
                            ORDER BY sender_bank
                            SEPARATOR ','
                        ) AS senderBanks,

                        GROUP_CONCAT(
                            DISTINCT receiver_bank
                            ORDER BY receiver_bank
                            SEPARATOR ','
                        ) AS receiverBanks,

                        GROUP_CONCAT(
                            DISTINCT transaction_type
                            ORDER BY transaction_type
                            SEPARATOR ','
                        ) AS transactionTypes,

                        MIN(timestamp) AS minDate,

                        MAX(timestamp) AS maxDate

                    FROM upi_transactions
                `;

                db.query(
                    optionsQuery,
                    (optionsErr, optionsRows) => {

                        if (optionsErr) {

                            console.error(
                                "Bank Pair Filter Options Error:",
                                optionsErr
                            );

                            return res.status(500).json({
                                error:
                                    optionsErr.message
                            });
                        }

                        const options =
                            optionsRows[0] || {};

                        // Formats a MySQL datetime as a
                        // plain YYYY-MM-DD string using the
                        // server's own local calendar day.
                        // toISOString() is avoided because it
                        // would shift the day for users in
                        // timezones ahead of UTC.
                        const toDateOnly =
                            (value) => {
                                if (!value) return null;

                                const d =
                                    new Date(value);

                                if (
                                    Number.isNaN(
                                        d.getTime()
                                    )
                                ) {
                                    return null;
                                }

                                const month =
                                    String(
                                        d.getMonth() + 1
                                    ).padStart(2, "0");

                                const day =
                                    String(
                                        d.getDate()
                                    ).padStart(2, "0");

                                return `${d.getFullYear()}-${month}-${day}`;
                            };

                        res.json({

                            summary: {
                                totalBankPairs: pairs.length,

                                totalTransactions,

                                failedTransactions,

                                successfulTransactions,

                                otherTransactions:
                                    totalTransactions -
                                    failedTransactions -
                                    successfulTransactions,

                                overallFailureRate
                            },

                            pairs,

                            insights: {
                                highestFailureRate,

                                lowestFailureRate,

                                mostFailures,

                                // Exposed so the UI can explain
                                // why very low volume pairs were
                                // skipped.
                                minVolumeForInsights:
                                    BANK_PAIR_INSIGHT_MIN_VOLUME,

                                pairsConsidered:
                                    insightPool.length
                            },

                            filters: {
                                senderBanks:
                                    splitList(
                                        options.senderBanks
                                    ),

                                receiverBanks:
                                    splitList(
                                        options.receiverBanks
                                    ),

                                transactionTypes:
                                    splitList(
                                        options.transactionTypes
                                    ),

                                dateRange: {
                                    min: toDateOnly(
                                        options.minDate
                                    ),

                                    max: toDateOnly(
                                        options.maxDate
                                    )
                                }
                            },

                            appliedFilters: {
                                senderBank:
                                    senderBank || null,

                                receiverBank:
                                    receiverBank || null,

                                transactionType:
                                    transactionType || null,

                                date: date || null,

                                dateFrom:
                                    dateFrom || null,

                                dateTo:
                                    dateTo || null,

                                minTransactions:
                                    hasMinVolume
                                        ? requestedMin
                                        : 0,

                                sortBy:
                                    BANK_PAIR_SORT_COLUMNS[sortBy]
                                        ? sortBy
                                        : "failedTransactions",

                                sortOrder:
                                    sortDirection.toLowerCase()
                            },

                            generatedAt:
                                new Date()
                                    .toISOString()
                        });
                    }
                );
            }
        );
    }
);


// ==========================================
// TRANSACTION ANOMALY DETECTION
// ------------------------------------------
// Unsupervised Isolation Forest scoring of the existing
// upi_transactions table.
//
// This is a separate model from the Random Forest used by
// POST /api/risk. It is unsupervised, it never modifies that
// model, and an anomaly is never reported as fraud.
//
// The heavy scoring work happens in ml/anomaly_service.py
// and is cached; see anomalyService.js.
// ==========================================

app.get("/api/anomalies", async (req, res) => {

    try {

        const payload =
            await anomalyService.getAnomalies(
                req.query
            );

        res.json(payload);

    } catch (error) {

        // A filter value that does not exist in the dataset is a
        // client mistake, not a server failure. Reporting 500 here
        // would hide the real cause behind a generic error.
        if (error.name === "InvalidFilterError") {
            return res.status(400).json({
                error: error.message,
                param: error.param,
                allowed: error.allowed
            });
        }

        console.error(
            "Anomaly Detection Error:",
            error
        );

        res.status(500).json({
            error: error.message,

            // The most common cause is a missing model.
            hint:
                "If the Isolation Forest model is missing, run " +
                "python ml/train_anomaly_model.py from the " +
                "backend folder."
        });
    }
});


// ==========================================
// DYNAMIC DATASET ANALYZER
// ------------------------------------------
// Analyses a user-supplied CSV or Excel file.
//
// The file arrives as base64 in the JSON body rather than as multipart
// form data. That avoids adding an upload dependency for the sake of
// one endpoint, and it keeps the request a plain JSON call that the
// frontend already knows how to make.
//
// Nothing about the file is assumed. ml/dataset_analyzer.py infers the
// columns, and reports only the KPIs, charts and insights the data can
// actually support, listing anything it could not compute under
// "unsupported" with a reason.
//
// The body parser for this path is registered near the top of the file,
// before the default 100kb express.json().
// ==========================================

const DATASET_ALLOWED_SUFFIXES = [
    ".csv",
    ".xlsx",
    ".xls",
];

// optionalAuth matches POST /api/risk, the other endpoint that runs a
// model on demand. It does not block anonymous callers, so this stays
// reachable without an account; it parses a token when one is sent so
// the log line records who asked. Nothing is persisted here, so there is
// no per-user data to protect.
app.post("/api/dataset/analyze", auth.optionalAuth, (req, res) => {

    const startedAt = Date.now();

    const fileName = String(
        req.body?.fileName || req.body?.name || ""
    ).trim();

    const base64 = req.body?.base64 || req.body?.content || "";

    if (!fileName) {
        return res.status(400).json({
            error: "The upload did not include a file name."
        });
    }

    const suffix = path.extname(fileName).toLowerCase();

    if (!DATASET_ALLOWED_SUFFIXES.includes(suffix)) {
        return res.status(400).json({
            error:
                `'${suffix || "unknown"}' files are not supported. ` +
                `Upload a ${DATASET_ALLOWED_SUFFIXES.join(
                    ", "
                )} file.`
        });
    }

    if (typeof base64 !== "string" || base64 === "") {
        return res.status(400).json({
            error: "The upload did not contain any file data."
        });
    }

    // base64 inflates by 4/3, so this catches an oversized file before
    // it is decoded and forwarded to python.
    const approxBytes = Math.floor((base64.length * 3) / 4);

    if (approxBytes > DATASET_MAX_BYTES) {
        return res.status(413).json({
            error:
                `That file is about ${(
                    approxBytes / 1048576
                ).toFixed(1)} MB. The limit is ${
                    DATASET_MAX_BYTES / 1048576
                } MB.`
        });
    }

    console.log(
        `Dataset upload: ${fileName} (~${(
            approxBytes / 1024
        ).toFixed(0)} KB)`
    );

    datasetAnalyzerService
        .analyse({ fileName, base64 })
        .then((result) => {

            console.log(
                `Dataset analysed in ${
                    Date.now() - startedAt
                }ms: ${result.file.rowsAnalysed} rows, ` +
                `${result.columns.length} columns`
            );

            res.json(result);

        })
        .catch((err) => {

            console.error(
                "Dataset analysis failed:",
                err.message
            );

            // The python side raises ValueError with a message written
            // for the person who uploaded the file, so it is passed
            // through rather than replaced with something generic.
            res.status(400).json({
                error:
                    err.message ||
                    "This file could not be analysed."
            });

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

        console.log(
            "Random Forest ML integration enabled."
        );

        console.log(
            "KNN historical analysis, root cause and " +
            "data-driven recommendations enabled."
        );

        console.log(
            "Dynamic CSV/Excel dataset analyzer enabled."
        );

        // Loads the Isolation Forest cache in the background
        // so the anomaly page opens without a first-load wait.
        anomalyService.warmUp();

        // Starts the KNN worker and loads the models once, so the
        // first risk check does not pay the several-second
        // model-load cost.
        historicalService.warmUp();

        // Same reason: pandas takes about a second to import, so the
        // analyzer is ready before the first upload arrives.
        datasetAnalyzerService.warmUp();
    }
);