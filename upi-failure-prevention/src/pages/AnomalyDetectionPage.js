import { useEffect, useMemo, useState } from "react";

import {
  ScanLine,
  CircleCheck,
  TriangleAlert,
  Search,
  Funnel,
  Radar,
  Lightbulb,
  Info,
  Network,
  Smartphone,
} from "lucide-react";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import Pagination from "../components/Pagination";
import { Tag } from "../components/StatusBadge";
import {
  LoadingState,
  EmptyState,
} from "../components/States";
import { SelectInput } from "../components/FormInputs";
import { formatCurrency } from "../utils/format";

const API_BASE = "http://localhost:5000";

const COLORS = {
  anomaly: "#ef4444",
  normal: "#10b981",
  grid: "#e2e8f0",
  primary: "#4f46e5",
  info: "#3b82f6",
  warning: "#f59e0b",
};

// Wording is deliberate. An anomaly is a statistical outlier,
// never a fraud verdict, so "fraud" is not used anywhere here.
const ANOMALY_WORDING = "Potential anomaly";

function renderLegend({ payload }) {
  return (
    <div
      className="flex wrap gap-md"
      style={{
        justifyContent: "center",
        marginTop: 12,
      }}
    >
      {payload.map((entry) => (
        <span key={entry.value} className="legend">
          <span
            className="legend-dot"
            style={{ background: entry.color }}
          />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

function statusTone(row) {
  return row.anomaly_status === "ANOMALY"
    ? "fail"
    : "ok";
}

// ==========================================
// EXPLANATION PANEL
// ------------------------------------------
// Every number shown here comes from the transaction itself or
// from the measured distribution of the dataset. Nothing is
// guessed, and a row with no measurable deviation is reported
// as such rather than given an invented reason.

function ExplanationPanel({ row, model, totalAnalyzed }) {
  if (!row) {
    return (
      <Card
        title="Why was this transaction flagged?"
        icon={Lightbulb}
      >
        <p className="muted small">
          Select any transaction above to see the measured
          features that made it stand out.
        </p>
      </Card>
    );
  }

  const isAnomaly = row.anomaly_status === "ANOMALY";

  const amountRef = model?.amountReference;

  const percentile = Number(
    (100 - Number(row.anomaly_score || 0)).toFixed(2)
  );

  // How this amount sits inside the real amount distribution.
  let amountPosition = null;

  if (amountRef) {
    if (row.amount <= amountRef.p25) {
      amountPosition =
        "In the lowest quarter of all amounts.";
    } else if (row.amount <= amountRef.p75) {
      amountPosition =
        "Within the middle half of all amounts.";
    } else if (row.amount <= amountRef.p99) {
      amountPosition =
        "In the highest quarter of all amounts.";
    } else {
      amountPosition =
        "Above the 99th percentile of all amounts.";
    }
  }

  return (
    <Card
      title="Why was this transaction flagged?"
      icon={Lightbulb}
      className="mt-24"
    >
      <div
        className={`explain-panel ${
          isAnomaly ? "" : "normal-flag"
        }`}
      >
        <div className="explain-title">
          {isAnomaly ? (
            <TriangleAlert size={18} />
          ) : (
            <CircleCheck size={18} />
          )}

          {row.transaction_id}

          <Tag
            text={
              isAnomaly
                ? ANOMALY_WORDING
                : "Within normal range"
            }
            tone={isAnomaly ? "fail" : "ok"}
          />
        </div>

        <p className="muted small">
          {isAnomaly
            ? "This transaction sits in a sparse region of the feature space, which is what the Isolation Forest looks for. The reasons below are the features that were measured to be unusual."
            : "This transaction was not isolated as unusual. The Isolation Forest could separate it from the rest of the dataset as quickly as a typical transaction."}
        </p>

        <div
          className="explain-score"
          data-testid="explain-score"
        >
          <strong>
            {Number(row.anomaly_score || 0).toFixed(2)}
          </strong>

          <span className="muted">
            / 100 anomaly score
          </span>

          <span className="muted small">
            more unusual than about {percentile}% of the{" "}
            {Number(
              totalAnalyzed || 0
            ).toLocaleString()}{" "}
            analysed transactions
          </span>
        </div>

        {/* ---------- measured deviations ---------- */}

        {row.reasons && row.reasons.length > 0 ? (
          <>
            <h5 className="mb-8">
              Measured deviations
            </h5>

            <ul className="explain-reasons">
              {row.reasons.map((reason, index) => (
                <li key={index}>
                  <TriangleAlert size={16} />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h5 className="mb-8">
              Measured deviations
            </h5>

            <div className="alert alert-info mb-16">
              <Info size={18} />
              <div>
                <p>
                  No single feature of this transaction is
                  measurably unusual on its own. It was flagged
                  because the{" "}
                  <strong>
                    combination
                  </strong>{" "}
                  of amount, time, banks, network, device and
                  status rarely occurs together, which is
                  exactly the kind of pattern an Isolation
                  Forest is built to detect. No reason is
                  listed here because none of the individual
                  features crossed the rarity threshold.
                </p>
              </div>
            </div>
          </>
        )}

        {/* ---------- feature profile ---------- */}

        <h5 className="mb-8">
          Features used by the model
        </h5>

        <div className="explain-facts">
          <div>
            <div className="explain-fact-label">
              Amount
            </div>
            <div className="explain-fact-value">
              {formatCurrency(row.amount)}
            </div>
            {amountRef && (
              <div className="muted small">
                Median{" "}
                {formatCurrency(amountRef.median)}{" "}
                · {amountPosition}
              </div>
            )}
          </div>

          <div>
            <div className="explain-fact-label">
              Hour of day
            </div>
            <div className="explain-fact-value">
              {String(row.hour_of_day).padStart(
                2,
                "0"
              )}
              :00
            </div>
            <div className="muted small">
              {row.is_weekend
                ? "Weekend"
                : "Weekday"}
            </div>
          </div>

          <div>
            <div className="explain-fact-label">
              Bank route
            </div>
            <div className="explain-fact-value">
              {row.sender_bank} → {row.receiver_bank}
            </div>
          </div>

          <div>
            <div className="explain-fact-label">
              Network
            </div>
            <div className="explain-fact-value">
              {row.network_type}
            </div>
          </div>

          <div>
            <div className="explain-fact-label">
              Device
            </div>
            <div className="explain-fact-value">
              {row.device_type}
            </div>
          </div>

          <div>
            <div className="explain-fact-label">
              Transaction type
            </div>
            <div className="explain-fact-value">
              {row.transaction_type}
            </div>
          </div>

          <div>
            <div className="explain-fact-label">
              Transaction status
            </div>
            <div className="explain-fact-value">
              {row.transaction_status}
            </div>
          </div>

          <div>
            <div className="explain-fact-label">
              Model
            </div>
            <div className="explain-fact-value">
              {model?.algorithm}
            </div>
            <div className="muted small">
              {model?.params?.n_estimators} trees,
              unsupervised
            </div>
          </div>
        </div>

        {/* ---------- disclaimer ---------- */}

        <div className="explain-note">
          <Info size={15} />
          <span>
            <strong>
              {ANOMALY_WORDING} detected
            </strong>{" "}
            does not mean fraud. Isolation Forest is
            unsupervised: it only measures how unusual a
            transaction looks compared with the rest of the
            dataset. It has no notion of fraud and this
            result is not a substitute for the separate Random
            Forest risk prediction or for a human review.
          </span>
        </div>
      </div>
    </Card>
  );
}

export default function AnomalyDetectionPage({ user }) {
  // ==========================================
  // STATE
  // ==========================================

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [senderBank, setSenderBank] = useState("");
  const [receiverBank, setReceiverBank] = useState("");
  const [networkType, setNetworkType] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [status, setStatus] = useState("ANOMALY");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const [selected, setSelected] = useState(null);

  // ==========================================
  // FETCH
  // ------------------------------------------
  // The backend scores all 250,000 rows with the Isolation
  // Forest and caches the result, so filtering and paging
  // happen there and stay fast.

  useEffect(() => {
    let cancelled = false;

    const fetchAnomalies = async () => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          sortBy: "anomalyScore",
          sortOrder: "desc",
        });

        if (search.trim()) {
          params.set("search", search.trim());
        }
        if (senderBank) {
          params.set("senderBank", senderBank);
        }
        if (receiverBank) {
          params.set("receiverBank", receiverBank);
        }
        if (networkType) {
          params.set("networkType", networkType);
        }
        if (deviceType) {
          params.set("deviceType", deviceType);
        }
        if (transactionType) {
          params.set(
            "transactionType",
            transactionType
          );
        }
        if (status) params.set("status", status);

        const response = await fetch(
          `${API_BASE}/api/anomalies?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch anomalies");
        }

        const payload = await response.json();

        if (cancelled) return;

        setData(payload);

        // Keep the explanation panel in sync with the page.
        setSelected(
          payload.results?.find(
            (row) =>
              row.transaction_id ===
              selected?.transaction_id
          ) || payload.results?.[0] || null
        );
      } catch (err) {
        console.error("Anomaly detection error:", err);

        if (!cancelled) {
          setError(
            "Unable to load anomaly data. Make sure the backend is running on port 5000 and the Isolation Forest model is trained."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Debounced so typing a transaction ID does not fire a
    // request per keystroke.
    const timer = setTimeout(
      fetchAnomalies,
      search ? 350 : 0
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `selected` is intentionally not a dependency: it is
    // reconciled inside the response handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search,
    senderBank,
    receiverBank,
    networkType,
    deviceType,
    transactionType,
    status,
    page,
    limit,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    senderBank,
    receiverBank,
    networkType,
    deviceType,
    transactionType,
    status,
  ]);

  // ==========================================
  // DERIVED DATA
  // ==========================================

  const summary = data?.summary;
  const model = data?.model;
  const distribution = data?.distribution;
  const filterOptions = data?.filters;
  const pagination = data?.pagination;

  const results = useMemo(
    () => data?.results || [],
    [data]
  );

  const totalAnalyzed = Number(
    summary?.totalAnalyzed || 0
  );

  const anomalyPercentage = Number(
    summary?.anomalyPercentage || 0
  );

  // Pie data for the anomaly distribution chart.
  const distributionPie = useMemo(
    () => [
      {
        name: "Normal",
        value: Number(
          summary?.normalTransactions || 0
        ),
      },
      {
        name: "Potential anomalies",
        value: Number(
          summary?.anomalousTransactions || 0
        ),
      },
    ],
    [summary]
  );

  // Split the scatter sample by status so each group can be
  // coloured and drawn separately.
  const scatterGroups = useMemo(() => {
    const groups = { ANOMALY: [], NORMAL: [] };

    (data?.scatter || []).forEach((point) => {
      groups[point.anomaly_status]?.push(point);
    });

    return groups;
  }, [data]);

  // Most anomaly-dense hour, used as a generated insight.
  const riskiestHour = useMemo(() => {
    const hours = distribution?.byHour || [];

    if (hours.length === 0) return null;

    return [...hours].sort(
      (a, b) => b.anomalyRate - a.anomalyRate
    )[0];
  }, [distribution]);

  const hasFilters = Boolean(
    search ||
      senderBank ||
      receiverBank ||
      networkType ||
      deviceType ||
      transactionType
  );

  const resetFilters = () => {
    setSearch("");
    setSenderBank("");
    setReceiverBank("");
    setNetworkType("");
    setDeviceType("");
    setTransactionType("");
    setStatus("ANOMALY");
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (loading && !data) {
    return (
      <DashboardLayout
        user={user}
        title="Transaction Anomaly Detection"
      >
        <LoadingState label="Running Isolation Forest over the transaction dataset..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      user={user}
      title="Transaction Anomaly Detection"
    >
      <PageHeader
        subtitle="Unsupervised Isolation Forest scoring of every transaction, showing patterns that deviate from the dataset."
        actions={
          <Tag
            text={
              model?.algorithm || "IsolationForest"
            }
            tone="info"
          />
        }
      />

      {/* ==========================================
          ERROR
      ========================================== */}

      {error && (
        <Card className="mb-24">
          <div className="alert alert-danger">
            <TriangleAlert size={22} />
            <div>
              <div className="alert-title">
                Unable to Load Anomaly Detection
              </div>
              <p>{error}</p>
              <p className="mono small">
                python ml/train_anomaly_model.py
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ==========================================
          STAT CARDS
      ========================================== */}

      <div className="grid grid-stat mb-24">
        <StatCard
          label="Total Transactions Analysed"
          value={totalAnalyzed.toLocaleString()}
          icon={ScanLine}
          color="primary"
          sub={
            summary?.isFiltered
              ? `Whole dataset — ${Number(
                  summary.totalAnalyzed || 0
                ).toLocaleString()} rows scored`
              : "Whole dataset scored by the model"
          }
        />

        <StatCard
          label="Normal Transactions"
          value={Number(
            summary?.normalTransactions || 0
          ).toLocaleString()}
          icon={CircleCheck}
          color="success"
          sub={
            summary?.isFiltered
              ? "In the current filtered view"
              : "Isolated as quickly as a typical transaction"
          }
        />

        <StatCard
          label="Anomalous Transactions"
          value={Number(
            summary?.anomalousTransactions || 0
          ).toLocaleString()}
          icon={TriangleAlert}
          color="danger"
          sub="Flagged as potential anomalies"
        />

        <StatCard
          label="Anomaly Percentage"
          value={`${anomalyPercentage}%`}
          icon={Radar}
          color="warning"
          sub={
            summary?.isFiltered
              ? `Of ${Number(
                    summary?.filteredTransactions || 0
                  ).toLocaleString()} filtered transactions`
              : `Of the whole dataset (contamination ${Number(
                  model?.params?.contamination || 0
                )})`
          }
        />
      </div>

      {/* ==========================================
          FILTERS
      ========================================== */}

      <div className="filter-bar">
        <div>
          <label>Search Transaction ID</label>

          <div style={{ position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: 12,
                color: "var(--text-muted)",
              }}
            />

            <input
              className="form-control"
              style={{ paddingLeft: 34 }}
              placeholder="e.g. TXN0000012345"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>
        </div>

        <SelectInput
          value={senderBank}
          onChange={(e) => setSenderBank(e.target.value)}
        >
          <option value="">All Sender Banks</option>

          {(filterOptions?.senderBanks || []).map(
            (bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            )
          )}
        </SelectInput>

        <SelectInput
          value={receiverBank}
          onChange={(e) =>
            setReceiverBank(e.target.value)
          }
        >
          <option value="">All Receiver Banks</option>

          {(filterOptions?.receiverBanks || []).map(
            (bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            )
          )}
        </SelectInput>

        <SelectInput
          value={networkType}
          onChange={(e) => setNetworkType(e.target.value)}
        >
          <option value="">All Networks</option>

          {(filterOptions?.networkTypes || []).map(
            (net) => (
              <option key={net} value={net}>
                {net}
              </option>
            )
          )}
        </SelectInput>

        <SelectInput
          value={deviceType}
          onChange={(e) => setDeviceType(e.target.value)}
        >
          <option value="">All Devices</option>

          {(filterOptions?.deviceTypes || []).map(
            (device) => (
              <option key={device} value={device}>
                {device}
              </option>
            )
          )}
        </SelectInput>

        <SelectInput
          value={transactionType}
          onChange={(e) =>
            setTransactionType(e.target.value)
          }
        >
          <option value="">All Transaction Types</option>

          {(
            filterOptions?.transactionTypes || []
          ).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ANOMALY">
            Potential anomalies only
          </option>
          <option value="NORMAL">
            Normal only
          </option>
          <option value="">All transactions</option>
        </SelectInput>

        <SelectInput
          value={String(limit)}
          onChange={(e) =>
            setLimit(Number(e.target.value))
          }
        >
          <option value="25">25 per page</option>
          <option value="50">50 per page</option>
          <option value="100">100 per page</option>
        </SelectInput>

        <div className="flex items-center">
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.82rem" }}
            onClick={resetFilters}
            disabled={!hasFilters}
          >
            <Funnel size={15} />
            Reset Filters
          </button>
        </div>
      </div>

      {/* ==========================================
          CHARTS
      ========================================== */}

      <div className="grid-two mb-24">
        <Card
          title="Anomaly Distribution"
          icon={Radar}
        >
          <ResponsiveContainer
            width="100%"
            height={260}
          >
            <PieChart>
              <Pie
                data={distributionPie}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
              >
                <Cell fill={COLORS.normal} />
                <Cell fill={COLORS.anomaly} />
              </Pie>

              <Tooltip />

              <Legend content={renderLegend} />
            </PieChart>
          </ResponsiveContainer>

          <p className="muted small mt-16">
            {Number(
              summary?.anomalousTransactions || 0
            ).toLocaleString()}{" "}
            of{" "}
            {Number(
              pagination?.total || 0
            ).toLocaleString()}{" "}
            transactions in this view were isolated as
            potential anomalies.
          </p>
        </Card>

        <Card
          title="Anomaly Rate By Network Type"
          icon={Network}
        >
          <ResponsiveContainer
            width="100%"
            height={260}
          >
            <BarChart
              data={distribution?.byNetwork || []}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.grid}
              />

              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
              />

              <YAxis
                tick={{ fontSize: 12 }}
                unit="%"
              />

              <Tooltip />

              <Bar
                dataKey="anomalyRate"
                name="Anomaly rate"
                fill={COLORS.anomaly}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>

          {riskiestHour && (
            <p className="muted small mt-16">
              {riskiestHour.label} is the hour with the highest
              anomaly rate in this view at{" "}
              {Number(riskiestHour.anomalyRate).toFixed(2)}%
              across{" "}
              {Number(riskiestHour.total).toLocaleString()}{" "}
              transactions.
            </p>
          )}
        </Card>
      </div>

      <Card
        title="Amount vs Anomaly Score"
        icon={Radar}
        className="mb-24"
      >
        <ResponsiveContainer
          width="100%"
          height={320}
        >
          <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid
              stroke={COLORS.grid}
              strokeDasharray="3 3"
            />

            <XAxis
              type="number"
              dataKey="amount"
              name="Amount"
              tick={{ fontSize: 11 }}
              tickFormatter={(value) =>
                `₹${Number(value).toLocaleString()}`
              }
            />

            <YAxis
              type="number"
              dataKey="anomaly_score"
              name="Anomaly score"
              unit=""
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
            />

            <ZAxis range={[18, 18]} />

            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(value, name) =>
                name === "Amount"
                  ? [
                      `₹${Number(value).toLocaleString()}`,
                      "Amount",
                    ]
                  : [Number(value).toFixed(2), "Anomaly score"]
              }
            />

            <Legend content={renderLegend} />

            <Scatter
              name="Normal"
              data={scatterGroups.NORMAL}
              fill={COLORS.normal}
              fillOpacity={0.35}
            />

            <Scatter
              name="Potential anomaly"
              data={scatterGroups.ANOMALY}
              fill={COLORS.anomaly}
              fillOpacity={0.55}
            />
          </ScatterChart>
        </ResponsiveContainer>

        <p className="muted small mt-16">
          An evenly spaced sample of{" "}
          {(data?.scatter || []).length.toLocaleString()}{" "}
          transactions from the current view. High-value
          transactions and low-value transactions can both be
          flagged, because the model judges the whole pattern
          and not the amount alone.
        </p>
      </Card>

      {/* ==========================================
          TABLE
      ========================================== */}

      <Card
        title={
          status === "ANOMALY"
            ? "Potential Anomalies"
            : status === "NORMAL"
            ? "Normal Transactions"
            : "All Analysed Transactions"
        }
        icon={ScanLine}
        actions={
          <Tag
            text={`${Number(
              pagination?.total || 0
            ).toLocaleString()} matched`}
            tone="neutral"
          />
        }
      >
        {results.length === 0 ? (
          <EmptyState
            title="No transactions found"
            message="Try changing the filters or searching a different transaction ID."
          />
        ) : (
          <>
            <div
              className="table-wrap"
              style={{
                border: "none",
                boxShadow: "none",
              }}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Amount</th>
                    <th>Sender Bank</th>
                    <th>Receiver Bank</th>
                    <th>Network</th>
                    <th>Device</th>
                    <th>Anomaly Score</th>
                    <th>Status</th>
                    <th>Why flagged</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((row) => {
                    const isSelected =
                      selected?.transaction_id ===
                      row.transaction_id;

                    return (
                      <tr
                        key={row.transaction_id}
                        className={`row-clickable ${
                          isSelected
                            ? "is-explained"
                            : ""
                        }`}
                        onClick={() =>
                          setSelected(row)
                        }
                      >
                        <td className="mono">
                          {row.transaction_id}
                        </td>

                        <td
                          style={{ fontWeight: 600 }}
                        >
                          {formatCurrency(row.amount)}
                        </td>

                        <td>{row.sender_bank}</td>

                        <td>{row.receiver_bank}</td>

                        <td>
                          <span className="flex items-center gap-sm">
                            <Network size={14} />
                            {row.network_type}
                          </span>
                        </td>

                        <td>
                          <span className="flex items-center gap-sm">
                            <Smartphone size={14} />
                            {row.device_type}
                          </span>
                        </td>

                        <td>
                          <div className="rate-cell">
                            <div className="rate-track">
                              <div
                                className={`rate-fill ${
                                  statusTone(row) === "fail"
                                    ? "level-high"
                                    : ""
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Number(
                                      row.anomaly_score ||
                                        0
                                    )
                                  )}%`,
                                }}
                              />
                            </div>

                            <span className="rate-value">
                              {Number(
                                row.anomaly_score || 0
                              ).toFixed(2)}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`badge badge-${statusTone(
                              row
                            )}`}
                          >
                            {row.anomaly_status ===
                            "ANOMALY"
                              ? ANOMALY_WORDING
                              : "Normal"}
                          </span>
                        </td>

                        <td>
                          <button
                            className="text-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(row);
                            }}
                          >
                            {row.anomaly_status ===
                            "ANOMALY"
                              ? "Explain"
                              : "View"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={Number(pagination?.page || 1)}
              totalPages={Number(
                pagination?.totalPages || 1
              )}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      {/* ==========================================
          EXPLANATION
      ========================================== */}

      <ExplanationPanel
        row={selected}
        model={model}
        totalAnalyzed={totalAnalyzed}
      />

      {/* ==========================================
          METHOD
      ========================================== */}

      <div className="grid grid-stat mt-24">
        <Card title="How the model works" icon={Radar}>
          <p className="muted small">
            {model?.algorithm} is an{" "}
            <strong>unsupervised</strong> algorithm, so it
            needs no fraud labels. It grows{" "}
            {model?.params?.n_estimators} random trees and
            measures how many splits are needed to isolate a
            transaction on its own. Transactions that fall
            apart in very few splits sit in sparse, rarely
            visited regions of the feature space and are
            treated as anomalies.
          </p>

          <p className="muted small mt-8">
            It is completely separate from the Random Forest
            used by the Risk Prediction page, and it never
            changes it. A contamination of{" "}
            {Number(
              model?.params?.contamination || 0
            )}{" "}
            was set, which is why roughly{" "}
            {Number(
              model
                ? Number(
                    summary?.datasetAnomalyPercentage || 0
                  )
                : 0
            )}
            % of the dataset is flagged.
          </p>
        </Card>

        <Card
          title="Features used by the model"
          icon={Radar}
        >
          <h5 className="mb-8">Numeric</h5>

          <div className="flex wrap gap-sm mb-16">
            {(model?.numericFeatures || []).map(
              (feature) => (
                <span
                  key={feature}
                  className="chip"
                >
                  {feature}
                </span>
              )
            )}
          </div>

          <h5 className="mb-8">
            Categorical (one-hot encoded)
          </h5>

          <div className="flex wrap gap-sm">
            {(model?.categoricalFeatures || []).map(
              (feature) => (
                <span
                  key={feature}
                  className="chip"
                >
                  {feature}
                </span>
              )
            )}
          </div>

          <p className="muted small mt-16">
            Categorical values are one-hot encoded, so{" "}
            <code>3G</code> is never treated as "closer" to{" "}
            <code>2G</code> than to <code>5G</code> because of
            a made-up numeric order.
          </p>
        </Card>

        <Card
          title="How to read a score"
          icon={Lightbulb}
        >
          <p className="muted small">
            The score runs from 0 to 100, where 100 is the most
            unusual transaction in the whole dataset. It is a
            percentile of the real score distribution, not a
            probability.
          </p>

          <div className="explain-facts mt-16">
            <div>
              <div className="explain-fact-label">
                Scored
              </div>
              <div className="explain-fact-value">
                {Number(
                  model?.scoreRange?.min || 0
                ).toFixed(2)}{" "}
                –{" "}
                {Number(
                  model?.scoreRange?.max || 0
                ).toFixed(2)}
              </div>
            </div>

            <div>
              <div className="explain-fact-label">
                Mean score
              </div>
              <div className="explain-fact-value">
                {Number(
                  model?.scoreRange?.mean || 0
                ).toFixed(2)}
              </div>
            </div>
          </div>

          <p className="muted small mt-16">
            <strong>
              {ANOMALY_WORDING}
            </strong>{" "}
            means the transaction looks unusual for this
            dataset. It is not a fraud finding. The Random
            Forest risk score remains the separate fraud
            signal in this project.
          </p>
        </Card>
      </div>

      {model?.generatedAt && (
        <p className="muted small mt-24">
          Scores generated {new Date(
            model.generatedAt
          ).toLocaleString()} · model trained{" "}
          {new Date(
            model.trainedAt
          ).toLocaleString()}
        </p>
      )}
    </DashboardLayout>
  );
}
