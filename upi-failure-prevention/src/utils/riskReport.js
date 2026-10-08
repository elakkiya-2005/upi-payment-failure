// Risk report export.
//
// Two formats are produced from exactly the same result object, so
// the printed report and the spreadsheet can never disagree:
//
//   CSV  - one flat row per reported fact, easy to sort and filter
//   PDF  - a self-contained printable document opened in a new window,
//          which the browser can save as PDF through its print dialog
//
// No library is used. The PDF is the browser's own print pipeline,
// which keeps the output selectable and searchable.

const REPORT_DATE_FORMAT = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

const number = (value, suffix = "") =>
  value === null || value === undefined
    ? "—"
    : `${value}${suffix}`;

const escapeCell = (value) => {
  const text =
    value === null || value === undefined ? "" : String(value);

  // A leading =, +, - or @ makes spreadsheet software treat the
  // cell as a formula, so those are neutralised.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;

  return `"${safe.replace(/"/g, '""')}"`;
};

const download = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

const stamp = (result) => {
  const value = result?.evaluatedAt || new Date().toISOString();

  return new Date(value)
    .toLocaleString("en-IN", REPORT_DATE_FORMAT)
    .replace(/[/:]/g, "-");
};


// -------------------------------------------
// SHARED ROW BUILDER
//
// Both exports describe the same result, so the facts are collected
// once here and each format decides how to lay them out.
// -------------------------------------------

function buildRows(result) {
  const { form, response } = result;
  const knn = response.knn;
  const rootCause = response.rootCause;
  const measured = response.measuredRecommendation;
  const anomaly = response.anomaly;

  const rows = [
    { section: "Transaction", field: "Amount", value: form.amount },
    { section: "Transaction", field: "Time", value: form.time },
    { section: "Transaction", field: "Payment app", value: form.paymentApp },
    { section: "Transaction", field: "Bank", value: form.bank },
    { section: "Transaction", field: "Device", value: form.deviceType },
    { section: "Transaction", field: "Network", value: form.networkType },
    {
      section: "Transaction",
      field: "Type",
      value: form.transactionType,
    },
    { section: "", field: "", value: "" },
  ];

  rows.push(
    {
      section: "Failure risk",
      field: "Measured failure rate",
      value: number(response.riskScore, "%"),
    },
    {
      section: "Failure risk",
      field: "Level",
      value: response.riskLevel,
    },
    {
      section: "Failure risk",
      field: "Dataset baseline",
      value: number(rootCause?.baselineFailureRatePercent, "%"),
    },
    {
      section: "Failure risk",
      field: "Dataset size",
      value: number(response.dataset?.totalRows),
    }
  );

  response.factors.forEach((factor, index) => {
    rows.push({
      section: "Failure risk",
      field: `Factor ${index + 1}`,
      value: factor,
    });
  });

  rows.push({ section: "", field: "", value: "" });

  if (knn) {
    rows.push(
      {
        section: "KNN history",
        field: "Algorithm",
        value: knn.algorithm,
      },
      {
        section: "KNN history",
        field: "Neighbours compared",
        value: knn.neighborCount,
      },
      {
        section: "KNN history",
        field: "Neighbours failed",
        value: knn.failedCount,
      },
      {
        section: "KNN history",
        field: "Failure rate",
        value: number(knn.failureRatePercent, "%"),
      },
      {
        section: "KNN history",
        field: "Baseline",
        value: number(knn.baselineFailureRatePercent, "%"),
      },
      { section: "KNN history", field: "Lift", value: number(knn.lift, "x") },
      {
        section: "KNN history",
        field: "Confidence",
        value: knn.confidence,
      }
    );

    knn.similarTransactions.forEach((transaction) => {
      rows.push({
        section: "KNN history",
        field: `Similar ${transaction.transactionId}`,
        value:
          `${transaction.status}, ${transaction.networkType}, ` +
          `Rs ${transaction.amount}, hour ${transaction.hourOfDay}`,
      });
    });
  }

  rows.push({ section: "", field: "", value: "" });

  if (rootCause) {
    if (rootCause.causes.length === 0) {
      rows.push({
        section: "Root cause",
        field: "Result",
        value:
          "No factor measured above the dataset baseline.",
      });
    }

    rootCause.causes.forEach((cause) => {
      rows.push({
        section: "Root cause",
        field: `${cause.severity} - ${cause.dimensionLabel}`,
        value: cause.description,
      });
    });

    rootCause.missingValues.forEach((missing) => {
      rows.push({
        section: "Root cause",
        field: `Not in dataset - ${missing.dimension}`,
        value: `${missing.value}: ${missing.note}`,
      });
    });
  }

  rows.push({ section: "", field: "", value: "" });

  if (measured) {
    rows.push(
      {
        section: "Recommendation",
        field: "Title",
        value: measured.title,
      },
      {
        section: "Recommendation",
        field: "Summary",
        value: measured.summary,
      },
      {
        section: "Recommendation",
        field: "Advice",
        value: measured.advice,
      }
    );

    measured.actions.forEach((action, index) => {
      rows.push({
        section: "Recommendation",
        field: `Action ${index + 1}`,
        value: `${action.action} — ${action.reason}`,
      });
    });
  }

  rows.push({ section: "", field: "", value: "" });

  if (anomaly?.available) {
    rows.push(
      {
        section: "Anomaly (Isolation Forest)",
        field: "Algorithm",
        value: anomaly.algorithm,
      },
      {
        section: "Anomaly (Isolation Forest)",
        field: "Anomaly score",
        value: number(anomaly.anomalyScore, "/100"),
      },
      {
        section: "Anomaly (Isolation Forest)",
        field: "Status",
        value: anomaly.status,
      },
      {
        section: "Anomaly (Isolation Forest)",
        field: "Reference size",
        value: number(anomaly.referenceSize),
      }
    );

    anomaly.reasons.forEach((reason, index) => {
      rows.push({
        section: "Anomaly (Isolation Forest)",
        field: `Observation ${index + 1}`,
        value: reason,
      });
    });
  }

  return rows;
}


// -------------------------------------------
// CSV EXPORT
// -------------------------------------------

export function exportRiskCsv(result) {
  const rows = buildRows(result);

  const lines = [
    ["Section", "Field", "Value"].map(escapeCell).join(","),
    ...rows.map((row) =>
      [row.section, row.field, row.value].map(escapeCell).join(",")
    ),
  ];

  // A BOM makes Excel read the file as UTF-8, so the rupee sign and
  // other non-ASCII characters survive the round trip.
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });

  download(blob, `upi-risk-report-${stamp(result)}.csv`);
}


// -------------------------------------------
// PRINTABLE REPORT (PDF via the print dialog)
// -------------------------------------------

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const isBlank = (row) => !row.section && !row.field && !row.value;

function buildReportHtml(result) {
  const { response } = result;

  const groupRows = () => {
    const groups = [];

    buildRows(result).forEach((row) => {
      if (isBlank(row)) {
        groups.push(null);
        return;
      }

      const last = groups[groups.length - 1];

      if (last && last.section === row.section) {
        last.rows.push(row);
      } else {
        groups.push({ section: row.section, rows: [row] });
      }
    });

    return groups.filter(Boolean);
  };

  const sections = groupRows()
    .map((group) => {
      const body = group.rows
        .map(
          (row) => `
            <tr>
              <th scope="row">${escapeHtml(row.field)}</th>
              <td>${escapeHtml(row.value)}</td>
            </tr>`
        )
        .join("");

      return `
        <section>
          <h2>${escapeHtml(group.section)}</h2>
          <table>${body}</table>
        </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>UPI Risk Report</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #16202e;
    margin: 0;
    padding: 32px;
    font-size: 13px;
    line-height: 1.5;
  }
  header { border-bottom: 3px solid #16202e; padding-bottom: 16px; margin-bottom: 20px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .meta { color: #5a6a7d; font-size: 12px; }
  .verdict {
    display: flex; gap: 12px; align-items: center;
    border: 1px solid #d5dde6; border-left-width: 5px;
    padding: 12px 16px; margin-bottom: 24px; background: #f7f9fb;
  }
  .verdict .score { font-size: 26px; font-weight: 700; }
  .verdict .label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #5a6a7d; }
  section { margin-bottom: 20px; break-inside: avoid; }
  h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
    color: #5a6a7d; border-bottom: 1px solid #d5dde6;
    padding-bottom: 5px; margin: 0 0 8px;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 8px; vertical-align: top; }
  th { width: 34%; font-weight: 600; color: #3a4a5d; }
  td { border-bottom: 1px solid #eef2f6; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d5dde6; color: #5a6a7d; font-size: 11px; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>

<div class="no-print" style="margin-bottom:16px">
  <button onclick="window.print()">Print / Save as PDF</button>
</div>

<header>
  <h1>UPI Transaction Risk Report</h1>
  <div class="meta">
    Generated ${escapeHtml(
      new Date(response.evaluatedAt || Date.now()).toLocaleString(
        "en-IN",
        REPORT_DATE_FORMAT
      )
    )}
    &middot; every figure is a measured aggregate of the historical
    transaction dataset, not a rule-based estimate.
  </div>
</header>

<div class="verdict">
  <div>
    <div class="score">${escapeHtml(
      response.riskScore === null ? "—" : `${response.riskScore}%`
    )}</div>
    <div class="label">Measured failure rate</div>
  </div>
  <div>
    <div class="score" style="font-size:16px">${escapeHtml(
      response.riskLevel
    )}</div>
    <div class="label">Level</div>
  </div>
  <div>
    <div class="score" style="font-size:16px">${escapeHtml(
      response.dataset?.totalRows?.toLocaleString("en-IN") ?? "—"
    )}</div>
    <div class="label">Transactions analysed</div>
  </div>
</div>

${sections}

<footer>
  UPI SafeGuard &middot; KNN historical analysis, measured root causes and
  Isolation Forest anomaly scoring. Baseline failure rate
  ${escapeHtml(response.rootCause?.baselineFailureRatePercent ?? "—")}%.
</footer>

</body>
</html>`;
}

export function exportRiskReport(result) {
  const win = window.open("", "_blank");

  if (!win) {
    throw new Error(
      "The browser blocked the report window. Allow pop-ups for this " +
      "site and try again."
    );
  }

  win.document.write(buildReportHtml(result));
  win.document.close();

  // Give the document a moment to lay out before the dialog opens.
  setTimeout(() => {
    win.focus();
    win.print();
  }, 400);
}
