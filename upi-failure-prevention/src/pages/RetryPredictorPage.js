import { useEffect, useState } from "react";

import {
  Clock,
  Target,
  CheckCircle2,
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import { Tag } from "../components/StatusBadge";
import Pagination from "../components/Pagination";
import {
  formatCurrency,
  formatDateTime,
  formatTime,
} from "../utils/format";


// ==========================================
// ADD MINUTES
// ==========================================

function addMinutes(date, mins) {

  const d = new Date(date);

  d.setMinutes(
    d.getMinutes() + mins
  );

  return d;
}


// ==========================================
// FIND BEST RETRY WINDOW
// USING HISTORICAL HOURLY FAILURE RATE
// ==========================================

function suggestRetry(txn, hourlyData) {

  const failedDate =
    new Date(txn.timestamp);

  const failedHour =
    failedDate.getHours();


  if (!hourlyData || hourlyData.length === 0) {

    return {
      window: "Not available",
      reason: "Historical hourly data unavailable.",
      probability: "Medium",
    };
  }


  // ----------------------------------------
  // Look at next 6 hours
  // ----------------------------------------

  const candidates = [];


  for (let i = 1; i <= 6; i++) {

    const hour =
      (failedHour + i) % 24;


    const record =
      hourlyData.find(
        (item) =>
          Number(item.hour) === hour
      );


    if (record) {

      candidates.push({
        hour: hour,
        failureRate:
          Number(
            record.failureRate || 0
          ),
      });
    }
  }


  // ----------------------------------------
  // If no future hour available
  // ----------------------------------------

  if (candidates.length === 0) {

    return {
      window: "Not available",
      reason: "No historical hourly data available.",
      probability: "Medium",
    };
  }


  // ----------------------------------------
  // Find lowest failure rate
  // ----------------------------------------

  candidates.sort(
    (a, b) =>
      a.failureRate -
      b.failureRate
  );


  const best =
    candidates[0];


  // ----------------------------------------
  // Calculate time
  // ----------------------------------------

  let minutesUntil =
    (best.hour - failedHour + 24) % 24;


  if (minutesUntil === 0) {
    minutesUntil = 60;
  }


  const startTime =
    addMinutes(
      failedDate,
      minutesUntil * 60
    );


  const endTime =
    addMinutes(
      startTime,
      30
    );


  const window =
    `${formatTime(startTime)} – ${formatTime(endTime)}`;


  // ----------------------------------------
  // Historical success probability
  // ----------------------------------------

  const successProbability =
    Math.max(
      0,
      Math.min(
        100,
        100 - best.failureRate
      )
    );


  let probability;


  if (
    successProbability >= 95
  ) {

    probability = "High";

  } else if (
    successProbability >= 90
  ) {

    probability = "Medium";

  } else {

    probability = "Low";
  }


  return {

    window,

    reason:
      `Historical failure rate at ${best.hour}:00 is ${best.failureRate}%.`,

    probability,

    successRate:
      successProbability.toFixed(2),
  };
}


// ==========================================
// PROBABILITY TONE
// ==========================================

const probabilityTone = {

  High: "success",

  Medium: "warning",

  Low: "danger",

};


// ==========================================
// PAGE SIZE
// ==========================================

const PAGE_SIZE = 6;


// ==========================================
// MAIN PAGE
// ==========================================

export default function RetryPredictorPage({
  user,
}) {

  const [
    failed,
    setFailed,
  ] = useState([]);


  const [
    hourlyData,
    setHourlyData,
  ] = useState([]);


  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    page,
    setPage,
  ] = useState(1);


  // ==========================================
  // LOAD REAL DATA
  // ==========================================

  useEffect(() => {

    Promise.all([

      fetch(
        "http://localhost:5000/api/recovery"
      ).then((res) =>
        res.json()
      ),

      fetch(
        "http://localhost:5000/api/hourly-analysis"
      ).then((res) =>
        res.json()
      ),

    ])

      .then(
        ([failedData, hourlyData]) => {

          if (
            Array.isArray(
              failedData
            )
          ) {

            setFailed(
              failedData
            );
          }


          if (
            Array.isArray(
              hourlyData
            )
          ) {

            setHourlyData(
              hourlyData
            );
          }


          setLoading(false);
        }
      )

      .catch((error) => {

        console.error(
          "Retry Predictor Error:",
          error
        );

        setLoading(false);
      });

  }, []);


  // ==========================================
  // PAGINATION
  // ==========================================

  const totalPages =
    Math.ceil(
      failed.length /
      PAGE_SIZE
    );


  const start =
    (page - 1) *
    PAGE_SIZE;


  const list =
    failed.slice(
      start,
      start + PAGE_SIZE
    );


  return (

    <DashboardLayout
      user={user}
      title="Smart Retry Predictor"
    >

      <PageHeader

        subtitle="Historical transaction failure patterns are used to suggest a suitable retry window."
      />


      <Card

        title="Failed Transactions & Suggested Retry Windows"

        icon={Clock}

        actions={
          <Tag
            text={`${failed.length} failed`}
            tone="fail"
          />
        }
      >

        {loading ? (

          <p className="muted">
            Loading historical failure data...
          </p>

        ) : failed.length === 0 ? (

          <p className="muted">
            No failed transactions found.
          </p>

        ) : (

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

                  <th>
                    Transaction
                  </th>

                  <th>
                    Amount
                  </th>

                  <th>
                    Failed At
                  </th>

                  <th>
                    Transaction Type
                  </th>

                  <th>
                    Network
                  </th>

                  <th>
                    Historical Failure Rate
                  </th>

                  <th>
                    Suggested Retry Time
                  </th>

                  <th>
                    Success Probability
                  </th>

                </tr>

              </thead>


              <tbody>

                {list.map((t) => {

                  const prediction =
                    suggestRetry(
                      t,
                      hourlyData
                    );


                  return (

                    <tr
                      key={
                        t.transaction_id
                      }
                    >

                      <td className="mono">

                        {
                          t.transaction_id
                        }

                      </td>


                      <td
                        style={{
                          fontWeight: 600,
                        }}
                      >

                        {formatCurrency(
                          t.amount
                        )}

                      </td>


                      <td>

                        {formatDateTime(
                          new Date(
                            t.timestamp
                          )
                        )}

                      </td>


                      <td>

                        {
                          t.transaction_type
                        }

                      </td>


                      <td>

                        {
                          t.network_type
                        }

                      </td>


                      <td>

                        {prediction.successRate
                          ? `${(
                              100 -
                              Number(
                                prediction.successRate
                              )
                            ).toFixed(2)}%`
                          : "—"}

                      </td>


                      <td>

                        <span
                          className="chip"
                          style={{
                            background:
                              "var(--info-light)",
                            color:
                              "#1d4ed8",
                          }}
                        >

                          <Clock
                            size={14}
                          />

                          {
                            prediction.window
                          }

                        </span>

                      </td>


                      <td>

                        <Tag

                          text={
                            prediction.successRate
                              ? `${prediction.successRate}%`
                              : prediction.probability
                          }

                          tone={
                            probabilityTone[
                              prediction.probability
                            ]
                          }

                        />

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

        )}


        {!loading &&
          failed.length > 0 && (

            <Pagination

              page={page}

              totalPages={
                totalPages
              }

              onChange={
                setPage
              }

            />

          )}

      </Card>


      <div
        className="grid grid-cards mt-24"
      >

        <Card
          title="Why trust the suggested time?"
          icon={Target}
        >

          <p
            className="muted"
            style={{
              fontSize: "0.9rem",
            }}
          >

            The predictor analyzes
            historical failure rates
            by hour and recommends
            a future time window with
            lower observed failure rates.

          </p>

        </Card>


        <Card
          title="How to retry safely"
          icon={CheckCircle2}
        >

          <ul
            style={{
              paddingLeft: 20,
              fontSize: "0.9rem",
              display: "grid",
              gap: 8,
            }}
          >

            <li>
              Use a stable 4G, 5G
              or Wi-Fi network.
            </li>

            <li>
              Verify the UPI PIN
              before retrying.
            </li>

            <li>
              Check whether the
              amount was already debited.
            </li>

            <li>
              Verify the receiver
              details before confirming.
            </li>

          </ul>

        </Card>

      </div>

    </DashboardLayout>
  );
}