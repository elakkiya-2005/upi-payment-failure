// ==========================================
// TRANSACTION ANOMALY DETECTION - SERVICE
// ------------------------------------------
// Serves the Isolation Forest results prepared by
// ml/anomaly_service.py.
//
// Why the indirection:
//     Scoring 250,000 rows through the model takes roughly
//     25 seconds, which is far too slow for an HTTP request.
//     The Python side therefore scores the dataset once and
//     writes a compact cache file. This module loads that
//     cache once, keeps it in memory, and does the filtering,
//     sorting, paging and aggregation in JavaScript, which
//     takes milliseconds.
//
// The cache is rebuilt automatically when it is missing or
// older than the trained model. The existing Random Forest
// model and predict.py are never touched.
// ==========================================

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ML_DIR = path.join(__dirname, "ml");
const CACHE_PATH = path.join(
    ML_DIR,
    "cache",
    "anomaly_cache.json"
);
const MODEL_PATH = path.join(
    ML_DIR,
    "anomaly_model.pkl"
);
const SERVICE_SCRIPT = path.join(
    ML_DIR,
    "anomaly_service.py"
);

// Row layout produced by anomaly_service.py. Kept in one place
// so the two sides cannot drift apart silently.
const COL = {
    TRANSACTION_ID: 0,
    AMOUNT: 1,
    HOUR_OF_DAY: 2,
    IS_WEEKEND: 3,
    TRANSACTION_TYPE: 4,
    SENDER_BANK: 5,
    RECEIVER_BANK: 6,
    NETWORK_TYPE: 7,
    DEVICE_TYPE: 8,
    TRANSACTION_STATUS: 9,
    ANOMALY_SCORE: 10,
    IS_ANOMALY: 11,
};

// Category columns that are stored as integer codes.
const CODE_COLUMNS = [
    "transaction_type",
    "sender_bank",
    "receiver_bank",
    "network_type",
    "device_type",
    "transaction_status",
];

// Number of points returned to the amount-vs-score chart.
// 250,000 DOM points would be unusable, so a deterministic
// evenly spaced sample is used instead of a random one.
const SCATTER_SAMPLE_SIZE = 1500;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

let cache = null;
let loadingPromise = null;
let loadError = null;


// ==========================================
// CACHE LOADING
// ==========================================

function isCacheStale() {
    if (!fs.existsSync(CACHE_PATH)) {
        return true;
    }

    if (!fs.existsSync(MODEL_PATH)) {
        return true;
    }

    return (
        fs.statSync(MODEL_PATH).mtimeMs >
        fs.statSync(CACHE_PATH).mtimeMs
    );
}

function runPythonScript() {
    return new Promise((resolve, reject) => {

        // The database credentials already loaded from
        // backend/.env are handed to Python so both sides
        // always talk to the same database.
        const pythonProcess = spawn(
            "python",
            [SERVICE_SCRIPT],
            {
                cwd: ML_DIR,
                env: {
                    ...process.env,
                    DB_HOST:
                        process.env.DB_HOST ||
                        "localhost",

                    DB_USER:
                        process.env.DB_USER ||
                        "root",

                    DB_PASSWORD:
                        process.env.DB_PASSWORD ||
                        "root",

                    DB_NAME:
                        process.env.DB_NAME ||
                        "upi_smart_recovery"
                }
            }
        );

        let stdout = "";
        let stderr = "";

        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        pythonProcess.on("error", reject);

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(
                    new Error(
                        `anomaly_service.py exited with code ` +
                        `${code}: ${stderr.trim() || "no output"}`
                    )
                );
            }

            const lastLine = stdout
                .trim()
                .split("\n")
                .pop();

            try {
                resolve(JSON.parse(lastLine));
            } catch (parseError) {
                reject(
                    new Error(
                        `Could not read the anomaly service ` +
                        `result: ${stdout.trim() || "empty output"}`
                    )
                );
            }
        });
    });
}

function decode(raw) {
    // Build an uppercase key -> code lookup per category so
    // filters coming from the UI are matched case-insensitively
    // while the display values keep their original spelling.
    const codeIndex = {};

    CODE_COLUMNS.forEach((column) => {
        const lookup = {};

        raw.codes[column].forEach(
            (value, index) => {
                lookup[
                    String(value).trim().toUpperCase()
                ] = index;
            }
        );

        codeIndex[column] = lookup;
    });

    return {
        meta: raw.meta,
        featureStats: raw.featureStats,
        codes: raw.codes,
        codeIndex: codeIndex,
        timestamps: raw.timestamps,
        rows: raw.rows,
        reasons: raw.reasons,
    };
}

function loadCache() {
    const raw = JSON.parse(
        fs.readFileSync(CACHE_PATH, "utf-8")
    );

    return decode(raw);
}

async function ensureCache() {
    if (cache) {
        return cache;
    }

    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = (async () => {
        try {
            if (isCacheStale()) {
                console.log(
                    "[anomalies] Cache missing or out of date. " +
                    "Running Isolation Forest scoring..."
                );

                const result = await runPythonScript();

                console.log(
                    `[anomalies] Cache ready: ` +
                    `${result.totalAnalyzed?.toLocaleString?.() || result.totalAnalyzed} ` +
                    `transactions analysed, ` +
                    `${result.anomalousTransactions} potential anomalies ` +
                    `(${result.anomalyPercentage}%).`
                );
            }

            cache = loadCache();

            loadError = null;

            return cache;
        } catch (error) {
            loadError = error;
            throw error;
        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}


// ==========================================
// FILTER HELPERS
// ==========================================

// Thrown when a requested filter value does not exist in the
// dataset. Returning the unfiltered set instead would silently
// show the user 250,000 rows while they believe a filter is active.
class InvalidFilterError extends Error {
    constructor(param, value, allowed) {
        super(
            `Unknown value ${JSON.stringify(
                String(value)
            )} for "${param}". Allowed values: ${allowed.join(
                ", "
            )}.`
        );

        this.name = "InvalidFilterError";
        this.param = param;
        this.value = value;
        this.allowed = allowed;
    }
}

function codeFor(data, column, value, param) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const lookup = data.codeIndex[column];

    const found = lookup[
        String(value).trim().toUpperCase()
    ];

    if (found === undefined) {
        throw new InvalidFilterError(
            param,
            value,
            data.codes[column] || []
        );
    }

    return found;
}

function clampLimit(value) {
    const limit = Number(value || DEFAULT_LIMIT);

    if (!Number.isFinite(limit) || limit <= 0) {
        return DEFAULT_LIMIT;
    }

    return Math.min(Math.floor(limit), MAX_LIMIT);
}


// ==========================================
// MAIN QUERY
// ==========================================

async function getAnomalies(query = {}) {
    const data = await ensureCache();

    const {
        senderBank,
        receiverBank,
        networkType,
        deviceType,
        transactionType,
        status,
        search,
        minScore,
        maxAmount,
        sortBy = "anomalyScore",
        sortOrder = "desc",
        page = 1,
        limit
    } = query;

    const senderCode = codeFor(
        data, "sender_bank", senderBank, "senderBank"
    );

    const receiverCode = codeFor(
        data, "receiver_bank", receiverBank, "receiverBank"
    );

    const networkCode = codeFor(
        data, "network_type", networkType, "networkType"
    );

    const deviceCode = codeFor(
        data, "device_type", deviceType, "deviceType"
    );

    const typeCode = codeFor(
        data, "transaction_type", transactionType, "transactionType"
    );

    const normalisedStatus =
        String(status || "").trim().toUpperCase();

    // "status" carries two different vocabularies: the dataset's
    // own SUCCESS/FAILED values, and the model's ANOMALY/NORMAL
    // classes. Only the former is looked up in the code table.
    const isModelStatus =
        normalisedStatus === "ANOMALY" ||
        normalisedStatus === "NORMAL";

    const statusCode = isModelStatus
        ? null
        : codeFor(
              data,
              "transaction_status",
              status,
              "status"
          );

    const wantAnomalies =
        normalisedStatus === "ANOMALY";

    const wantNormal =
        normalisedStatus === "NORMAL";

    const searchTerm = String(search || "")
        .trim()
        .toUpperCase();

    const minScoreValue = Number(minScore);

    // Only an explicit minScore narrows the set. A search term
    // filters by id, and must not also drop rows by score.
    const hasMinScore =
        Number.isFinite(minScoreValue) && minScoreValue > 0;

    const maxAmountValue = Number(maxAmount);

    const hasMaxAmount =
        Number.isFinite(maxAmountValue) &&
        maxAmountValue > 0;

    // ------------------------------------------------------------
    // SINGLE PASS: filter, aggregate and sample at the same time.
    // Walking 250,000 rows three times would be wasteful.
    // ------------------------------------------------------------

    const matches = [];
    const total = data.rows.length;

    const hourTotals = new Array(24).fill(0);
    const hourAnomalies = new Array(24).fill(0);

    const networkTotals = {};
    const networkAnomalies = {};

    const deviceTotals = {};
    const deviceAnomalies = {};

    const typeTotals = {};
    const typeAnomalies = {};

    let matchedAnomalies = 0;
    let matchedNormal = 0;
    let matchedFailed = 0;

    // Counts for the same filter set but WITHOUT the
    // anomaly/normal status filter. Without this, pinning the view
    // to "Potential anomalies only" would make the rate collapse to
    // 100% instead of reporting the rate inside the filtered slice.
    let universeTotal = 0;
    let universeAnomalies = 0;

    let sumAmount = 0;
    let sumScore = 0;

    for (let i = 0; i < total; i += 1) {
        const row = data.rows[i];

        const isAnomaly = row[COL.IS_ANOMALY] === 1;

        // ---- category filters ----
        if (
            senderCode !== null &&
            row[COL.SENDER_BANK] !== senderCode
        ) {
            continue;
        }

        if (
            receiverCode !== null &&
            row[COL.RECEIVER_BANK] !== receiverCode
        ) {
            continue;
        }

        if (
            networkCode !== null &&
            row[COL.NETWORK_TYPE] !== networkCode
        ) {
            continue;
        }

        if (
            deviceCode !== null &&
            row[COL.DEVICE_TYPE] !== deviceCode
        ) {
            continue;
        }

        if (
            typeCode !== null &&
            row[COL.TRANSACTION_TYPE] !== typeCode
        ) {
            continue;
        }

        if (statusCode !== null) {
            if (
                row[COL.TRANSACTION_STATUS] !==
                statusCode
            ) {
                continue;
            }
        }

        // ---- anomaly status filter ----
        // Deferred until every other filter has been applied, so the
        // "universe" tallies below stay meaningful.
        const excludedByStatus =
            (wantAnomalies && !isAnomaly) ||
            (wantNormal && isAnomaly);

        // ---- transaction id search ----
        if (
            searchTerm !== "" &&
            !String(row[COL.TRANSACTION_ID])
                .toUpperCase()
                .includes(searchTerm)
        ) {
            continue;
        }

        // ---- score floor ----
        if (
            hasMinScore &&
            row[COL.ANOMALY_SCORE] < minScoreValue
        ) {
            continue;
        }

        // ---- amount ceiling ----
        if (
            hasMaxAmount &&
            row[COL.AMOUNT] > maxAmountValue
        ) {
            continue;
        }

        // ---- universe tallies (status filter not applied) ----
        universeTotal += 1;

        if (isAnomaly) {
            universeAnomalies += 1;
        }

        if (excludedByStatus) {
            continue;
        }

        matches.push(i);

        // ---- aggregates over the filtered set ----
        if (isAnomaly) {
            matchedAnomalies += 1;
        } else {
            matchedNormal += 1;
        }

        if (
            String(
                data.codes.transaction_status[
                    row[COL.TRANSACTION_STATUS]
                ]
            ).toUpperCase() === "FAILED"
        ) {
            matchedFailed += 1;
        }

        const amount = row[COL.AMOUNT];
        const score = row[COL.ANOMALY_SCORE];

        sumAmount += amount;
        sumScore += score;

        const hour = row[COL.HOUR_OF_DAY];

        hourTotals[hour] += 1;

        if (isAnomaly) {
            hourAnomalies[hour] += 1;
        }

        const networkKey = row[COL.NETWORK_TYPE];

        networkTotals[networkKey] =
            (networkTotals[networkKey] || 0) + 1;

        const deviceKey = row[COL.DEVICE_TYPE];

        deviceTotals[deviceKey] =
            (deviceTotals[deviceKey] || 0) + 1;

        const typeKey = row[COL.TRANSACTION_TYPE];

        typeTotals[typeKey] =
            (typeTotals[typeKey] || 0) + 1;

        if (isAnomaly) {
            networkAnomalies[networkKey] =
                (networkAnomalies[networkKey] || 0) + 1;

            deviceAnomalies[deviceKey] =
                (deviceAnomalies[deviceKey] || 0) + 1;

            typeAnomalies[typeKey] =
                (typeAnomalies[typeKey] || 0) + 1;
        }
    }

    const matchedTotal = matches.length;

    // ------------------------------------------------------------
    // SORTING
    // ------------------------------------------------------------

    const SORT_COLUMNS = {
        anomalyScore: COL.ANOMALY_SCORE,
        amount: COL.AMOUNT,
        hourOfDay: COL.HOUR_OF_DAY,
        transactionId: COL.TRANSACTION_ID,
    };

    const sortColumn =
        SORT_COLUMNS[sortBy] ??
        COL.ANOMALY_SCORE;

    const direction =
        String(sortOrder).toLowerCase() === "asc"
            ? 1
            : -1;

    matches.sort((a, b) => {
        const rowA = data.rows[a];
        const rowB = data.rows[b];

        if (sortColumn === COL.TRANSACTION_ID) {
            return (
                String(rowA[sortColumn])
                    .localeCompare(
                        String(rowB[sortColumn])
                    ) * direction
            );
        }

        return (
            (rowA[sortColumn] - rowB[sortColumn]) *
            direction
        );
    });

    // ------------------------------------------------------------
    // PAGINATION
    // ------------------------------------------------------------

    const pageSize = clampLimit(limit);

    const totalPages = Math.max(
        1,
        Math.ceil(matchedTotal / pageSize)
    );

    const safePage = Math.min(
        Math.max(1, Number(page) || 1),
        totalPages
    );

    const start = (safePage - 1) * pageSize;

    const pageIndexes = matches.slice(
        start,
        start + pageSize
    );

    // ------------------------------------------------------------
    // DECODE THE PAGE ONLY
    // ------------------------------------------------------------

    const results = pageIndexes.map((index) => {
        const row = data.rows[index];

        const transactionId =
            String(row[COL.TRANSACTION_ID]);

        return {
            transaction_id: transactionId,

            timestamp:
                data.timestamps[index] || null,

            amount: row[COL.AMOUNT],

            transaction_type:
                data.codes.transaction_type[
                    row[COL.TRANSACTION_TYPE]
                ],

            sender_bank:
                data.codes.sender_bank[
                    row[COL.SENDER_BANK]
                ],

            receiver_bank:
                data.codes.receiver_bank[
                    row[COL.RECEIVER_BANK]
                ],

            network_type:
                data.codes.network_type[
                    row[COL.NETWORK_TYPE]
                ],

            device_type:
                data.codes.device_type[
                    row[COL.DEVICE_TYPE]
                ],

            hour_of_day: row[COL.HOUR_OF_DAY],

            is_weekend: row[COL.IS_WEEKEND],

            transaction_status:
                data.codes.transaction_status[
                    row[COL.TRANSACTION_STATUS]
                ],

            anomaly_score: row[COL.ANOMALY_SCORE],

            anomaly_status:
                row[COL.IS_ANOMALY] === 1
                    ? "ANOMALY"
                    : "NORMAL",

            // Measured deviations only. Never a fraud label.
            reasons: data.reasons[transactionId] || []
        };
    });

    // ------------------------------------------------------------
    // DISTRIBUTIONS (over the filtered set)
    // ------------------------------------------------------------

    const percentage = (value, count) =>
        count > 0
            ? Number(((value / count) * 100).toFixed(2))
            : 0;

    const byHour = hourTotals.map((count, hour) => ({
        hour,
        label: `${String(hour).padStart(2, "0")}:00`,
        total: count,
        anomalies: hourAnomalies[hour],
        anomalyRate: percentage(
            hourAnomalies[hour], count
        )
    }));

    const buildBreakdown = (
        codes,
        totals,
        anomalyTotals
    ) =>
        Object.keys(totals)
            .map((code) => {
                const index = Number(code);

                return {
                    name: codes[index],
                    total: totals[code],
                    anomalies: anomalyTotals[code] || 0,
                    anomalyRate: percentage(
                        anomalyTotals[code] || 0,
                        totals[code]
                    )
                };
            })
            .sort((a, b) => b.total - a.total);

    // ------------------------------------------------------------
    // SCATTER SAMPLE (deterministic, evenly spaced)
    // ------------------------------------------------------------

    const step =
        matchedTotal > SCATTER_SAMPLE_SIZE
            ? matchedTotal / SCATTER_SAMPLE_SIZE
            : 1;

    const scatter = [];

    for (
        let i = 0;
        i < matchedTotal &&
            scatter.length < SCATTER_SAMPLE_SIZE;
        i += 1
    ) {
        const index = matches[Math.floor(i * step)];

        const row = data.rows[index];

        scatter.push({
            amount: row[COL.AMOUNT],
            anomaly_score: row[COL.ANOMALY_SCORE],
            anomaly_status:
                row[COL.IS_ANOMALY] === 1
                    ? "ANOMALY"
                    : "NORMAL"
        });
    }

    // ------------------------------------------------------------
    // MODEL FACTS
    // ------------------------------------------------------------

    const meta = data.meta;

    return {
        summary: {
            totalAnalyzed: meta.totalAnalyzed,

            normalTransactions:
                matchedNormal,

            anomalousTransactions:
                matchedAnomalies,

            // Rate inside the current filter set, measured before
            // the anomaly/normal status filter is applied, so the
            // number stays informative in both the "all" and the
            // "potential anomalies only" views.
            anomalyPercentage:
                percentage(
                    universeAnomalies,
                    universeTotal
                ),

            filteredTransactions: universeTotal,

            filteredAnomalies: universeAnomalies,

            // Whole-dataset figures, so the summary never
            // silently changes meaning when a filter is applied.
            datasetAnomalousTransactions:
                meta.anomalousTransactions,

            datasetAnomalyPercentage:
                meta.anomalyPercentage,

            unsuccessfulTransactions:
                matchedFailed,

            averageAmount:
                matchedTotal > 0
                    ? Number(
                          (sumAmount / matchedTotal).toFixed(2)
                      )
                    : 0,

            averageAnomalyScore:
                matchedTotal > 0
                    ? Number(
                          (sumScore / matchedTotal).toFixed(2)
                      )
                    : 0,

            isFiltered: matchedTotal !== meta.totalAnalyzed
        },

        model: {
            algorithm: meta.algorithm,
            library: meta.library,
            params: meta.params,
            features: meta.features,
            numericFeatures: meta.numericFeatures,
            categoricalFeatures: meta.categoricalFeatures,
            trainedAt: meta.trainedAt,
            generatedAt: meta.generatedAt,
            scoreRange: meta.scoreRange,
            // 1st percentiles of the real amount column, used by
            // the UI to describe the typical amount range.
            amountReference: data.featureStats.amount
        },

        results,

        pagination: {
            page: safePage,
            limit: pageSize,
            total: matchedTotal,
            totalPages
        },

        filters: {
            senderBanks: data.codes.sender_bank,
            receiverBanks: data.codes.receiver_bank,
            networkTypes: data.codes.network_type,
            deviceTypes: data.codes.device_type,
            transactionTypes: data.codes.transaction_type,
            statuses: ["ANOMALY", "NORMAL"]
        },

        distribution: {
            byHour,
            byNetwork: buildBreakdown(
                data.codes.network_type,
                networkTotals,
                networkAnomalies
            ),
            byDevice: buildBreakdown(
                data.codes.device_type,
                deviceTotals,
                deviceAnomalies
            ),
            byTransactionType: buildBreakdown(
                data.codes.transaction_type,
                typeTotals,
                typeAnomalies
            )
        },

        scatter,

        appliedFilters: {
            senderBank: senderBank || null,
            receiverBank: receiverBank || null,
            networkType: networkType || null,
            deviceType: deviceType || null,
            transactionType: transactionType || null,
            status: status || null,
            search: search || null,
            minScore: hasMinScore ? minScoreValue : 0,
            maxAmount: hasMaxAmount ? maxAmountValue : 0,
            sortBy: SORT_COLUMNS[sortBy] ? sortBy : "anomalyScore",
            sortOrder:
                String(sortOrder).toLowerCase() === "asc"
                    ? "asc"
                    : "desc"
        }
    };
}


// ==========================================
// WARM-UP ON SERVER START
// ==========================================

// Builds the cache in the background so the first page load
// does not have to wait for the model to score the dataset.
function warmUp() {
    ensureCache().catch((error) => {
        console.error(
            "[anomalies] Warm-up failed:",
            error.message
        );
    });
}

module.exports = {
    getAnomalies,
    warmUp,
    ensureCache
};
