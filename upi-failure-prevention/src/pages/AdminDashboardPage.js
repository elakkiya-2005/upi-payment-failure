import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Users,
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  RefreshCcw,
  PieChart as PieIcon,
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
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import { useAdminAuth } from "../context/AdminAuthContext";

import { users } from "../data/users";

const COLORS = {
  success: "#10b981",
  failed: "#ef4444",
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
  grid: "#e2e8f0",
};

// ==============================
// LEGEND
// ==============================

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
            style={{
              background: entry.color,
            }}
          />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

// ==============================
// ADMIN DASHBOARD
// ==============================

export default function AdminDashboardPage({ user }) {

  const navigate = useNavigate();
  const { logout } = useAdminAuth();

  const handleAdminLogout = () => {
    logout();
    navigate("/admin/login");
  };

  // ==============================
  // REAL ANALYTICS DATA
  // ==============================

  const [analytics, setAnalytics] = useState({
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    successRate: 0,
    failureRate: 0,
    highRiskTransactions: 0,
  });

  const [bankAnalysis, setBankAnalysis] = useState([]);
  const [networkAnalysis, setNetworkAnalysis] = useState([]);
  const [hourlyAnalysis, setHourlyAnalysis] = useState([]);
  const [recoveryRate, setRecoveryRate] = useState(0);

  // ==============================
  // HIGH RISK
  // ==============================

  const highRisk = Number(
    analytics.highRiskTransactions || 0
  );

  // ==============================
  // FETCH REAL BACKEND DATA
  // ==============================

  useEffect(() => {

    Promise.all([

      // Overall analytics
      fetch("http://localhost:5000/api/analytics").then(
        (res) => res.json()
      ),

      // Bank analysis
      fetch("http://localhost:5000/api/bank-analysis").then(
        (res) => res.json()
      ),

      // Network analysis
      fetch("http://localhost:5000/api/network-analysis").then(
        (res) => res.json()
      ),

      // Hourly analysis
      fetch("http://localhost:5000/api/hourly-analysis").then(
        (res) => res.json()
      ),

      // Recovery analytics
      fetch("http://localhost:5000/api/recovery/analytics").then(
        (res) => res.json()
      ),

    ])
      .then(
        ([
          analyticsData,
          bank,
          network,
          hourly,
          recovery,
        ]) => {

          setAnalytics(analyticsData);

          setBankAnalysis(bank);

          setNetworkAnalysis(network);

          setHourlyAnalysis(hourly);

          setRecoveryRate(
            Number(recovery.recoveryRate || 0)
          );

        }
      )
      .catch((error) => {

        console.error(
          "Analytics fetch error:",
          error
        );

      });

  }, []);

  // ==============================
  // REAL ANALYTICS VALUES
  // ==============================

  const totalTxn = Number(
    analytics.totalTransactions || 0
  );

  const successCount = Number(
    analytics.successfulTransactions || 0
  );

  const failedCount = Number(
    analytics.failedTransactions || 0
  );

  const successRate = Number(
    analytics.successRate || 0
  );

  const failureRate = Number(
    analytics.failureRate || 0
  );

  // ==============================
  // REAL BACKEND CHART DATA
  // ==============================

  const failureByBank = bankAnalysis.map((row) => ({
    name: row.bank,
    value: Number(row.failedTransactions),
  }));

  const failureByNetwork = networkAnalysis.map((row) => ({
    name: row.network,
    value: Number(row.failedTransactions),
  }));

  const failureByTime = hourlyAnalysis.map((row) => ({
    name: `${row.hour}:00`,
    value: Number(row.failedTransactions),
  }));

  // ==============================
  // UI
  // ==============================

  return (
    <DashboardLayout
      user={user}
      title="Admin Dashboard"
      onLogout={handleAdminLogout}
      adminView
    >

      <PageHeader
        subtitle="System-wide transaction health, failure analytics and risk distribution."
      />

      {/* ==============================
          ADMIN STAT CARDS
      ============================== */}

      <div className="grid grid-stat mb-24">

        {/* TOTAL USERS */}

        <StatCard
          label="Total Users"
          value={users.length}
          icon={Users}
          color="primary"
          sub="Registered users"
        />

        {/* TOTAL TRANSACTIONS */}

        <StatCard
          label="Total Transactions"
          value={totalTxn}
          icon={Wallet}
          color="info"
          sub="All time"
        />

        {/* SUCCESS RATE */}

        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          icon={TrendingUp}
          color="success"
          sub={`${successCount} successful`}
        />

        {/* FAILURE RATE */}

        <StatCard
          label="Failure Rate"
          value={`${failureRate}%`}
          icon={TrendingDown}
          color="danger"
          sub={`${failedCount} failed`}
        />

        {/* HIGH RISK */}

        <StatCard
          label="High-Risk Transactions"
          value={highRisk}
          icon={ShieldAlert}
          color="warning"
          sub="Flagged by engine"
        />

        {/* RECOVERY RATE */}

        <StatCard
          label="Recovery Rate"
          value={`${recoveryRate}%`}
          icon={RefreshCcw}
          color="info"
          sub="Failed → recovered"
        />

      </div>

      {/* ==============================
          SUCCESS VS FAILURE
      ============================== */}

      <div className="grid-two mb-24">

        <Card
          title="Success vs Failure"
          icon={TrendingUp}
        >

          <ResponsiveContainer
            width="100%"
            height={260}
          >

            <PieChart>

              <Pie
                data={[
                  {
                    name: "Successful",
                    value: successCount,
                  },
                  {
                    name: "Failed",
                    value: failedCount,
                  },
                ]}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
              >

                <Cell fill={COLORS.success} />

                <Cell fill={COLORS.failed} />

              </Pie>

              <Tooltip />

              <Legend
                content={renderLegend}
              />

            </PieChart>

          </ResponsiveContainer>

        </Card>

        {/* ==============================
            RISK DISTRIBUTION
        ============================== */}

        <Card
          title="Risk Level Distribution"
          icon={PieIcon}
        >

          <ResponsiveContainer
            width="100%"
            height={260}
          >

            <PieChart>

              <Pie
                data={[
                  {
                    name: "Low Risk",
                    value: Math.max(
                      totalTxn - highRisk,
                      0
                    ),
                  },
                  {
                    name: "High Risk",
                    value: highRisk,
                  },
                ]}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
              >

                <Cell fill={COLORS.low} />

                <Cell fill={COLORS.high} />

              </Pie>

              <Tooltip />

              <Legend
                content={renderLegend}
              />

            </PieChart>

          </ResponsiveContainer>

        </Card>

      </div>

      {/* ==============================
          FAILURE BY BANK
      ============================== */}

      <div className="grid-two mb-24">

        <Card
          title="Failure by Bank"
          icon={TrendingDown}
        >

          <ResponsiveContainer
            width="100%"
            height={260}
          >

            <BarChart data={failureByBank}>

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
              />

              <Tooltip />

              <Bar
                dataKey="value"
                name="Failed TXNs"
                fill={COLORS.failed}
                radius={[6, 6, 0, 0]}
              />

            </BarChart>

          </ResponsiveContainer>

        </Card>

        {/* ==============================
            FAILURE BY NETWORK
        ============================== */}

        <Card
          title="Failure by Network Type"
          icon={TrendingDown}
        >

          <ResponsiveContainer
            width="100%"
            height={260}
          >

            <BarChart data={failureByNetwork}>

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
              />

              <Tooltip />

              <Bar
                dataKey="value"
                name="Failures"
                fill={COLORS.failed}
                radius={[6, 6, 0, 0]}
              />

            </BarChart>

          </ResponsiveContainer>

        </Card>

      </div>

      {/* ==============================
          FAILURE BY TIME
      ============================== */}

      <Card
        title="Failure by Time of Day"
        icon={TrendingDown}
      >

        <ResponsiveContainer
          width="100%"
          height={280}
        >

          <BarChart data={failureByTime}>

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
            />

            <Tooltip />

            <Bar
              dataKey="value"
              name="Failures"
              fill={COLORS.medium}
              radius={[6, 6, 0, 0]}
            />

          </BarChart>

        </ResponsiveContainer>

        <p
          className="muted small"
          style={{ marginTop: 12 }}
        >
          Shows the number of failed transactions
          for each hour based on the transaction data.
        </p>

      </Card>

    </DashboardLayout>
  );
}