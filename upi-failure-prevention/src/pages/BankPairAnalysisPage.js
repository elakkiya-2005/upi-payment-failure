import { useEffect, useMemo, useState } from "react";

import {
  Network,
  Wallet,
  CircleX,
  TrendingDown,
  ArrowUpDown,
  Funnel,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  SearchX,
  TrendingUp,
  Landmark,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import Pagination from "../components/Pagination";
import { Tag } from "../components/StatusBadge";
import { LoadingState, EmptyState } from "../components/States";
import { SelectInput, TextInput } from "../components/FormInputs";

const API_BASE = "http://localhost:5000";

const PAGE_SIZE = 10;

// Columns the user can sort the table by. Each key maps onto a
// real field of the API response, so nothing is invented here.
const SORTABLE_COLUMNS = {
  senderBank: "senderBank",
  receiverBank: "receiverBank",
  totalTransactions: "totalTransactions",
  failedTransactions: "failedTransactions",
  successfulTransactions: "successfulTransactions",
  failureRate: "failureRate",
};

const SORT_LABELS = {
  senderBank: "Sender Bank",
  receiverBank: "Receiver Bank",
  totalTransactions: "Transactions",
  failedTransactions: "Failed",
  successfulTransactions: "Successful",
  failureRate: "Failure Rate",
};

// Mirrors the overall failure-rate thresholds used elsewhere in
// the app (DashboardPage) so the colours stay consistent.
function rateLevel(rate) {
  if (rate > 8) return "high";
  if (rate > 5) return "medium";
  return "low";
}

function pairLabel(pair) {
  if (!pair) return null;

  return (
    <>
      {pair.senderBank}
      <span className="muted"> → </span>
      {pair.receiverBank}
    </>
  );
}

function InsightCard({ icon: Icon, title, pair, metric, detail, accent }) {
  if (!pair) {
    return (
      <div className="insight-card">
        <div className="insight-head">
          <Icon size={18} />
          {title}
        </div>

        <div className="muted small">
          No bank pair matched the current filters.
        </div>
      </div>
    );
  }

  return (
    <div className={`insight-card accent-${accent}`}>
      <div className="insight-head">
        <Icon size={18} />
        {title}
      </div>

      <div className="insight-pair">{pairLabel(pair)}</div>

      <div className="insight-metric">{metric}</div>

      <div className="insight-detail">{detail}</div>
    </div>
  );
}

export default function BankPairAnalysisPage({ user }) {
  // ==========================================
  // STATE
  // ==========================================

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [senderBank, setSenderBank] = useState("");
  const [receiverBank, setReceiverBank] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sortKey, setSortKey] = useState("failureRate");
  const [sortDirection, setSortDirection] = useState("desc");

  const [page, setPage] = useState(1);

  // ==========================================
  // FETCH
  // -----------------------------------------
  // Filtering happens in SQL on the backend so the numbers shown
  // are always aggregated directly by MySQL. Sorting is applied
  // here because the whole (small) result set is returned.

  useEffect(() => {
    let cancelled = false;

    const fetchBankPairs = async () => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();

        if (senderBank) params.set("senderBank", senderBank);
        if (receiverBank) {
          params.set("receiverBank", receiverBank);
        }
        if (transactionType) {
          params.set("transactionType", transactionType);
        }
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        params.set("sortBy", sortKey);
        params.set("sortOrder", sortDirection);

        const response = await fetch(
          `${API_BASE}/api/bank-pair-analysis?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch bank pair analysis");
        }

        const payload = await response.json();

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        console.error("Bank pair analysis error:", err);

        if (!cancelled) {
          setError(
            "Unable to load bank pair analysis. Make sure the backend is running on port 5000."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchBankPairs();
  }, [
    senderBank,
    receiverBank,
    transactionType,
    dateFrom,
    dateTo,
    sortKey,
    sortDirection,
  ]);

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [
    senderBank,
    receiverBank,
    transactionType,
    dateFrom,
    dateTo,
  ]);

  // ==========================================
  // DERIVED DATA
  // ==========================================

  const pairs = useMemo(
    () => data?.pairs || [],
    [data]
  );

  const summary = data?.summary;
  const insights = data?.insights;
  const filterOptions = data?.filters;

  // Chart shows the worst pairs by failure rate, with a floor on
  // volume so a single-transaction pair cannot top the chart.
  const chartData = useMemo(() => {
    return [...pairs]
      .filter((pair) => pair.totalTransactions >= 20)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 12)
      .map((pair) => ({
        name: `${pair.senderBank} → ${pair.receiverBank}`,
        failureRate: pair.failureRate,
        failedTransactions: pair.failedTransactions,
        totalTransactions: pair.totalTransactions,
      }));
  }, [pairs]);

  const overallRate = Number(summary?.overallFailureRate || 0);

  // ==========================================
  // SORTING
  // ==========================================

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDirection((current) =>
        current === "asc" ? "desc" : "asc"
      );
    } else {
      setSortKey(key);
      setSortDirection(
        key === "senderBank" || key === "receiverBank"
          ? "asc"
          : "desc"
      );
    }
  };

  const sortIndicator = (key) => {
    if (key !== sortKey) return null;

    return sortDirection === "asc" ? (
      <ArrowUp size={13} />
    ) : (
      <ArrowDown size={13} />
    );
  };

  // ==========================================
  // PAGINATION
  // ==========================================

  const totalPages = Math.max(
    1,
    Math.ceil(pairs.length / PAGE_SIZE)
  );

  const safePage = Math.min(page, totalPages);

  const visiblePairs = pairs.slice(
    (safePage - 1) * PAGE_SIZE,
    (safePage - 1) * PAGE_SIZE + PAGE_SIZE
  );

  // ==========================================
  // FILTERS
  // ==========================================

  const hasFilters = Boolean(
    senderBank ||
      receiverBank ||
      transactionType ||
      dateFrom ||
      dateTo
  );

  const resetFilters = () => {
    setSenderBank("");
    setReceiverBank("");
    setTransactionType("");
    setDateFrom("");
    setDateTo("");
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (loading && !data) {
    return (
      <DashboardLayout
        user={user}
        title="Bank Pair Analysis"
      >
        <LoadingState label="Aggregating bank pair failures from MySQL..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      user={user}
      title="Bank Pair Analysis"
    >
      <PageHeader
        subtitle="Every sender bank to receiver bank route in the dataset, with its measured failure rate."
        actions={
          <Tag
            text={
              hasFilters
                ? "Filtered view"
                : "All 250,000 transactions"
            }
            tone={hasFilters ? "medium" : "info"}
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
                Unable to Load Bank Pair Analysis
              </div>
              <p>{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ==========================================
          SUMMARY CARDS
      ========================================== */}

      <div className="grid grid-stat mb-24">
        <StatCard
          label="Total Bank Pairs"
          value={Number(
            summary?.totalBankPairs || 0
          ).toLocaleString()}
          icon={Network}
          color="primary"
          sub="Distinct sender → receiver routes"
        />

        <StatCard
          label="Total Transactions"
          value={Number(
            summary?.totalTransactions || 0
          ).toLocaleString()}
          icon={Wallet}
          color="info"
          sub="Across the pairs shown"
        />

        <StatCard
          label="Failed Transactions"
          value={Number(
            summary?.failedTransactions || 0
          ).toLocaleString()}
          icon={CircleX}
          color="danger"
          sub={`${Number(
            summary?.successfulTransactions || 0
          ).toLocaleString()} succeeded`}
        />

        <StatCard
          label="Failure Rate"
          value={`${overallRate}%`}
          icon={TrendingDown}
          color={
            rateLevel(overallRate) === "high"
              ? "danger"
              : rateLevel(overallRate) === "medium"
              ? "warning"
              : "success"
          }
          sub="Failed ÷ total, per pair averaged by volume"
        />
      </div>

      {/* ==========================================
          FILTERS
      ========================================== */}

      <div className="filter-bar">
        <SelectInput
          value={senderBank}
          onChange={(e) => setSenderBank(e.target.value)}
        >
          <option value="">All Sender Banks</option>

          {(filterOptions?.senderBanks || []).map((bank) => (
            <option key={bank} value={bank}>
              {bank}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          value={receiverBank}
          onChange={(e) => setReceiverBank(e.target.value)}
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

        <TextInput
          type="date"
          value={dateFrom}
          min={filterOptions?.dateRange?.min}
          max={filterOptions?.dateRange?.max}
          onChange={(e) => setDateFrom(e.target.value)}
          title="From date"
        />

        <TextInput
          type="date"
          value={dateTo}
          min={filterOptions?.dateRange?.min}
          max={filterOptions?.dateRange?.max}
          onChange={(e) => setDateTo(e.target.value)}
          title="To date"
        />

        <SelectInput
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
        >
          {Object.entries(SORT_LABELS).map(
            ([value, label]) => (
              <option key={value} value={value}>
                Sort by {label}
              </option>
            )
          )}
        </SelectInput>

        <SelectInput
          value={sortDirection}
          onChange={(e) => setSortDirection(e.target.value)}
        >
          <option value="desc">Highest first</option>
          <option value="asc">Lowest first</option>
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
          AUTO-GENERATED INSIGHTS
      ========================================== */}

      <div className="insight-grid">
        <InsightCard
          icon={TrendingDown}
          title="Highest failure rate"
          pair={insights?.highestFailureRate}
          metric={`${Number(
            insights?.highestFailureRate?.failureRate || 0
          ).toFixed(2)}%`}
          detail={
            insights?.highestFailureRate
              ? `${Number(
                  insights.highestFailureRate.failedTransactions
                ).toLocaleString()} failures out of ${Number(
                  insights.highestFailureRate.totalTransactions
                ).toLocaleString()} transactions`
              : ""
          }
          accent="danger"
        />

        <InsightCard
          icon={TrendingUp}
          title="Lowest failure rate"
          pair={insights?.lowestFailureRate}
          metric={`${Number(
            insights?.lowestFailureRate?.failureRate || 0
          ).toFixed(2)}%`}
          detail={
            insights?.lowestFailureRate
              ? `${Number(
                  insights.lowestFailureRate.failedTransactions
                ).toLocaleString()} failures out of ${Number(
                  insights.lowestFailureRate.totalTransactions
                ).toLocaleString()} transactions`
              : ""
          }
          accent="success"
        />

        <InsightCard
          icon={Landmark}
          title="Most failures"
          pair={insights?.mostFailures}
          metric={Number(
            insights?.mostFailures?.failedTransactions || 0
          ).toLocaleString()}
          detail={
            insights?.mostFailures
              ? `${insights.mostFailures.failureRate}% failure rate across ${Number(
                  insights.mostFailures.totalTransactions
                ).toLocaleString()} transactions`
              : ""
          }
          accent="warning"
        />
      </div>

      {insights && insights.minVolumeForInsights > 0 && (
        <p className="muted small mb-24">
          Insights ignore pairs with fewer than{" "}
          {insights.minVolumeForInsights} transactions, because
          a route seen only a handful of times can show a 0% or
          100% failure rate without meaning anything.{" "}
          {insights.pairsConsidered} of{" "}
          {summary?.totalBankPairs} pairs were considered.
        </p>
      )}

      {/* ==========================================
          CHART
      ========================================== */}

      <Card
        title="Bank Pairs With The Highest Failure Rates"
        icon={ArrowUpDown}
        className="mb-24"
      >
        {chartData.length === 0 ? (
          <EmptyState
            title="No bank pairs to chart"
            message="Loosen the filters to see more routes."
          />
        ) : (
          <>
            <ResponsiveContainer
              width="100%"
              height={340}
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{
                  top: 8,
                  right: 28,
                  left: 12,
                  bottom: 8,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  horizontal={false}
                />

                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  unit="%"
                />

                <YAxis
                  type="category"
                  dataKey="name"
                  width={168}
                  tick={{ fontSize: 11 }}
                />

                <Tooltip
                  formatter={(value, name) =>
                    name === "failureRate"
                      ? [`${value}%`, "Failure rate"]
                      : [
                          Number(value).toLocaleString(),
                          name === "failedTransactions"
                            ? "Failures"
                            : "Transactions",
                        ]
                  }
                />

                <ReferenceLine
                  x={overallRate}
                  stroke="#4f46e5"
                  strokeDasharray="4 4"
                  label={{
                    value: `Overall ${overallRate}%`,
                    position: "top",
                    fontSize: 11,
                    fill: "#4f46e5",
                  }}
                />

                <Bar
                  dataKey="failureRate"
                  radius={[0, 6, 6, 0]}
                  barSize={18}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={
                        rateLevel(entry.failureRate) ===
                        "high"
                          ? "#ef4444"
                          : rateLevel(entry.failureRate) ===
                            "medium"
                            ? "#f59e0b"
                            : "#10b981"
                      }
                      fillOpacity={
                        index === 0 ? 1 : 0.82
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <p className="muted small mt-16">
              Top {chartData.length} routes by failure rate,
              limited to routes with at least 20 transactions.
              The dashed line is the overall failure rate of
              the current view.
            </p>
          </>
        )}
      </Card>

      {/* ==========================================
          TABLE
      ========================================== */}

      <Card
        title="Bank Pair Breakdown"
        icon={Network}
        actions={
          <Tag
            text={`${pairs.length} pairs`}
            tone="neutral"
          />
        }
      >
        {pairs.length === 0 ? (
          <EmptyState
            title="No bank pairs found"
            message="Try clearing the filters to see all sender and receiver combinations."
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
                    {Object.entries(
                      SORTABLE_COLUMNS
                    ).map(([key]) => (
                      <th
                        key={key}
                        className={`sortable ${
                          key === sortKey ? "active" : ""
                        }`}
                        onClick={() => toggleSort(key)}
                      >
                        <span className="th-sort">
                          {SORT_LABELS[key]}
                          {sortIndicator(key)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {visiblePairs.map((pair) => {
                    const level = rateLevel(
                      pair.failureRate
                    );

                    return (
                      <tr
                        key={`${pair.senderBank}-${pair.receiverBank}`}
                      >
                        <td style={{ fontWeight: 600 }}>
                          {pair.senderBank}
                        </td>

                        <td style={{ fontWeight: 600 }}>
                          {pair.receiverBank}
                        </td>

                        <td>
                          {Number(
                            pair.totalTransactions
                          ).toLocaleString()}
                        </td>

                        <td>
                          {Number(
                            pair.failedTransactions
                          ).toLocaleString()}
                        </td>

                        <td>
                          {Number(
                            pair.successfulTransactions
                          ).toLocaleString()}
                        </td>

                        <td>
                          <div className="rate-cell">
                            <div className="rate-track">
                              <div
                                className={`rate-fill level-${level}`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    pair.failureRate
                                  )}%`,
                                }}
                              />
                            </div>

                            <span className="rate-value">
                              {pair.failureRate.toFixed(2)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={safePage}
              totalPages={totalPages}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      {/* ==========================================
          METHOD NOTE
      ========================================== */}

      <Card className="mt-24">
        <div className="section-heading">
          <SearchX size={18} />
          How these numbers are produced
        </div>

        <p className="muted small">
          All figures are grouped by MySQL directly from the{" "}
          <code>upi_transactions</code> table. For each sender
          bank and receiver bank pair the backend counts all
          transactions, counts the ones whose{" "}
          <code>transaction_status</code> is{" "}
          <code>FAILED</code>, counts the ones marked{" "}
          <code>SUCCESS</code>, and then computes{" "}
          <strong>
            failureRate = (failedTransactions /
            totalTransactions) × 100
          </strong>
          . No value is hardcoded and the filters above are
          applied inside the SQL query, so the totals always
          match the rows listed above them.
        </p>

        {data?.generatedAt && (
          <p className="muted small mt-8">
            Generated at {new Date(
              data.generatedAt
            ).toLocaleString()}.
          </p>
        )}
      </Card>
    </DashboardLayout>
  );
}
