// ==========================================
// DATASET ANALYZER - SERVICE
// ------------------------------------------
// Runs ml/dataset_analyzer.py over an uploaded CSV or Excel file.
//
// Why a long-lived worker:
//     Importing pandas costs about a second. Spawning python per
//     upload would repeat that on every request, so the process is
//     started once, kept warm, and fed one JSON request per line.
//
// The payload is written to the worker's stdin as a single line, so a
// multi-megabyte base64 upload is fine here. It is only written as a
// command-line argument that Windows would refuse, which is why the
// Python script also accepts stdin.
// ==========================================

const path = require("path");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "ml", "dataset_analyzer.py");

const START_TIMEOUT_MS = 60000;

// Reading, parsing and grouping a large file is slower than a risk
// check, so this is more generous than the historical worker.
const REQUEST_TIMEOUT_MS = 120000;

const SHUTDOWN_GRACE_MS = 2000;

let worker = null;
let ready = false;
let starting = null;
let nextId = 1;
const pending = new Map();


function log(message) {
    console.log(`[dataset-analyzer] ${message}`);
}


function failAllPending(error) {
    pending.forEach((entry, id) => {
        clearTimeout(entry.timer);
        entry.reject(error);
        pending.delete(id);
    });
}


// ==========================================
// WORKER LIFECYCLE
// ==========================================

function startWorker() {
    if (starting) {
        return starting;
    }

    if (worker && ready) {
        return Promise.resolve(worker);
    }

    starting = new Promise((resolve, reject) => {
        log("Starting dataset analyzer worker ...");

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
                // Already gone.
            }

            reject(
                new Error(
                    "The dataset analyzer did not start in time."
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
                                `The dataset analyzer failed to start: ${
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

                    log("Dataset analyzer worker ready.");

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
                                "The dataset could not be analysed."
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
                log(
                    "Dataset analyzer worker exited. It will restart on demand."
                );
            }

            failAllPending(
                new Error("The dataset analyzer stopped unexpectedly.")
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

    failAllPending(new Error("The dataset analyzer is shutting down."));

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

            // A wedged worker would keep every later upload waiting on
            // it, so it is replaced rather than reused.
            stopWorker();

            reject(
                new Error(
                    "Analysing this file took too long. Try a smaller " +
                    "file, or a CSV rather than Excel."
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


function warmUp() {
    startWorker().catch((error) => {
        log(`Warm-up failed: ${error.message}`);
    });
}


module.exports = {
    analyse,
    warmUp,
    stopWorker,
    startWorker,
};
