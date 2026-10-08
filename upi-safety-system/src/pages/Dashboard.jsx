import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import DashboardLayout from "../components/layout/DashboardLayout";
import StatCard from "../components/common/StatCard";
import Card from "../components/common/Card";
import TransactionTable from "../components/txn/TransactionTable";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import EmptyState from "../components/common/EmptyState";

import { formatCurrency } from "../utils/format";


export default function Dashboard() {

  const [loading, setLoading] = useState(true);

  const [analytics, setAnalytics] = useState(null);

  const [transactions, setTransactions] = useState([]);


  // ==========================================
  // FETCH REAL DATA FROM BACKEND
  // ==========================================

  async function fetchDashboardData() {

    setLoading(true);

    try {

      // GET ANALYTICS

      const analyticsResponse = await fetch(
        "http://localhost:5000/api/analytics"
      );

      const analyticsData =
        await analyticsResponse.json();

      setAnalytics(analyticsData);


      // GET TRANSACTIONS

      const transactionResponse = await fetch(
        "http://localhost:5000/api/transactions"
      );

      const transactionData =
        await transactionResponse.json();


      // Convert MySQL data to frontend format

      const formattedTransactions =
        transactionData.map((t) => ({

          id: t.transaction_id,

          transactionId:
            t.transaction_id,

          amount:
            Number(t.amount),

          dateTime:
            t.timestamp,

          bank:
            t.sender_bank,

          networkType:
            t.network_type,

          paymentApp:
            t.payment_app,

          status:
            t.transaction_status === "SUCCESS"
              ? "Success"
              : "Failed",

          riskLevel:

            t.fraud_flag === 1
              ? "High"
              : t.transaction_status === "FAILED"
              ? "Medium"
              : "Low",

        }));


      setTransactions(
        formattedTransactions
      );


    } catch (error) {

      console.error(
        "Dashboard API Error:",
        error
      );

      alert(
        "Unable to load dashboard data. Make sure backend is running."
      );

    } finally {

      setLoading(false);

    }

  }


  // ==========================================
  // LOAD DATA WHEN PAGE OPENS
  // ==========================================

  useEffect(() => {

    fetchDashboardData();

  }, []);


  // ==========================================
  // REFRESH BUTTON
  // ==========================================

  function handleRefresh() {

    fetchDashboardData();

  }


  // ==========================================
  // CALCULATE RISK LEVEL
  // ==========================================

  const failureRate =
    Number(
      analytics?.failureRate || 0
    );


  let currentRisk = "Low";


  if (failureRate >= 10) {

    currentRisk = "High";

  }

  else if (failureRate >= 5) {

    currentRisk = "Medium";

  }


  // ==========================================
  // RECENT TRANSACTIONS
  // ==========================================

  const recent =
    transactions.slice(0, 6);


  // ==========================================
  // VALUES FROM MYSQL
  // ==========================================

  const total =
    Number(
      analytics?.totalTransactions || 0
    );


  const successful =
    Number(
      analytics?.successfulTransactions || 0
    );


  const failed =
    Number(
      analytics?.failedTransactions || 0
    );


  const successRate =
    Number(
      analytics?.successRate || 0
    );


  const failureRateValue =
    Number(
      analytics?.failureRate || 0
    );


  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {

    return (

      <DashboardLayout title="User Dashboard">

        <Loader
          text="Loading real transaction data..."
          rows={5}
        />

      </DashboardLayout>

    );

  }


  // ==========================================
  // DASHBOARD UI
  // ==========================================

  return (

    <DashboardLayout title="User Dashboard">


      {/* ===============================
          STATISTICS
      =============================== */}

      <div className="stat-grid">


        <StatCard
          icon="💳"
          label="Total Transactions"
          value={total.toLocaleString()}
          sub="From MySQL database"
          tone="primary"
        />


        <StatCard
          icon="✅"
          label="Successful Transactions"
          value={successful.toLocaleString()}
          sub={`${successRate}% success rate`}
          tone="success"
        />


        <StatCard
          icon="❌"
          label="Failed Transactions"
          value={failed.toLocaleString()}
          sub={`${failureRateValue}% failure rate`}
          tone="danger"
        />


        <StatCard
          icon="📈"
          label="Current Risk Level"
          value={
            <Badge
              label={currentRisk}
            />
          }
          sub="Based on real failure rate"
          tone={
            currentRisk === "High"
              ? "danger"
              : currentRisk === "Medium"
              ? "warning"
              : "success"
          }
        />


        <StatCard
          icon="🔄"
          label="Recovery Rate"
          value="78%"
          sub="Failed → recovered"
          tone="success"
        />


      </div>



      {/* ===============================
          RECENT TRANSACTIONS
      =============================== */}

      <div className="dash-grid">


        <Card

          title="Recent Transactions"

          subtitle="Latest transactions from MySQL database"

          className="dash-span-2"

          actions={

            <div className="card-actions-inline">


              <Button

                variant="ghost"

                size="sm"

                onClick={handleRefresh}

              >

                ⟳ Refresh

              </Button>


              <Link to="/history">

                <Button

                  variant="outline"

                  size="sm"

                >

                  View All

                </Button>

              </Link>


            </div>

          }

        >


          <TransactionTable

            data={recent}

            empty={

              <EmptyState

                icon="💳"

                title="No transactions found"

                message="Transaction data will appear here."

              />

            }

          />


        </Card>



        {/* ===============================
            QUICK ACTIONS
        =============================== */}

        <Card

          title="Quick Actions"

          subtitle="Common tasks"

        >


          <div className="quick-actions">


            <Link to="/risk-check">

              <Button

                variant="primary"

                className="w-100"

              >

                🛡️ Check New Transaction

              </Button>

            </Link>



            <Link to="/retry-predictor">

              <Button

                variant="outline"

                className="w-100"

              >

                ⏰ Predict Retry Time

              </Button>

            </Link>



            <Link to="/recovery">

              <Button

                variant="outline"

                className="w-100"

              >

                🔄 Track Recovery

              </Button>

            </Link>



            <Link to="/spike-warning">

              <Button

                variant="outline"

                className="w-100"

              >

                🚨 Spike Alerts

              </Button>

            </Link>


          </div>


        </Card>


      </div>



      {/* ===============================
          TRANSACTION SUMMARY
      =============================== */}

      <Card

        title="Transaction Summary"

        subtitle="Performance across all real transactions"

      >


        <div className="summary-row">


          <div className="summary-item">

            <span className="summary-dot dot-success" />


            <div>

              <p className="summary-value">

                {successful.toLocaleString()}

              </p>


              <p className="summary-label">

                Successful Transactions

              </p>


            </div>

          </div>



          <div className="summary-item">

            <span className="summary-dot dot-danger" />


            <div>

              <p className="summary-value">

                {failed.toLocaleString()} failed

              </p>


              <p className="summary-label">

                Needs Attention

              </p>


            </div>

          </div>



          <div className="summary-item">

            <span className="summary-dot dot-warning" />


            <div>

              <p className="summary-value">

                {failureRateValue}%

              </p>


              <p className="summary-label">

                Overall Failure Rate

              </p>


            </div>

          </div>


        </div>


      </Card>


    </DashboardLayout>

  );

}