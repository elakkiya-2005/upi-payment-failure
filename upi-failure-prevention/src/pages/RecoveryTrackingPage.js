import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:5000";

function RecoveryTrackingPage() {
  const [analytics, setAnalytics] = useState(null);
  const [recoveryData, setRecoveryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);
  const [error, setError] = useState("");

  const fetchRecoveryData = async () => {
    try {
      setLoading(true);
      setError("");

      const [analyticsRes, recoveryRes] = await Promise.all([
        fetch(`${API_BASE}/api/recovery/analytics`),
        fetch(`${API_BASE}/api/recovery`),
      ]);

      if (!analyticsRes.ok || !recoveryRes.ok) {
        throw new Error("Failed to fetch recovery data");
      }

      const analyticsData = await analyticsRes.json();
      const recoveryResult = await recoveryRes.json();

      setAnalytics(analyticsData);

      if (Array.isArray(recoveryResult)) {
        setRecoveryData(recoveryResult);
      } else if (Array.isArray(recoveryResult.data)) {
        setRecoveryData(recoveryResult.data);
      } else {
        setRecoveryData([]);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load recovery data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecoveryData();
  }, []);

  const handleRetry = async (transactionId) => {
    try {
      setRetrying(transactionId);

      const response = await fetch(
        `${API_BASE}/api/recovery/${transactionId}/retry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Retry failed");
      }

      await fetchRecoveryData();
    } catch (err) {
      console.error(err);
      setError("Retry could not be initiated.");
    } finally {
      setRetrying(null);
    }
  };

  const formatAmount = (amount) => {
    const value = Number(amount || 0);

    return value.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getStatusInfo = (row) => {
    const status = String(row.recovery_status || "").toUpperCase();
    const retryCount = Number(row.retry_count || 0);

    if (status === "RECOVERED") {
      return {
        label: "Recovered",
        type: "success",
        symbol: "✓",
      };
    }

    if (status === "FAILED" || status === "STILL FAILED") {
      return {
        label: "Still Failed",
        type: "danger",
        symbol: "!",
      };
    }

    if (status === "PENDING" && retryCount > 0) {
      return {
        label: "Retry Pending",
        type: "warning",
        symbol: "◷",
      };
    }

    return {
      label: "Not Retried",
      type: "neutral",
      symbol: "○",
    };
  };

  if (loading) {
    return (
      <div className="recovery-page">
        <div className="recovery-loading">
          <div className="recovery-loading-icon">↻</div>
          <p>Loading recovery data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recovery-page">

      {/* HEADER */}
      <div className="recovery-header">
        <div>
          <h1>Recovery Tracking</h1>
          <p>
            Monitor failed transactions and track their recovery progress.
          </p>
        </div>

        <button
          className="recovery-refresh-btn"
          onClick={fetchRecoveryData}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <div className="recovery-error">
          ! {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="recovery-summary-grid">

        <div className="recovery-card">
          <div className="recovery-icon danger">
            !
          </div>

          <div className="recovery-number">
            {analytics?.totalFailed ?? 0}
          </div>

          <div className="recovery-card-title">
            Total Failed
          </div>

          <div className="recovery-card-subtitle">
            Failed transactions
          </div>
        </div>

        <div className="recovery-card">
          <div className="recovery-icon success">
            ✓
          </div>

          <div className="recovery-number">
            {analytics?.recovered ?? 0}
          </div>

          <div className="recovery-card-title">
            Recovered
          </div>

          <div className="recovery-card-subtitle">
            Successfully recovered
          </div>
        </div>

        <div className="recovery-card">
          <div className="recovery-icon orange">
            !
          </div>

          <div className="recovery-number">
            {analytics?.stillFailed ?? 0}
          </div>

          <div className="recovery-card-title">
            Still Failed
          </div>

          <div className="recovery-card-subtitle">
            Transactions still unsuccessful
          </div>
        </div>

        <div className="recovery-card">
          <div className="recovery-icon warning">
            ◷
          </div>

          <div className="recovery-number">
            {analytics?.pendingRetry ?? 0}
          </div>

          <div className="recovery-card-title">
            Pending Retry
          </div>

          <div className="recovery-card-subtitle">
            Waiting for retry
          </div>
        </div>

        <div className="recovery-card">
          <div className="recovery-icon info">
            %
          </div>

          <div className="recovery-number">
            {analytics?.recoveryRate ?? 0}%
          </div>

          <div className="recovery-card-title">
            Recovery Rate
          </div>

          <div className="recovery-card-subtitle">
            Overall recovery percentage
          </div>
        </div>

      </div>

      {/* TABLE */}
      <div className="recovery-table-card">

        <div className="recovery-table-header">
          <div>
            <h2>
              Recovery Status
            </h2>

            <p>
              Track retry attempts and recovery status.
            </p>
          </div>

          <span>
            {recoveryData.length} records
          </span>
        </div>

        <div className="recovery-table-wrapper">

          <table className="recovery-table">

            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Amount</th>
                <th>Failed At</th>
                <th>Bank</th>
                <th>Network</th>
                <th>Retry Count</th>
                <th>Status</th>
                <th>Recovered At</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              {recoveryData.length === 0 ? (
                <tr>
                  <td
                    colSpan="9"
                    className="recovery-empty"
                  >
                    No recovery records found.
                  </td>
                </tr>
              ) : (
                recoveryData.map((row) => {

                  const statusInfo = getStatusInfo(row);

                  const retryCount = Number(
                    row.retry_count || 0
                  );

                  const isRecovered =
                    String(
                      row.recovery_status || ""
                    ).toUpperCase() === "RECOVERED";

                  const isRetryPending =
                    String(
                      row.recovery_status || ""
                    ).toUpperCase() === "PENDING" &&
                    retryCount > 0;

                  return (
                    <tr key={row.transaction_id}>

                      <td className="transaction-id">
                        {row.transaction_id}
                      </td>

                      <td className="amount">
                        {formatAmount(row.amount)}
                      </td>

                      <td>
                        {formatDate(row.failed_at)}
                      </td>

                      <td>
                        {row.sender_bank || row.bank || "-"}
                      </td>

                      <td>
                        {row.network_type || "-"}
                      </td>

                      <td
                        className={
                          retryCount > 0
                            ? "retry-count active"
                            : "retry-count"
                        }
                      >
                        {retryCount}
                      </td>

                      <td>
                        <span
                          className={`recovery-status ${statusInfo.type}`}
                        >
                          <span className="status-symbol">
                            {statusInfo.symbol}
                          </span>

                          {statusInfo.label}
                        </span>
                      </td>

                      <td>
                        {row.recovered_at
                          ? formatDate(row.recovered_at)
                          : "-"}
                      </td>

                      <td>

                        {isRecovered ? (
                          <span className="completed-status">
                            ✓ Completed
                          </span>
                        ) : (
                          <button
                            className="retry-btn"
                            onClick={() =>
                              handleRetry(row.transaction_id)
                            }
                            disabled={
                              retrying === row.transaction_id
                            }
                          >
                            {retrying === row.transaction_id
                              ? "↻ Retrying..."
                              : isRetryPending
                              ? "↻ Retry Again"
                              : "↻ Retry"}
                          </button>
                        )}

                      </td>

                    </tr>
                  );
                })
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

export default RecoveryTrackingPage;