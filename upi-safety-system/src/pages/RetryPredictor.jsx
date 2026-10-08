import { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import EmptyState from '../components/common/EmptyState';
import { failedTransactions } from '../data/transactionsData';
import { formatCurrency, formatDate } from '../utils/format';

const PROBABILITY_STYLE = {
  High: 'probability-high',
  Medium: 'probability-medium',
  Low: 'probability-low',
};

export default function RetryPredictor() {
  const [selected, setSelected] = useState(failedTransactions[0]);
  const [loading, setLoading] = useState(false);

  function selectTransaction(txn) {
    setLoading(true);
    setSelected(null);
    // Simulate analysis for the retry window
    setTimeout(() => {
      setSelected(txn);
      setLoading(false);
    }, 900);
  }

  return (
    <DashboardLayout title="Smart Retry Time Predictor">
      <p className="page-intro">
        Based on historical failure and success patterns, we predict the best time window to retry
        your failed transactions.
      </p>

      <div className="retry-grid">
        {/* Failed transactions list */}
        <Card title="Failed Transactions" subtitle="Select a transaction to get its retry suggestion">
          <ul className="failed-list">
            {failedTransactions.map((txn) => (
              <li key={txn.id}>
                <button
                  className={
                    'failed-item' +
                    (selected && selected.id === txn.id ? ' active' : '') +
                    (loading ? '' : '')
                  }
                  onClick={() => selectTransaction(txn)}
                >
                  <div className="failed-item-top">
                    <span className="cell-mono">{txn.id}</span>
                    <Badge label={txn.retryStatus} />
                  </div>
                  <div className="failed-item-bottom">
                    <span className="cell-strong">{formatCurrency(txn.amount)}</span>
                    <span className="failed-time">Failed at {txn.failedTime}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Retry suggestion */}
        <div className="retry-result">
          {loading && (
            <Card title="Predicting best retry window...">
              <div className="retry-loading">
                <div className="spinner" />
                <p>Analysing historical success patterns...</p>
              </div>
            </Card>
          )}

          {!loading && !selected && (
            <Card title="Retry Suggestion">
              <EmptyState
                icon="⏰"
                title="No transaction selected"
                message="Select a failed transaction to see the smart retry suggestion."
              />
            </Card>
          )}

          {!loading && selected && (
            <Card
              title="Smart Retry Suggestion"
              subtitle={selected.id + ' · failed at ' + selected.failedTime}
            >
              <div className="retry-hero">
                <div className="retry-detail">
                  <p className="retry-detail-label">Failed Transaction</p>
                  <p className="retry-detail-value cell-strong">{formatCurrency(selected.amount)}</p>
                  <p className="retry-detail-sub">
                    {selected.app} · {selected.bank}
                  </p>
                </div>

                <div className="retry-clock">⏰</div>

                <div className="retry-detail">
                  <p className="retry-detail-label">Recommended Retry Time</p>
                  <p className="retry-detail-value retry-window">{selected.suggestedRetryTime}</p>
                  <p className="retry-detail-sub">{formatDate(selected.originalDate)}</p>
                </div>
              </div>

              <div className="retry-probability">
                <span className="retry-detail-label">Expected Success Probability</span>
                <div className={'probability-badge ' + (PROBABILITY_STYLE[selected.successProbability] || 'probability-medium')}>
                  <span className="prob-dot" />
                  {selected.successProbability}
                </div>
              </div>

              <div className="result-section">
                <h4>Failure Reason</h4>
                <p className="reason-text">⚠️ {selected.failureReason}</p>
              </div>

              <div className="result-section">
                <h4>Why This Time Window?</h4>
                <div className="recommendation-box">
                  <span className="recommendation-icon">💡</span>
                  <p>{selected.retryReason}.</p>
                </div>
              </div>

              <div className="retry-meta">
                <div>
                  <p className="retry-detail-label">Retry Status</p>
                  <Badge label={selected.retryStatus} />
                </div>
                <div>
                  <p className="retry-detail-label">Recovery Status</p>
                  <Badge label={selected.recoveryStatus} />
                </div>
              </div>

              <div className="form-actions">
                <Button variant="primary">Set Reminder 🔔</Button>
                <Button variant="outline">Mark as Done</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}