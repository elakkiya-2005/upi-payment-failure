import { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  BarChart3,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  Columns3,
  Table2,
  Loader2,
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Button from "../components/Button";
import {
  analyzeDataset,
  isAcceptedFile,
  ACCEPT_ATTRIBUTE,
  MAX_UPLOAD_BYTES,
} from "../utils/riskApi";


const severityStyle = {
  warning: {
    borderColor: "var(--warning)",
    background: "var(--warning-light, #fffbeb)",
    icon: AlertTriangle,
    color: "var(--warning)",
  },
  info: {
    borderColor: "var(--primary)",
    background: "var(--bg)",
    icon: Info,
    color: "var(--primary)",
  },
};

const roleLabel = {
  identifier: "Identifier",
  timestamp: "Date / time",
  status: "Outcome",
  amount: "Amount",
  category: "Category",
  flag: "Flag",
  measure: "Numeric",
  text: "Free text",
};

const roleTone = {
  status: "info",
  amount: "info",
  timestamp: "neutral",
  identifier: "neutral",
  category: "neutral",
  flag: "medium",
  measure: "neutral",
  text: "neutral",
};


// Renders one KPI. The value arrives already measured; this only decides
// how it should read.
function Kpi({ kpi }) {
  const { label, value, format } = kpi;

  let display = value;

  if (format === "currency" && typeof value === "number") {
    display = `₹${Number(value).toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })}`;
  } else if (format === "percent" && typeof value === "number") {
    display = `${value}%`;
  } else if (format === "kilobytes" && typeof value === "number") {
    display = `${value} KB`;
  } else if (format === "number" && typeof value === "number") {
    display = value.toLocaleString("en-IN");
  }

  return (
    <div
      className="card"
      style={{
        background: "var(--bg)",
        boxShadow: "none",
        border: "1px solid var(--border)",
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          wordBreak: "break-word",
        }}
      >
        {display}
      </div>
    </div>
  );
}


// A bar chart. `kind` decides what one bar means: a raw count, or a
// failure rate with the sample size it was measured on.
function Chart({ chart }) {
  const entries = chart.entries || [];

  if (entries.length === 0) return null;

  const isRate = chart.kind === "rateBar";

  // Bars are scaled against the largest entry, so the tallest bar in the
  // chart is always full width. A rate bar is still scaled to the largest
  // rate rather than to 100, which keeps small differences visible.
  const max = Math.max(...entries.map((entry) => entry.value));

  return (
    <div
      className="card"
      style={{
        background: "var(--bg)",
        boxShadow: "none",
        border: "1px solid var(--border)",
        padding: 16,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 12, gap: 8 }}
      >
        <strong style={{ fontSize: "0.9rem" }}>{chart.title}</strong>

        {isRate && (
          <span className="badge badge-neutral">
            baseline {chart.baselinePercent}%
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        {entries.map((entry) => {
          const width =
            max > 0 ? Math.max((entry.value / max) * 100, 1.5) : 0;

          const color =
            entry.tone === "danger"
              ? "var(--danger)"
              : entry.tone === "primary"
              ? "var(--primary)"
              : "var(--success)";

          return (
            <div key={entry.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: "0.78rem",
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.label}
                </span>

                <span
                  style={{
                    color: isRate ? color : "var(--text-muted)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isRate
                    ? `${entry.value}%`
                    : entry.value.toLocaleString("en-IN")}
                  {isRate && entry.lift > 1 && (
                    <small style={{ color: "var(--text-muted)" }}>
                      {" "}
                      · {entry.lift}x
                    </small>
                  )}
                </span>
              </div>

              <div
                style={{
                  height: 7,
                  borderRadius: 20,
                  background: "var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${width}%`,
                    height: "100%",
                    background: color,
                  }}
                />
              </div>

              {isRate && (
                <small
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.68rem",
                  }}
                >
                  {entry.failures.toLocaleString("en-IN")} failed of{" "}
                  {entry.total.toLocaleString("en-IN")}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default function DatasetAnalyzerPage({ user }) {

  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef(null);


  // ==========================================
  // FILE SELECTION
  // ==========================================

  // The same two checks the API applies, done here so an unusable file
  // is refused before it is read and uploaded.
  const pickFile = (chosen) => {
    if (!chosen) return;

    if (!isAcceptedFile(chosen)) {
      setError(
        "Choose a CSV, .xlsx or .xls file. That file type is not read."
      );
      return;
    }

    if (chosen.size > MAX_UPLOAD_BYTES) {
      setError(
        `That file is ${(chosen.size / 1048576).toFixed(1)} MB. ` +
          `The limit is ${MAX_UPLOAD_BYTES / 1048576} MB.`
      );
      return;
    }

    setFile(chosen);
    setResult(null);
    setError("");
  };


  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };


  // ==========================================
  // ANALYSE
  // ==========================================

  const handleAnalyse = async () => {
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await analyzeDataset(file);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  };


  return (
    <DashboardLayout
      user={user}
      title="Dataset Analyzer"
    >
      <PageHeader
        subtitle="Upload a CSV or Excel file. The columns, types and outcome values are read from your file, and only the measures it can support are reported."
      />


      {/* ================================= */}
      {/* UPLOAD */}
      {/* ================================= */}

      <Card
        title="Upload File"
        icon={Upload}
      >
        {!file ? (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${
                dragging ? "var(--primary)" : "var(--border)"
              }`,
              borderRadius: 12,
              padding: "36px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging
                ? "var(--primary-light, #eff6ff)"
                : "transparent",
              transition: "all .15s ease",
            }}
          >
            <FileSpreadsheet
              size={40}
              color="var(--primary)"
            />

            <h3 style={{ marginTop: 10 }}>
              Drop a file here, or click to choose
            </h3>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.86rem",
                marginTop: 4,
              }}
            >
              CSV, .xlsx or .xls, up to {MAX_UPLOAD_BYTES / 1048576} MB
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 10,
              flexWrap: "wrap",
            }}
          >
            <FileSpreadsheet
              size={22}
              color="var(--primary)"
            />

            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  wordBreak: "break-all",
                }}
              >
                {file.name}
              </strong>

              <small style={{ color: "var(--text-muted)" }}>
                {(file.size / 1024).toFixed(0)} KB
              </small>
            </div>

            <button
              className="btn btn-ghost"
              style={{ marginLeft: "auto" }}
              onClick={clearFile}
              disabled={loading}
              aria-label="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          data-testid="dataset-file-input"
          style={{ display: "none" }}
          onChange={(event) => pickFile(event.target.files?.[0])}
        />

        {error && (
          <div
            className="form-error"
            style={{ marginTop: 14 }}
          >
            {error}
          </div>
        )}

        {file && (
          <Button
            className="mt-16"
            size="block"
            icon={loading ? Loader2 : BarChart3}
            onClick={handleAnalyse}
            loading={loading}
          >
            {loading ? "Analysing..." : "Analyse Dataset"}
          </Button>
        )}

        {loading && (
          <p
            style={{
              marginTop: 12,
              fontSize: "0.82rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Large files take a few seconds. Only the first 200,000 rows are
            analysed.
          </p>
        )}
      </Card>


      {/* ================================= */}
      {/* RESULTS */}
      {/* ================================= */}

      {result && (
        <>
          <Card
            className="mt-24"
            title="What Was Found In Your File"
            icon={Columns3}
          >
            <p
              style={{
                margin: "0 0 14px",
                fontSize: "0.88rem",
                color: "var(--text-muted)",
              }}
            >
              {result.file.rowsAnalysed.toLocaleString("en-IN")} of{" "}
              {result.file.rowsInFile.toLocaleString("en-IN")} rows
              analysed
              {result.file.truncated &&
                " (the rest were skipped to keep this responsive)"}
              .
            </p>

            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(230px, 1fr))",
              }}
            >
              {result.kpis.map((kpi) => (
                <Kpi
                  key={kpi.key}
                  kpi={kpi}
                />
              ))}
            </div>
          </Card>


          {/* OUTCOME DETECTION */}

          <Card
            className="mt-24"
            title="How Outcomes Were Read"
            icon={CheckCircle2}
          >
            {result.outcome.available ? (
              <p style={{ margin: 0, fontSize: "0.88rem" }}>
                &ldquo;{result.outcome.column}&rdquo; was read as the
                outcome column. Treated as failures:{" "}
                <strong>
                  {result.outcome.failedValues.join(", ") || "none found"}
                </strong>
                . Treated as successes:{" "}
                <strong>
                  {result.outcome.successValues.join(", ") || "none found"}
                </strong>
                .
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: "0.88rem" }}>
                No column in this file was read as a transaction outcome, so
                no failure rate is shown anywhere in these results.
              </p>
            )}
          </Card>


          {/* INSIGHTS */}

          <Card
            className="mt-24"
            title="Insights"
            icon={AlertTriangle}
          >
            <div style={{ display: "grid", gap: 10 }}>
              {result.insights.map((insight, index) => {
                const tone = severityStyle[insight.severity] || severityStyle.info;
                const Icon = tone.icon;

                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${tone.borderColor}`,
                      background: tone.background,
                    }}
                  >
                    <Icon
                      size={18}
                      color={tone.color}
                      style={{ flexShrink: 0, marginTop: 2 }}
                    />

                    <div style={{ minWidth: 0 }}>
                      <strong
                        style={{
                          display: "block",
                          fontSize: "0.9rem",
                          marginBottom: 3,
                        }}
                      >
                        {insight.title}
                      </strong>

                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.85rem",
                        }}
                      >
                        {insight.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>


          {/* CHARTS */}

          {result.charts.length > 0 && (
            <Card
              className="mt-24"
              title="Breakdowns"
              icon={BarChart3}
            >
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(300px, 1fr))",
                }}
              >
                {result.charts.map((chart) => (
                  <Chart
                    key={chart.key}
                    chart={chart}
                  />
                ))}
              </div>
            </Card>
          )}


          {/* UNSUPPORTED */}

          {result.unsupported.length > 0 && (
            <Card
              className="mt-24"
              title="Not Available For This File"
              icon={X}
            >
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "0.85rem",
                  color: "var(--text-muted)",
                }}
              >
                These were left out because the data cannot support them.
                Nothing has been estimated in their place.
              </p>

              <div style={{ display: "grid", gap: 8 }}>
                {result.unsupported.map((item) => (
                  <div
                    key={item.feature}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                    }}
                  >
                    <strong style={{ display: "block", fontSize: "0.85rem" }}>
                      {item.feature}
                    </strong>

                    <small style={{ color: "var(--text-muted)" }}>
                      {item.reason}
                    </small>
                  </div>
                ))}
              </div>
            </Card>
          )}


          {/* COLUMNS */}

          <Card
            className="mt-24"
            title="Columns Detected"
            icon={Table2}
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Read As</th>
                    <th>Data Type</th>
                    <th>Distinct Values</th>
                    <th>Missing</th>
                    <th>Examples</th>
                  </tr>
                </thead>

                <tbody>
                  {result.columns.map((column) => (
                    <tr key={column.key}>
                      <td className="mono">{column.name}</td>

                      <td>
                        <span
                          className={`badge badge-${roleTone[column.role] || "neutral"}`}
                        >
                          {roleLabel[column.role] || column.role}
                        </span>
                      </td>

                      <td>{column.dtype}</td>

                      <td>{column.distinct.toLocaleString("en-IN")}</td>

                      <td
                        style={{
                          color:
                            column.missingPercent >= 25
                              ? "var(--warning)"
                              : undefined,
                          fontWeight:
                            column.missingPercent >= 25 ? 600 : undefined,
                        }}
                      >
                        {column.missing > 0
                          ? `${column.missing.toLocaleString("en-IN")} (${column.missingPercent}%)`
                          : "—"}
                      </td>

                      <td
                        style={{
                          fontSize: "0.76rem",
                          color: "var(--text-muted)",
                          maxWidth: 220,
                        }}
                      >
                        {column.samples.length > 0
                          ? column.samples.join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

    </DashboardLayout>
  );

}
