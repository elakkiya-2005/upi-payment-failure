import { useEffect, useState } from "react";

import {
  AlertTriangle,
  Smartphone,
  Clock,
  Activity,
  Waves,
  Wifi,
  CreditCard,
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import { Tag } from "../components/StatusBadge";

const severityTone = {
  high: "fail",
  medium: "medium",
  low: "low",
};

function subsystemIcon(al) {
  if (al.type === "Payment App") return Smartphone;
  if (al.type === "Bank") return Waves;
  if (al.type === "Network Type") return Wifi;
  if (al.type === "Transaction Type") return CreditCard;

  return Activity;
}

export default function SpikeWarningPage({ user }) {
  const [spikeAlerts, setSpikeAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch spike warning data from backend
  useEffect(() => {
    fetch("http://localhost:5000/api/spike-warnings")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch spike warnings");
        }

        return response.json();
      })
      .then((data) => {
        setSpikeAlerts(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Spike warning error:", err);
        setError("Unable to load spike warning data.");
        setLoading(false);
      });
  }, []);

  const active = spikeAlerts.filter(
    (s) => s.status === "active"
  );

  const resolved = spikeAlerts.filter(
    (s) => s.status !== "active"
  );

  return (
    <DashboardLayout
      user={user}
      title="Failure Spike Early Warning"
    >
      <PageHeader
        subtitle="Real-time alerts when failure rates suddenly rise above normal for a bank, app or network."
        actions={
          <Tag
            text={`${active.length} active · ${resolved.length} resolved`}
            tone="info"
          />
        }
      />

      {/* Loading */}
      {loading && (
        <Card className="mb-24">
          <div className="alert">
            <Activity size={22} />
            <div>
              <div className="alert-title">
                Loading Spike Warnings...
              </div>
              <p>
                Fetching failure analysis from the backend.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {!loading && error && (
        <Card className="mb-24">
          <div className="alert alert-danger">
            <AlertTriangle size={22} />
            <div>
              <div className="alert-title">
                Unable to Load Spike Warnings
              </div>

              <p>{error}</p>

              <p>
                Make sure the backend is running on port 5000.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Active warning */}
      {!loading && !error && active.length > 0 && (
        <Card className="mb-24">
          <div className="alert alert-danger">
            <AlertTriangle size={22} />

            <div>
              <div className="alert-title">
                High Failure Spike Detected
              </div>

              <p>
                Failure rates have risen above the normal
                baseline. Check the alerts below before making
                a payment.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* No warnings */}
      {!loading &&
        !error &&
        spikeAlerts.length === 0 && (
          <Card className="mb-24">
            <div className="alert">
              <Activity size={22} />

              <div>
                <div className="alert-title">
                  No Spike Warnings
                </div>

                <p>
                  No significant failure-rate spikes were
                  detected in the current dataset.
                </p>
              </div>
            </div>
          </Card>
        )}

      {/* Alert list */}
      {!loading && !error && spikeAlerts.length > 0 && (
        <div>
          {spikeAlerts.map((al, index) => {
            const Icon = subsystemIcon(al);

            return (
              <div
                className={`spike-card severity-${al.severity}`}
                key={al.id || index}
              >
                {/* Header */}
                <div className="spike-head">
                  <div className="spike-title">
                    <AlertTriangle size={20} />

                    {al.title}
                  </div>

                  <Tag
                    text={
                      al.status === "active"
                        ? "Active"
                        : "Resolved"
                    }
                    tone={
                      al.status === "active"
                        ? "fail"
                        : "neutral"
                    }
                  />
                </div>

                {/* Meta information */}
                <div className="spike-meta">
                  <span className="meta-tag">
                    <Icon size={15} />

                    {al.type}: {al.subsystem}
                  </span>

                  <span className="meta-tag">
                    <Clock size={15} />

                    {al.period}
                  </span>

                  <span className="meta-tag">
                    <Activity size={15} />

                    {al.affectedTransactions} affected
                  </span>

                  <Tag
                    text={`${al.severity} severity`}
                    tone={
                      severityTone[al.severity] || "neutral"
                    }
                  />
                </div>

                {/* Failure rate comparison */}
                <div className="rate-compare">
                  <div className="rate-box normal">
                    <strong>
                      {al.baselineRate}%
                    </strong>

                    <span>
                      Normal failure rate
                    </span>
                  </div>

                  <span
                    className="muted"
                    style={{
                      fontSize: "1.2rem",
                    }}
                  >
                    →
                  </span>

                  <div className="rate-box danger">
                    <strong>
                      {al.failureRate}%
                    </strong>

                    <span>
                      Current failure rate
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  className="progress-bar"
                  style={{
                    maxWidth: 380,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        Number(al.failureRate) * 2
                      )}%`,

                      background:
                        al.severity === "high"
                          ? "var(--danger)"
                          : al.severity === "medium"
                          ? "var(--warning)"
                          : "var(--info)",
                    }}
                  />
                </div>

                {/* Recommended action */}
                <h5 className="mt-16 mb-8">
                  Recommended Action
                </h5>

                <p
                  className="muted"
                  style={{
                    fontSize: "0.9rem",
                  }}
                >
                  {al.recommendedAction}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}