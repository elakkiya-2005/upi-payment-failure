import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  History,
  ShieldAlert,
  Wallet,
  TrendingUp,
  Brain,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";
import { RiskBadge } from "../components/StatusBadge";
import { EmptyState, LoadingState } from "../components/States";
import { SelectInput, TextInput } from "../components/FormInputs";
import { formatCurrency, formatDateTime } from "../utils/format";
import { authHeaders } from "../utils/auth";

const PAGE_SIZE = 10;

const SORTS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "failure", label: "Highest Measured Failure Rate" },
  { value: "amount", label: "Highest Amount" },
];

// The model returns 1 for fraud and 0 otherwise.
const predictionLabel = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  return String(value) === "1" ? "Fraud Detected" : "No Fraud Detected";
};

// A risk check is only measured when the selected values exist in the
// dataset. Anything else was never compared to history, so no rate is
// shown for it rather than showing a misleading zero.
const measuredLabel = (row) => {
  const level = String(row.risk_level || "").toLowerCase();

  if (level === "not comparable") return { text: "Not comparable", tone: "muted" };
  if (level === "unavailable") return { text: "Unavailable", tone: "muted" };
  if (row.knn_neighbor_count === null || row.knn_neighbor_count === undefined) {
    return { text: "—", tone: "muted" };
  }

  const rate = Number(row.knn_failure_rate) * 100;
  const lift = Number(row.knn_lift);

  if (!Number.isFinite(rate)) return { text: "—", tone: "muted" };

  return {
    text: `${rate.toFixed(1)}%`,
    lift: Number.isFinite(lift) ? lift.toFixed(2) : null,
    confidence: row.knn_confidence,
    tone: lift >= 1.25 ? "danger" : lift >= 1.1 ? "warning" : "success",
  };
};

// The single cause worth remembering from the row, or an honest note
// that the transaction matched the baseline.
const causeLabel = (row) => {
  const level = String(row.risk_level || "").toLowerCase();

  if (level === "not comparable") return { text: "Not comparable", tone: "muted" };

  if (row.root_cause_top) {
    return { text: row.root_cause_top, tone: "danger" };
  }

  if (Number(row.root_cause_significant) === 1) {
    return { text: "Elevated, no single cause", tone: "warning" };
  }

  const detail = row.root_cause_detail;

  if (detail && detail.evaluated) {
    return { text: "Within baseline", tone: "success" };
  }

  return { text: "—", tone: "muted" };
};

const toneColor = {
  danger: "var(--danger)",
  warning: "var(--warning)",
  success: "var(--success)",
  muted: "var(--text-muted)",
};

export default function MyRiskHistoryPage({ user }) {

  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [bank, setBank] = useState("");
  const [paymentApp, setPaymentApp] = useState("");
  const [network, setNetwork] = useState("");
  const [device, setDevice] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [onlyElevated, setOnlyElevated] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());


  // The backend scopes the response to the signed-in user, so this page
  // never sends or receives a user id of its own.
  useEffect(() => {

    let active = true;

    const fetchHistory = async () => {

      try {

        const response = await fetch(
          "http://localhost:5000/api/my-risk-history",
          { headers: authHeaders() }
        );

        if (response.status === 401) {
          throw new Error("Please sign in to view your risk history.");
        }

        if (!response.ok) {
          throw new Error("Could not load your risk history.");
        }

        const data = await response.json();

        if (active) setAssessments(data.assessments || []);

      } catch (err) {

        if (active) setError(err.message);

      } finally {

        if (active) setLoading(false);

      }

    };

    fetchHistory();

    return () => {
      active = false;
    };

  }, []);


  // Filter options come from the user's own rows.
  const options = useMemo(
    () => ({
      banks: [...new Set(assessments.map((a) => a.bank).filter(Boolean))].sort(),
      apps: [...new Set(assessments.map((a) => a.payment_app).filter(Boolean))].sort(),
      networks: [...new Set(assessments.map((a) => a.network_type).filter(Boolean))].sort(),
      devices: [...new Set(assessments.map((a) => a.device_type).filter(Boolean))].sort(),
    }),
    [assessments]
  );


  // Summary counts every assessment the user has, not just the filtered view.
  const summary = useMemo(() => {
    const counts = {
      total: assessments.length,
      high: 0,
      medium: 0,
      low: 0,
      elevated: 0,
      anomalies: 0,
    };

    assessments.forEach((row) => {
      const level = String(row.risk_level || "").toLowerCase();
      if (level === "high") counts.high += 1;
      else if (level === "medium") counts.medium += 1;
      else if (level === "low") counts.low += 1;

      if (Number(row.root_cause_significant) === 1) counts.elevated += 1;
      if (row.anomaly_status === "ANOMALY") counts.anomalies += 1;
    });

    return counts;
  }, [assessments]);


  const filtered = useMemo(() => {

    let list = [...assessments];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          (a.transaction_id || "").toLowerCase().includes(q) ||
          (a.payment_app || "").toLowerCase().includes(q) ||
          (a.bank || "").toLowerCase().includes(q)
      );
    }

    if (riskLevel) list = list.filter((a) => a.risk_level === riskLevel);
    if (bank) list = list.filter((a) => a.bank === bank);
    if (paymentApp) list = list.filter((a) => a.payment_app === paymentApp);
    if (network) list = list.filter((a) => a.network_type === network);
    if (device) list = list.filter((a) => a.device_type === device);

    // Only rows where the data actually showed a factor above baseline.
    if (onlyElevated) {
      list = list.filter((a) => Number(a.root_cause_significant) === 1);
    }

    if (date) {
      list = list.filter((a) => {
        const created = new Date(a.created_at);
        if (Number.isNaN(created.getTime())) return false;
        return created.toLocaleDateString("en-CA") === date;
      });
    }

    const byTime = (a, b) => new Date(b.created_at) - new Date(a.created_at);

    if (sort === "newest") list.sort(byTime);
    else if (sort === "oldest") list.sort((a, b) => -byTime(a, b));
    else if (sort === "failure") {
      // Unmeasured rows sort last instead of pretending to be 0%.
      list.sort(
        (a, b) =>
          Number(b.knn_failure_rate || 0) - Number(a.knn_failure_rate || 0)
      );
    } else if (sort === "amount") {
      list.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    }

    return list;

  }, [assessments, search, riskLevel, bank, paymentApp, network, device, date, sort, onlyElevated]);


  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);


  const resetFilters = () => {
    setSearch("");
    setRiskLevel("");
    setBank("");
    setPaymentApp("");
    setNetwork("");
    setDevice("");
    setDate("");
    setSort("newest");
    setOnlyElevated(false);
    setPage(1);
  };


  const toggleRow = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  if (loading) {
    return (
      <DashboardLayout user={user} title="My Risk History">
        <LoadingState label="Loading your risk assessments..." />
      </DashboardLayout>
    );
  }


  return (

    <DashboardLayout user={user} title="My Risk History">

      <PageHeader
        subtitle="View the transactions you previously checked for risk."
      />


      {error && (
        <div className="form-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}


      {/* SUMMARY CARDS */}

      <div className="grid grid-stat mb-24">

        <StatCard
          label="Total Risk Checks"
          value={summary.total.toLocaleString()}
          icon={History}
          color="primary"
          sub="Assessments you have run"
        />

        <StatCard
          label="High Risk"
          value={summary.high.toLocaleString()}
          icon={ShieldAlert}
          color="danger"
          sub="Flagged as high risk"
        />

        <StatCard
          label="Medium Risk"
          value={summary.medium.toLocaleString()}
          icon={ShieldAlert}
          color="warning"
          sub="Worth reviewing"
        />

        <StatCard
          label="Low Risk"
          value={summary.low.toLocaleString()}
          icon={Wallet}
          color="success"
          sub="No major risk indicators"
        />

        <StatCard
          label="Measured Causes Found"
          value={summary.elevated.toLocaleString()}
          icon={TrendingUp}
          color="warning"
          sub="A factor failed above baseline"
        />

        <StatCard
          label="Anomalies Flagged"
          value={summary.anomalies.toLocaleString()}
          icon={Brain}
          color="danger"
          sub="Unusual combinations"
        />

      </div>


      {/* FILTERS */}

      <div className="filter-bar">

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
            placeholder="Search by transaction ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <SelectInput
          value={riskLevel}
          onChange={(e) => {
            setRiskLevel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Risk Levels</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </SelectInput>

        <SelectInput
          value={bank}
          onChange={(e) => {
            setBank(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Banks</option>
          {options.banks.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </SelectInput>

        <SelectInput
          value={paymentApp}
          onChange={(e) => {
            setPaymentApp(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Payment Apps</option>
          {options.apps.map((app) => (
            <option key={app} value={app}>{app}</option>
          ))}
        </SelectInput>

        <SelectInput
          value={network}
          onChange={(e) => {
            setNetwork(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Networks</option>
          {options.networks.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </SelectInput>

        <SelectInput
          value={device}
          onChange={(e) => {
            setDevice(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Devices</option>
          {options.devices.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </SelectInput>

        <TextInput
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
        />

        <SelectInput
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </SelectInput>

      </div>


      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          fontSize: "0.85rem",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={onlyElevated}
          onChange={(e) => {
            setOnlyElevated(e.target.checked);
            setPage(1);
          }}
        />
        Show only checks where the data found a factor above baseline
      </label>


      {/* TABLE */}

      <Card
        title="Risk Assessments"
        icon={History}
        actions={
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.82rem", fontWeight: 600 }}
            onClick={resetFilters}
          >
            <Filter size={15} />
            Reset Filters
          </button>
        }
      >

        {rows.length === 0 ? (

          assessments.length === 0 ? (

            <EmptyState
              title="No Risk Assessments Yet"
              message="Transactions you check on the Risk Check page will appear here."
            />

          ) : (

            <EmptyState
              title="No matching assessments"
              message="Try changing your search term or clearing the filters."
            />

          )

        ) : (

          <div
            className="table-wrap"
            style={{ border: "none", boxShadow: "none" }}
          >

            <table className="table">

              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Date &amp; Time</th>
                  <th>Transaction ID</th>
                  <th>Amount</th>
                  <th>Payment App</th>
                  <th>Bank</th>
                  <th>Device</th>
                  <th>Network</th>
                  <th>Transaction Type</th>
                  <th>Risk Level</th>
                  <th>Measured Failure Rate</th>
                  <th>Top Measured Cause</th>
                  <th>Anomaly</th>
                </tr>
              </thead>

              <tbody>

                {rows.map((row) => {

                  const measured = measuredLabel(row);
                  const cause = causeLabel(row);
                  const isOpen = expanded.has(row.id);
                  const causes = row.root_cause_detail?.causes || [];
                  const actions = row.recommendation_actions || [];

                  return (
                    <Fragment key={row.id}>

                      <tr
                        onClick={() => toggleRow(row.id)}
                        style={{ cursor: "pointer" }}
                      >

                        <td>
                          {isOpen ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </td>

                        <td>{formatDateTime(row.created_at)}</td>

                        <td className="mono">
                          {row.transaction_id || "—"}
                        </td>

                        <td style={{ fontWeight: 600 }}>
                          {formatCurrency(Number(row.amount || 0))}
                        </td>

                        <td>{row.payment_app || "—"}</td>

                        <td>{row.bank || "—"}</td>

                        <td>{row.device_type || "—"}</td>

                        <td>{row.network_type || "—"}</td>

                        <td>{row.transaction_type || "—"}</td>

                        <td>
                          <RiskBadge
                            level={String(row.risk_level || "low").toLowerCase()}
                          />
                        </td>

                        <td>
                          <span
                            style={{
                              color: toneColor[measured.tone],
                              fontWeight: 600,
                            }}
                          >
                            {measured.text}
                          </span>

                          {measured.lift && (
                            <small
                              style={{
                                display: "block",
                                color: "var(--text-muted)",
                              }}
                            >
                              {measured.lift}x baseline
                            </small>
                          )}
                        </td>

                        <td
                          style={{
                            color: toneColor[cause.tone],
                            fontWeight: cause.tone === "muted" ? 400 : 600,
                          }}
                        >
                          {cause.text}
                        </td>

                        <td>
                          {row.anomaly_status ? (
                            <span
                              className={`badge badge-${
                                row.anomaly_status === "ANOMALY" ? "fail" : "ok"
                              }`}
                            >
                              {row.anomaly_status}
                              {row.anomaly_score != null &&
                                ` ${Number(row.anomaly_score).toFixed(0)}`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                      </tr>


                      {isOpen && (
                        <tr>
                          <td
                            colSpan={13}
                            style={{ background: "var(--bg)" }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gap: 14,
                                padding: "4px 2px",
                              }}
                            >

                              <div>
                                <strong
                                  style={{
                                    fontSize: "0.78rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  Measured against history
                                </strong>

                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 8,
                                    marginTop: 8,
                                  }}
                                >
                                  <span className="chip">
                                    {row.knn_failed_count ?? "—"} of{" "}
                                    {row.knn_neighbor_count ?? "—"} nearest
                                    transactions failed
                                  </span>

                                  {measured.lift && (
                                    <span className="chip">
                                      {measured.lift}x the baseline
                                    </span>
                                  )}

                                  {measured.confidence && (
                                    <span className="chip">
                                      {measured.confidence} confidence
                                    </span>
                                  )}

                                  {row.dataset_rows && (
                                    <span className="chip">
                                      {Number(row.dataset_rows).toLocaleString("en-IN")}{" "}
                                      transactions compared
                                    </span>
                                  )}
                                </div>
                              </div>


                              {causes.length > 0 && (
                                <div>
                                  <strong
                                    style={{
                                      fontSize: "0.78rem",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    Factors above baseline
                                  </strong>

                                  <ul
                                    style={{
                                      margin: "8px 0 0",
                                      paddingLeft: 18,
                                      fontSize: "0.85rem",
                                      display: "grid",
                                      gap: 4,
                                    }}
                                  >
                                    {causes.map((c, i) => (
                                      <li key={i}>
                                        <strong>
                                          {c.dimensionLabel} = {c.value}
                                        </strong>{" "}
                                        — {c.failureRatePercent}% failed
                                        across{" "}
                                        {Number(c.sampleSize).toLocaleString("en-IN")}{" "}
                                        transactions ({c.lift}x baseline)
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}


                              {row.recommendation_summary && (
                                <div>
                                  <strong
                                    style={{
                                      fontSize: "0.78rem",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.06em",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {row.recommendation_title ||
                                      "Recommended action"}
                                  </strong>

                                  <p
                                    style={{
                                      margin: "8px 0 0",
                                      fontSize: "0.85rem",
                                    }}
                                  >
                                    {row.recommendation_summary}
                                  </p>

                                  {actions.length > 0 && (
                                    <ul
                                      style={{
                                        margin: "8px 0 0",
                                        paddingLeft: 18,
                                        fontSize: "0.85rem",
                                        display: "grid",
                                        gap: 4,
                                      }}
                                    >
                                      {actions.map((action, i) => (
                                        <li key={i}>
                                          <strong>{action.action}</strong>
                                          {" — "}
                                          {action.reason}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}


                              <div>
                                <strong
                                  style={{
                                    fontSize: "0.78rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  Fraud model
                                </strong>

                                <p
                                  style={{
                                    margin: "8px 0 0",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {predictionLabel(row.prediction)}
                                  {row.risk_probability !== null &&
                                    row.risk_probability !== undefined && (
                                      <>
                                        {" at "}
                                        {Number(row.risk_probability).toFixed(2)}%
                                        fraud probability
                                      </>
                                    )}
                                </p>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}

                    </Fragment>
                  );

                })}

              </tbody>

            </table>

          </div>

        )}

      </Card>


      <Pagination
        page={safePage}
        totalPages={totalPages}
        onChange={setPage}
      />

    </DashboardLayout>

  );

}
