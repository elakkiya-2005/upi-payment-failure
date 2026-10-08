import { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { failureSpikes } from '../data/transactionsData';

export default function SpikeWarning() {
  const [dismissed, setDismissed] = useState([]);

  function dismissAlert(id) {
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function restoreAlert(id) {
    setDismissed((prev) => prev.filter((i) => i !== id));
  }

  const activeAlerts = failureSpikes.filter((s) => !dismissed.includes(s.id));
  const highCount = failureSpikes.filter((s) => s.severity === 'High' && !dismissed.includes(s.id)).length;

  return (
    <DashboardLayout title="Failure Spike Early Warning">
      <p className="page-intro">
        Our system continuously monitors failure patterns across payment apps, banks and networks.
        The moment a spike is detected, an alert is raised so that action can be taken early.
      </p>

      {highCount > 0 && (
        <div className="spike-banner">
          <span className="spike-banner-icon">🚨</span>
          <div>
            <h3>High Failure Spike Detected</h3>
            <p>
              {highCount} active high-severity {highCount === 1 ? 'alert' : 'alerts'}. Check the alerts below
              to take recommended actions.
            </p>
          </div>
        </div>
      )}

      {activeAlerts.length === 0 ? (
        <Card title="Active Alerts">
          <div className="empty-state">
            <span className="empty-state-icon">✅</span>
            <h3>No active alerts</h3>
            <p>All systems are running normally. No failure spikes detected right now.</p>
          </div>
        </Card>
      ) : (
        <div className="spike-grid">
          {activeAlerts.map((alert) => (
            <div key={alert.id} className={'spike-card spike-' + alert.severity.toLowerCase()}>
              <div className="spike-card-head">
                <div>
                  <span className="spike-badge">
                    <span className={'severity-dot severity-dot-' + alert.severity.toLowerCase()} />
                    {alert.severity} Severity
                  </span>
                  <h3>
                    High Failure Spike — {alert.affectedEntity}
                  </h3>
                  <p className="spike-type">Affected: {alert.entityType}</p>
                </div>
                <button className="spike-dismiss" onClick={() => dismissAlert(alert.id)} title="Dismiss alert">
                  ✕
                </button>
              </div>

              <div className="spike-metrics">
                <div className="spike-metric">
                  <p className="spike-metric-label">Current Failure Rate</p>
                  <p className="spike-metric-value spike-fail">{alert.currentFailureRate}</p>
                </div>
                <div className="spike-metric">
                  <p className="spike-metric-label">Normal Rate</p>
                  <p className="spike-metric-value">{alert.normalFailureRate}</p>
                </div>
                <div className="spike-metric">
                  <p className="spike-metric-label">Detection Time</p>
                  <p className="spike-metric-value spike-detect">{alert.detectedAt}</p>
                </div>
              </div>

              <div className="spike-section">
                <p className="spike-section-label">Time Period</p>
                <p className="spike-time-period">🕐 {alert.timePeriod}</p>
              </div>

              <div className="spike-section">
                <p className="spike-section-label">Recommended Action</p>
                <div className="spike-action">
                  <span>💡</span>
                  <p>{alert.recommendedAction}</p>
                </div>
              </div>

              <div className="spike-card-footer">
                <Button variant={alert.severity === 'High' ? 'danger' : 'outline'} size="sm">
                  Investigate
                </Button>
                <Button variant="ghost" size="sm" onClick={() => dismissAlert(alert.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dismissed.length > 0 && (
        <Card title="Recently Dismissed" subtitle="Restore alerts if needed">
          <ul className="dismissed-list">
            {failureSpikes
              .filter((s) => dismissed.includes(s.id))
              .map((alert) => (
                <li key={alert.id}>
                  <span>
                    {alert.affectedEntity} · {alert.timePeriod}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => restoreAlert(alert.id)}>
                    Restore
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </DashboardLayout>
  );
}