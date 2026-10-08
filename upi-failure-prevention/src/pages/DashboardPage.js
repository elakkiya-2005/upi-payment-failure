import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Wallet,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  RefreshCcw,
  TrendingUp,
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import StatusBadge, { RiskBadge } from "../components/StatusBadge";
import Button from "../components/Button";
import { LoadingState } from "../components/States";
import { formatCurrency } from "../utils/format";

export default function DashboardPage({ user }) {

  const [analytics, setAnalytics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recoveryRate, setRecoveryRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const fetchDashboardData = async () => {

      try {

        // Get analytics from backend
        const analyticsResponse = await fetch(
          "http://localhost:5000/api/analytics"
        );

        const analyticsData = await analyticsResponse.json();

        setAnalytics(analyticsData);


        // Get transactions from backend
        const transactionResponse = await fetch(
          "http://localhost:5000/api/transactions"
        );

        const transactionData = await transactionResponse.json();

        // Show only first 8 transactions
        setRecent(transactionData.slice(0, 8));

        // Get real recovery analytics
        const recoveryResponse = await fetch(
          "http://localhost:5000/api/recovery/analytics"
        );

        if (recoveryResponse.ok) {
          const recoveryData = await recoveryResponse.json();
          setRecoveryRate(Number(recoveryData.recoveryRate || 0));
        }

      } catch (error) {

        console.error("Dashboard API Error:", error);

      } finally {

        setLoading(false);

      }

    };

    fetchDashboardData();

  }, []);


  // Loading screen
  if (loading) {

    return (
      <DashboardLayout user={user} title="Dashboard">
        <LoadingState label="Loading real transaction data..." />
      </DashboardLayout>
    );

  }


  // Calculate risk level
  const failureRate = Number(analytics?.failureRate || 0);

  let riskLevel = "LOW";
  let riskKey = "low";

  if (failureRate > 10) {
    riskLevel = "HIGH";
    riskKey = "high";
  } else if (failureRate > 5) {
    riskLevel = "MEDIUM";
    riskKey = "medium";
  }


  return (

    <DashboardLayout user={user} title="Dashboard">

      <PageHeader
        subtitle="Here is a quick overview of your UPI transaction health."

        actions={
          <Link to="/risk-check">
            <Button icon={ArrowRight}>
              Check New Transaction
            </Button>
          </Link>
        }
      />


      {/* REAL MYSQL STATISTICS */}

      <div className="grid grid-stat mb-24">

        <StatCard
          label="Total Transactions"
          value={Number(analytics?.totalTransactions || 0).toLocaleString()}
          icon={Wallet}
          color="primary"
          sub="From MySQL database"
        />


        <StatCard
          label="Successful"
          value={Number(
            analytics?.successfulTransactions || 0
          ).toLocaleString()}
          icon={CheckCircle2}
          color="success"
          sub={`${analytics?.successRate || 0}% success rate`}
        />


        <StatCard
          label="Failed"
          value={Number(
            analytics?.failedTransactions || 0
          ).toLocaleString()}
          icon={XCircle}
          color="danger"
          sub={`${analytics?.failureRate || 0}% failure rate`}
        />


        <StatCard
          label="Current Risk Level"
          value={riskLevel}
          icon={ShieldAlert}
          color={
            riskKey === "high"
              ? "danger"
              : riskKey === "medium"
              ? "warning"
              : "success"
          }
          sub="Based on failure rate"
        />


        <StatCard
          label="Recovery Rate"
          value={`${recoveryRate}%`}
          icon={RefreshCcw}
          color="info"
          sub="Failed → recovered"
        />

      </div>


      {/* RECENT REAL TRANSACTIONS */}

      <Card
        title="Recent Transactions"
        icon={TrendingUp}

        actions={
          <Link
            to="/history"
            className="btn btn-ghost"
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            View all →
          </Link>
        }
      >

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
                <th>Date & Time</th>
                <th>Network</th>
                <th>Risk Level</th>
                <th>Status</th>
              </tr>

            </thead>


            <tbody>

              {recent.map((t) => {

                const risk =
                  t.fraud_flag === 1
                    ? "high"
                    : t.transaction_status === "FAILED"
                    ? "medium"
                    : "low";

                return (

                  <tr key={t.transaction_id}>

                    <td className="mono">
                      {t.transaction_id}
                    </td>


                    <td style={{ fontWeight: 600 }}>
                      {formatCurrency(t.amount)}
                    </td>


                    <td>
                      {t.timestamp}
                    </td>


                    <td>
                      {t.network_type}
                    </td>


                    <td>
                      <RiskBadge level={risk} />
                    </td>


                    <td>
                      <StatusBadge
                        status={
                          t.transaction_status === "SUCCESS"
                            ? "success"
                            : "failed"
                        }
                      />
                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      </Card>

    </DashboardLayout>

  );

}