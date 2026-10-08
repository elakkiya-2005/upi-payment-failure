// API access for the risk check and the dataset analyzer.
//
// The dropdown values are never listed here. They are fetched from
// /api/risk/options, which reads the distinct values out of
// upi_transactions, because the models were trained on those exact
// strings. A hand-written list would send the models categories they
// have never seen, which the one-hot encoder turns into an empty
// block and silently drops from the prediction.

import { authHeaders } from "./auth";

const API_BASE = "http://localhost:5000";


async function request(path, options = {}, fallbackMessage) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Could not reach the server. Is the backend running?");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }

  return data;
}


// -------------------------------------------
// RISK CHECK OPTIONS
// -------------------------------------------

// Flattens one option group into plain strings for a <select>.
export const optionValues = (options, key) =>
  (options?.[key]?.values || []).map((entry) => entry.value);

export async function fetchRiskOptions() {
  const data = await request(
    "/api/risk/options",
    { headers: authHeaders() },
    "Could not load the transaction options."
  );

  return data;
}


// -------------------------------------------
// RISK CHECK
// -------------------------------------------

export async function checkRisk(payload) {
  return request(
    "/api/risk",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    },
    "Risk analysis failed."
  );
}


// -------------------------------------------
// DATASET ANALYZER
// -------------------------------------------

// Kept in step with the limit the backend enforces, so an oversized file
// is refused before it is read into memory and sent over the wire.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");

export function isAcceptedFile(file) {
  if (!file) return false;

  const name = file.name.toLowerCase();

  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

// Reads the file as base64 so it can travel inside a JSON body. The
// backend hands it straight to the Python analyzer, which means no new
// upload dependency is needed in the Node service.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result || "";
      const comma = result.indexOf(",");

      resolve(comma === -1 ? result : result.slice(comma + 1));
    };

    reader.onerror = () =>
      reject(new Error(`Could not read ${file.name}.`));

    reader.readAsDataURL(file);
  });
}

export async function analyzeDataset(file) {
  if (!isAcceptedFile(file)) {
    throw new Error("Choose a CSV or Excel file (.csv, .xlsx, .xls).");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. ` +
      `The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
    );
  }

  const content = await fileToBase64(file);

  return request(
    "/api/dataset/analyze",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fileName: file.name,
        content,
      }),
    },
    "The dataset could not be analyzed."
  );
}
