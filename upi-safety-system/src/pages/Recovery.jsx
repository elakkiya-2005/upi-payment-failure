import { useState, useEffect } from "react";

import DashboardLayout from "../components/layout/DashboardLayout";
import Card from "../components/common/Card";
import StatCard from "../components/common/StatCard";
import Badge from "../components/common/Badge";
import EmptyState from "../components/common/EmptyState";
import Loader from "../components/common/Loader";

import {
  formatCurrency,
  formatDate,
} from "../utils/format";


export default function Recovery() {

  const [loading, setLoading] =
    useState(true);


  const [recoveryData, setRecoveryData] =
    useState([]);


  const [statistics, setStatistics] =
    useState({

      totalFailed: 0,

      recoveredCount: 0,

      pendingCount: 0,

      recoveryRate: 0,

    });


  // ==========================================
  // FETCH REAL RECOVERY DATA
  // ==========================================

  async function fetchRecoveryData() {

    setLoading(true);


    try {

      const response =
        await fetch(
          "http://localhost:5000/api/recovery"
        );


      const data =
        await response.json();


      setRecoveryData(
        data.transactions || []
      );


      setStatistics(
        data.statistics || {

          totalFailed: 0,

          recoveredCount: 0,

          pendingCount: 0,

          recoveryRate: 0,

        }
      );


    } catch (error) {

      console.error(
        "Recovery API Error:",
        error
      );


      alert(
        "Unable to load recovery data. Make sure backend is running."
      );

    } finally {

      setLoading(false);

    }

  }


  // ==========================================
  // LOAD DATA
  // ==========================================

  useEffect(() => {

    fetchRecoveryData();

  }, []);


  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {

    return (

      <DashboardLayout
        title="Recovery Tracking"
      >

        <Loader
          text="Loading real failed transactions..."
          rows={5}
        />

      </DashboardLayout>

    );

  }


  return (

    <DashboardLayout
      title="Recovery Tracking"
    >


      {/* =====================================
          STATISTICS
      ===================================== */}

      <div className="stat-grid">


        <StatCard

          icon="❌"

          label="Failed Transactions"

          value={
            statistics.totalFailed
          }

          sub="Real failed transactions"

          tone="danger"

        />


        <StatCard

          icon="✅"

          label="Recovered Transactions"

          value={
            statistics.recoveredCount
          }

          sub="Recovery prediction"

          tone="success"

        />


        <StatCard

          icon="⏳"

          label="Pending Recovery"

          value={
            statistics.pendingCount
          }

          sub="Awaiting retry"

          tone="warning"

        />


        <StatCard

          icon="📈"

          label="Recovery Rate"

          value={
            statistics.recoveryRate + "%"
          }

          sub="Failed → recovered ratio"

          tone="success"

        />


      </div>



      {/* =====================================
          FAILED TRANSACTIONS TABLE
      ===================================== */}

      <Card

        title="Failed Transactions & Retry Information"

        subtitle="Real failed transactions from MySQL database"

      >


        {recoveryData.length === 0 ? (

          <EmptyState

            icon="🔄"

            title="No failed transactions"

            message="All transactions are currently successful."

          />

        ) : (

          <div className="table-wrapper">


            <table className="data-table">


              <thead>

                <tr>

                  <th>
                    Transaction
                  </th>

                  <th>
                    Amount
                  </th>

                  <th>
                    Original Date
                  </th>

                  <th>
                    Failure Status
                  </th>

                  <th>
                    Retry Status
                  </th>

                  <th>
                    Suggested Retry Time
                  </th>

                  <th>
                    Recovery Status
                  </th>

                </tr>

              </thead>



              <tbody>


                {recoveryData.map(
                  (txn) => (

                    <tr
                      key={txn.id}
                    >


                      <td>

                        {txn.id}

                      </td>


                      <td
                        className="cell-strong"
                      >

                        {
                          formatCurrency(
                            txn.amount
                          )
                        }

                      </td>


                      <td>

                        {
                          formatDate(
                            txn.originalDate
                          )
                        }

                      </td>


                      <td>

                        <Badge
                          label="Failed"
                        />

                      </td>


                      <td>

                        <Badge
                          label={
                            txn.retryStatus
                          }
                        />

                      </td>


                      <td>

                        {
                          txn.suggestedRetryTime
                        }

                      </td>


                      <td>

                        <Badge
                          label={
                            txn.recoveryStatus
                          }
                        />

                      </td>


                    </tr>

                  )
                )}


              </tbody>


            </table>


          </div>

        )}


      </Card>



      {/* =====================================
          RECOVERY TIMELINE
      ===================================== */}

      <Card

        title="Recovery Timeline"

        subtitle="Recovery prediction for recent failures"

      >


        <ul
          className="timeline"
        >


          {recoveryData
            .slice(0, 4)
            .map(
              (txn) => (

                <li

                  key={txn.id}

                  className="timeline-item"

                >


                  <div

                    className={

                      "timeline-dot dot-" +

                      (

                        txn.recoveryStatus ===
                        "Recovered"

                          ? "success"

                          : "warning"

                      )

                    }

                  />


                  <div
                    className="timeline-content"
                  >


                    <div
                      className="timeline-head"
                    >


                      <strong
                        className="cell-mono"
                      >

                        {txn.id}

                      </strong>


                      <span
                        className="timeline-amount"
                      >

                        {
                          formatCurrency(
                            txn.amount
                          )
                        }

                      </span>


                    </div>



                    <div
                      className="timeline-body"
                    >


                      <span>

                        ❌ Failed —

                        {" "}

                        <strong>

                          {
                            txn.failureReason
                          }

                        </strong>

                      </span>


                      <span
                        className="timeline-arrow"
                      >

                        →

                      </span>


                      <span>

                        ⏰ Best retry:

                        {" "}

                        <strong>

                          {
                            txn.suggestedRetryTime
                          }

                        </strong>

                        {" "}

                        (

                        {
                          txn.successProbability
                        }

                        probability)

                      </span>


                    </div>


                  </div>


                </li>

              )
            )}


        </ul>


      </Card>


    </DashboardLayout>

  );

}