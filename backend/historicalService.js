// ==========================================
// HISTORICAL ANALYSIS - SERVICE
// ------------------------------------------
// Serves the KNN, root cause, recommendation and anomaly results
// produced by ml/historical_analysis.py.
//
// Why a long-lived worker:
//     Loading the KNN package takes several seconds. Spawning
//     python once per risk check would put that cost in front of
//     every user, so the process is started once, kept warm, and
//     fed one JSON request per line on stdin.
//
// If the worker dies, or fails to start, the next request starts a
// fresh one. A failure here never blocks the risk check itself:
// the caller receives null for the historical fields and the
// Random Forest result is still returned.
// ==========================================

const path = require("path");
const { spawn } = require("child_process");
const db = require("./db");

const SCRIPT = path.join(
    __dirname,
    "ml",
    "historical_analysis.py"
);

const START_TIMEOUT_MS = 120000;
const REQUEST_TIMEOUT_MS = 30000;

// How long to wait for a dying worker before force-killing it.
const SHUTDOWN_GRACE_MS = 2000;

let worker = null;
let ready = false;
let starting = null;
let nextId = 1;
const pending = new Map();


function log(message) {
    console.log(`[historical] ${message}`);
}


// ==========================================
// WORKER LIFECYCLE
// ==========================================

function failAllPending(error) {
    pending.forEach((entry, id) => {
        clearTimeout(entry.timer);
        entry.reject(error);
        pending.delete(id);
    });
}


function startWorker() {
    if (starting) {
        return starting;
    }

    if (worker && ready) {
        return Promise.resolve(worker);
    }

    starting = new Promise((resolve, reject) => {
        log("Starting analysis worker ...");

        const child = spawn("python", [SCRIPT, "--serve"], {
            cwd: path.join(__dirname, "ml"),
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdoutBuffer = "";
        let settled = false;

        const startTimer = setTimeout(() => {
            if (settled) {
                return;
            }

            settled = true;
            starting = null;

            try {
                child.kill();
            } catch (killError) {
                // The process is already gone.
            }

            reject(
                new Error(
                    "Analysis worker did not become ready in time."
                )
            );
        }, START_TIMEOUT_MS);

        child.stdout.on("data", (chunk) => {
            stdoutBuffer += chunk.toString();

            let newlineIndex = stdoutBuffer.indexOf("\n");

            while (newlineIndex !== -1) {
                const line = stdoutBuffer
                    .slice(0, newlineIndex)
                    .trim();

                stdoutBuffer =
                    stdoutBuffer.slice(newlineIndex + 1);

                newlineIndex = stdoutBuffer.indexOf("\n");

                if (line === "") {
                    continue;
                }

                let message;

                try {
                    message = JSON.parse(line);
                } catch (parseError) {
                    continue;
                }

                if (message.op === "fatal") {
                    if (!settled) {
                        settled = true;
                        clearTimeout(startTimer);
                        starting = null;

                        reject(
                            new Error(
                                `Analysis worker failed to load: ${
                                    message.error
                                }`
                            )
                        );
                    }

                    return;
                }

                if (message.op === "ready") {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    clearTimeout(startTimer);
                    starting = null;
                    ready = true;
                    worker = child;

                    log("Analysis worker ready.");

                    resolve(child);

                    return;
                }

                const entry = pending.get(message.id);

                if (!entry) {
                    return;
                }

                pending.delete(message.id);
                clearTimeout(entry.timer);

                if (message.ok) {
                    entry.resolve(message.result);
                } else {
                    entry.reject(
                        new Error(
                            message.error ||
                                "Analysis failed."
                        )
                    );
                }
            }
        });

        child.stderr.on("data", (chunk) => {
            const text = chunk.toString().trim();

            if (text !== "") {
                log(`worker: ${text}`);
            }
        });

        child.on("error", (error) => {
            ready = false;
            starting = null;

            if (!settled) {
                settled = true;
                clearTimeout(startTimer);
                reject(error);
            }

            failAllPending(error);
        });

        child.on("close", () => {
            const wasReady = ready;

            ready = false;
            worker = null;

            if (settled) {
                starting = null;
            }

            if (wasReady) {
                log("Analysis worker exited. It will restart on demand.");
            }

            failAllPending(
                new Error("Analysis worker stopped unexpectedly.")
            );
        });
    });

    return starting;
}


function stopWorker() {
    if (!worker) {
        return;
    }

    const child = worker;

    worker = null;
    ready = false;

    failAllPending(new Error("Analysis worker is shutting down."));

    try {
        child.stdin.write(
            JSON.stringify({ op: "shutdown" }) + "\n"
        );
        child.stdin.end();
    } catch (writeError) {
        // Already closed.
    }

    setTimeout(() => {
        try {
            child.kill();
        } catch (killError) {
            // Already gone.
        }
    }, SHUTDOWN_GRACE_MS).unref();
}


// ==========================================
// REQUEST
// ==========================================

async function analyse(payload) {
    const child = await startWorker();

    const id = nextId;
    nextId += 1;

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);

            // A wedged worker would keep every later request
            // waiting on it, so it is replaced rather than reused.
            stopWorker();

            reject(
                new Error(
                    "Analysis request timed out."
                )
            );
        }, REQUEST_TIMEOUT_MS);

        pending.set(id, { resolve, reject, timer });

        try {
            child.stdin.write(
                JSON.stringify({
                    op: "analyse",
                    id,
                    payload,
                }) + "\n"
            );
        } catch (writeError) {
            pending.delete(id);
            clearTimeout(timer);

            reject(writeError);
        }
    });
}


// ==========================================
// OPTIONS
//
// The dropdowns are filled from the values that actually exist in
// upi_transactions. Serving them from the database is what keeps
// the models from receiving categories they have never seen.
// ==========================================

const OPTION_COLUMNS = [
    {
        key: "banks",
        column: "sender_bank",
        label: "Banks",
    },
    {
        key: "networkTypes",
        column: "network_type",
        label: "Network types",
    },
    {
        key: "deviceTypes",
        column: "device_type",
        label: "Device types",
    },
    {
        key: "transactionTypes",
        column: "transaction_type",
        label: "Transaction types",
    },
    {
        key: "dayOfWeeks",
        column: "day_of_week",
        label: "Days of the week",
    },
];

const CACHE_TTL_MS = 10 * 60 * 1000;
let optionsCache = null;
let optionsCacheTime = 0;

// db.js exports a plain callback-style mysql2 connection, so the
// callback is wrapped here rather than changing the shared module.
function query(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function getOptions() {
    if (optionsCache && Date.now() - optionsCacheTime < CACHE_TTL_MS) {
        return optionsCache;
    }

    const results = await Promise.all(
        OPTION_COLUMNS.map(async (definition) => {
            const rows = await query(
                `SELECT ${definition.column} AS value,
                        COUNT(*) AS total
                 FROM upi_transactions
                 WHERE ${definition.column} IS NOT NULL
                   AND TRIM(${definition.column}) <> ''
                 GROUP BY ${definition.column}
                 ORDER BY total DESC, value ASC`
            );

            return [
                definition.key,
                {
                    label: definition.label,
                    column: definition.column,
                    values: rows.map((row) => ({
                        value: row.value,
                        total: Number(row.total),
                    })),
                },
            ];
        })
    );

    const datasetRows = await query(
        "SELECT COUNT(*) AS total FROM upi_transactions"
    );

    optionsCache = {
        datasetRows: Number(datasetRows[0].total),
        generatedAt: new Date().toISOString(),
        ...Object.fromEntries(results),
    };

    optionsCacheTime = Date.now();

    return optionsCache;
}


// ==========================================
// WARM-UP
// ==========================================

function warmUp() {
    startWorker().catch((error) => {
        log(`Warm-up failed: ${error.message}`);
    });
}


module.exports = {
    analyse,
    getOptions,
    warmUp,
    stopWorker,
    startWorker,
};
