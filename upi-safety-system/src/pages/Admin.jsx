import { useEffect, useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import StatCard from '../components/common/StatCard';
import Badge from '../components/common/Badge';
import {
  BarChartCard,
  DonutChart,
  LineTrendChart,
} from '../components/charts/Charts';

const RISK_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const emptyAnalytics = {
  totalTransactions: 0,
  successCount: 0,
  failureCount: 0,
  successRate: 0,
  failureRate: 0,
  highRiskCount: 0,
  recoveryRate: 0,
};

export default function Admin() {
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [transactions, setTransactions] = useState([]);
  const [bankAnalysis, setBankAnalysis] = useState([]);
  const [networkAnalysis, setNetworkAnalysis] = useState([]);
  const [hourlyAnalysis, setHourlyAnalysis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);
      setError('');

      const [
        analyticsResponse,
        transactionsResponse,
        bankResponse,
        networkResponse,
        hourlyResponse,
      ] = await Promise.all([
        fetch('http://localhost:5000/api/analytics'),
        fetch('http://localhost:5000/api/transactions'),
        fetch('http://localhost:5000/api/bank-analysis'),
        fetch('http://localhost:5000/api/network-analysis'),
        fetch('http://localhost:5000/api/hourly-analysis'),
      ]);

      if (
        !analyticsResponse.ok ||
        !transactionsResponse.ok ||
        !bankResponse.ok ||
        !networkResponse.ok ||
        !hourlyResponse.ok
      ) {
        throw new Error('Unable to load dashboard data');
      }

      const analyticsData = await analyticsResponse.json();
      const transactionsData = await transactionsResponse.json();
      const bankData = await bankResponse.json();
      const networkData = await networkResponse.json();
      const hourlyData = await hourlyResponse.json();

      setAnalytics(normalizeAnalytics(analyticsData));
      setTransactions(normalizeArray(transactionsData));
      setBankAnalysis(normalizeArray(bankData));
      setNetworkAnalysis(normalizeArray(networkData));
      setHourlyAnalysis(normalizeArray(hourlyData));
    } catch (err) {
      console.error('Dashboard loading error:', err);
      setError('Unable to load real database data. Please check the backend server.');
    } finally {
      setLoading(false);
    }
  }

  function normalizeArray(data) {
    if (Array.isArray(data)) return data;

    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.rows)) return data.rows;
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.transactions)) return data.transactions;

    return [];
  }

  function normalizeAnalytics(data) {
    const total =
      Number(
        data.totalTransactions ??
          data.total_transactions ??
          data.total ??
          0
      ) || 0;

    const success =
      Number(
        data.successCount ??
          data.success_count ??
          data.successfulTransactions ??
          data.successful ??
          0
      ) || 0;

    const failed =
      Number(
        data.failureCount ??
          data.failure_count ??
          data.failedTransactions ??
          data.failed ??
          0
      ) || 0;

    const successRate =
      total > 0 ? Math.round((success / total) * 100) : 0;

    const failureRate =
      total > 0 ? Math.round((failed / total) * 100) : 0;

    return {
      totalTransactions: total,
      successCount: success,
      failureCount: failed,
      successRate,
      failureRate,
      highRiskCount: Number(
        data.highRiskCount ?? data.high_risk_count ?? 0
      ),
      recoveryRate: Number(
        data.recoveryRate ?? data.recovery_rate ?? 0
      ),
    };
  }

  function getValue(row, possibleKeys) {
    for (const key of possibleKeys) {
      if (row[key] !== undefined && row[key] !== null) {
        return row[key];
      }
    }

    return 0;
  }

  function getName(row, possibleKeys) {
    for (const key of possibleKeys) {
      if (row[key] !== undefined && row[key] !== null) {
        return String(row[key]);
      }
    }

    return 'Unknown';
  }

  const successVsFailure = [
    {
      name: 'Successful',
      value: analytics.successCount,
    },
    {
      name: 'Failed',
      value: analytics.failureCount,
    },
  ];

  const failureByApp = bankAnalysis.map((row) => ({
    name: getName(row, [
      'paymentApp',
      'payment_app',
      'transaction_type',
      'transactionType',
      'name',
    ]),
    value: Number(
      getValue(row, [
        'failures',
        'failureCount',
        'failure_count',
        'failed',
        'count',
        'value',
      ])
    ),
  }));

  const failureByTime = hourlyAnalysis.map((row) => ({
    name: getName(row, [
      'hour',
      'hour_of_day',
      'time',
      'name',
    ]),
    value: Number(
      getValue(row, [
        'failures',
        'failureCount',
        'failure_count',
        'failed',
        'count',
        'value',
      ])
    ),
  }));

  const failureByNetwork = networkAnalysis.map((row) => ({
    name: getName(row, [
      'networkType',
      'network_type',
      'network',
      'name',
    ]),
    value: Number(
      getValue(row, [
        'failures',
        'failureCount',
        'failure_count',
        'failed',
        'count',
        'value',
      ])
    ),
  }));

  const riskDistribution = [
    {
      name: 'Low',
      value: transactions.filter(
        (transaction) =>
          String(transaction.riskLevel || transaction.risk || '')
            .toLowerCase() === 'low'
      ).length,
    },
    {
      name: 'Medium',
      value: transactions.filter(
        (transaction) =>
          String(transaction.riskLevel || transaction.risk || '')
            .toLowerCase() === 'medium'
      ).length,
    },
    {
      name: 'High',
      value:
        analytics.highRiskCount ||
        transactions.filter(
          (transaction) =>
            String(transaction.riskLevel || transaction.risk || '')
              .toLowerCase() === 'high'
        ).length,
    },
  ];

  const palette = {
    Low: { color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
    Medium: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
    High: { color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  };

  return (
    <DashboardLayout title="Admin Dashboard">
      {loading && (
        <Card title="Loading Dashboard">
          <p>Loading real MySQL transaction data...</p>
        </Card>
      )}

      {error && (
        <Card title="Dashboard Error">
          <p style={{ color: '#ef4444' }}>{error}</p>
          <button onClick={loadDashboardData}>Retry</button>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="stat-grid">
            <StatCard
              icon="👥"
              label="Total Users"
              value="Database"
              sub="User count API not configured"
              tone="primary"
            />

            <StatCard
              icon="💳"
              label="Total Transactions"
              value={analytics.totalTransactions.toLocaleString()}
              sub="Real database transactions"
              tone="primary"
            />

            <StatCard
              icon="✅"
              label="Success Rate"
              value={analytics.successRate + '%'}
              sub={analytics.successCount.toLocaleString() + ' successful'}
              tone="success"
            />

            <StatCard
              icon="❌"
              label="Failure Rate"
              value={analytics.failureRate + '%'}
              sub={analytics.failureCount.toLocaleString() + ' failed'}
              tone="danger"
            />

            <StatCard
              icon="🚨"
              label="High-Risk Transactions"
              value={analytics.highRiskCount.toLocaleString()}
              sub="Need attention"
              tone="danger"
            />

            <StatCard
              icon="🔄"
              label="Recovery Rate"
              value={analytics.recoveryRate + '%'}
              sub="Failed transactions recovered"
              tone="success"
            />
          </div>

          <div className="dash-grid">
            <Card title="Success vs Failure" className="dash-span-2">
              <DonutChart
                title="Overall transaction outcome"
                data={successVsFailure}
                colors={['#10b981', '#ef4444']}
                height={300}
              />
            </Card>

            <Card title="Failure by Bank / App">
              <BarChartCard
                title=""
                data={failureByApp}
                bars={[{ key: 'value', name: 'Failures' }]}
                colors={['#ef4444']}
                height={300}
              />
            </Card>

            <Card title="Failure by Time of Day">
              <BarChartCard
                title=""
                data={failureByTime}
                bars={[{ key: 'value', name: 'Failures' }]}
                colors={['#f59e0b']}
                height={280}
              />
            </Card>

            <Card title="Failure by Network Type">
              <DonutChart
                title=""
                data={failureByNetwork}
                colors={['#6366f1', '#ec4899', '#10b981']}
                height={280}
              />
            </Card>

            <Card title="Risk Level Distribution">
              <DonutChart
                title=""
                data={riskDistribution}
                colors={RISK_COLORS}
                height={280}
              />
            </Card>
          </div>

          <Card
            title="Recent Transactions"
            subtitle="Real transactions retrieved from MySQL"
          >
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Bank</th>
                    <th>Network</th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.slice(0, 20).map((transaction, index) => {
                    const transactionId =
                      transaction.transaction_id ||
                      transaction.transactionId ||
                      transaction.id ||
                      index + 1;

                    const amount = transaction.amount || 0;

                    const status =
                      transaction.transaction_status ||
                      transaction.transactionStatus ||
                      transaction.status ||
                      'Unknown';

                    const bank =
                      transaction.sender_bank ||
                      transaction.senderBank ||
                      transaction.bank ||
                      'Unknown';

                    const network =
                      transaction.network_type ||
                      transaction.networkType ||
                      transaction.network ||
                      'Unknown';

                    return (
                      <tr key={transactionId}>
                        <td className="cell-mono">{transactionId}</td>
                        <td>₹{Number(amount).toFixed(2)}</td>
                        <td>
                          <Badge label={status} />
                        </td>
                        <td>{bank}</td>
                        <td>{network}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </DashboardLayout>
  );
}