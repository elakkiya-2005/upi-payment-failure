import { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import FormField from '../components/common/FormField';
import Button from '../components/common/Button';
import Loader from '../components/common/Loader';
import { dropdownOptions } from '../utils/riskEngine';

const RISK_COLOR = {
  Low: { color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  Medium: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  High: { color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
};

export default function RiskCheck() {
  const [form, setForm] = useState({
    amount: '',
    time: '',
    paymentApp: '',
    bank: '',
    deviceType: '',
    networkType: '',
    transactionType: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function validate() {
    const errs = {};
    if (!form.amount) {
      errs.amount = 'Amount is required';
    } else if (Number(form.amount) <= 0) {
      errs.amount = 'Amount must be greater than zero';
    }

    if (!form.time) {
      errs.time = 'Transaction time is required';
    }

    if (!form.paymentApp) {
      errs.paymentApp = 'Select a payment app';
    }
    if (!form.bank) {
      errs.bank = 'Select a bank';
    }
    if (!form.deviceType) {
      errs.deviceType = 'Select a device type';
    }
    if (!form.networkType) {
      errs.networkType = 'Select a network type';
    }
    if (!form.transactionType) {
      errs.transactionType = 'Select a transaction type';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }
async function handleAnalyze(e) {
  e.preventDefault();

  if (!validate()) return;

  setLoading(true);
  setResult(null);

  try {
    const response = await fetch('http://localhost:5000/api/risk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Number(form.amount),
        time: form.time,
        bank: form.bank,
        deviceType: form.deviceType,
        networkType: form.networkType,
        transactionType: form.transactionType,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Risk analysis failed');
    }

    setResult({
      riskScore: data.riskScore,
      riskLevel:
        data.riskLevel.charAt(0).toUpperCase() +
        data.riskLevel.slice(1).toLowerCase(),
      riskFactors: data.factors || [],
      recommendation: data.recommendation?.message || 'No recommendation available.',
      amount: form.amount,
      paymentApp: form.paymentApp,
      hour: form.time.split(':')[0],
      networkType: form.networkType,
      deviceType: form.deviceType,
      bank: form.bank,
    });
  } catch (error) {
    console.error('Risk analysis error:', error);
    setErrors({
      api: 'Unable to connect to the risk analysis server.',
    });
  } finally {
    setLoading(false);
  }
}
  
  function handleReset() {
    setForm({
      amount: '',
      time: '',
      paymentApp: '',
      bank: '',
      deviceType: '',
      networkType: '',
      transactionType: '',
    });
    setErrors({});
    setResult(null);
  }

  const palette = result ? RISK_COLOR[result.riskLevel] : null;

  return (
    <DashboardLayout title="Transaction Risk Check">
      <div className="risk-check-grid">
        {/* Form */}
        <Card
          title="Transaction Details"
          subtitle="Enter the conditions of the transaction you want to analyse"
        >
          <form className="risk-form" onSubmit={handleAnalyze} noValidate>
            <div className="form-grid-2">
              <FormField
                label="Transaction Amount (₹)"
                name="amount"
                type="number"
                placeholder="e.g. 2500"
                value={form.amount}
                onChange={handleChange}
                error={errors.amount}
                required
              />

              <FormField
                label="Transaction Time"
                name="time"
                type="time"
                value={form.time}
                onChange={handleChange}
                error={errors.time}
                required
              />

              <FormField
                label="Payment App"
                name="paymentApp"
                type="select"
                options={dropdownOptions.paymentApps}
                value={form.paymentApp}
                onChange={handleChange}
                error={errors.paymentApp}
                required
              />

              <FormField
                label="Bank"
                name="bank"
                type="select"
                options={dropdownOptions.banks}
                value={form.bank}
                onChange={handleChange}
                error={errors.bank}
                required
              />

              <FormField
                label="Device Type"
                name="deviceType"
                type="select"
                options={dropdownOptions.deviceTypes}
                value={form.deviceType}
                onChange={handleChange}
                error={errors.deviceType}
                required
              />

              <FormField
                label="Network Type"
                name="networkType"
                type="select"
                options={dropdownOptions.networkTypes}
                value={form.networkType}
                onChange={handleChange}
                error={errors.networkType}
                required
              />

              <FormField
                label="Transaction Type"
                name="transactionType"
                type="select"
                options={dropdownOptions.transactionTypes}
                value={form.transactionType}
                onChange={handleChange}
                error={errors.transactionType}
                required
              />
            </div>

            <div className="form-actions">
              <Button type="submit" variant="primary" size="lg" disabled={loading}>
                🔍 Analyze Failure Risk
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </form>
        </Card>

        {/* Result */}
        <div className="risk-result-col">
          {loading && (
            <Card title="Analyzing failure risk">
              <Loader text="Analysing transaction conditions..." rows={4} />
            </Card>
          )}

          {!loading && !result && (
            <Card
              title="Risk Analysis Result"
              subtitle="Fill in the transaction details and click “Analyze Failure Risk” to see the result here."
            >
              <div className="result-placeholder">
                <div className="placeholder-illustration">
                  <div className="placeholder-shield">🛡️</div>
                  <p>Your risk report will appear here</p>
                  <span className="placeholder-sub">Risk score, level and smart recommendations</span>
                </div>
              </div>
            </Card>
          )}

          {!loading && result && (
            <Card title="Risk Analysis Report" subtitle={'Transaction ' + result.amount + ' via ' + result.paymentApp}>
              <div
                className="risk-score-block"
                style={{ background: palette.bg, border: '1px solid ' + palette.border }}
              >
                <div className="risk-score-top">
                  <div>
                    <p className="risk-score-label">Risk Score</p>
                    <p className="risk-score-value" style={{ color: palette.color }}>
                      {result.riskScore}<span className="risk-score-max"> / 100</span>
                    </p>
                  </div>
                  <div className={'risk-level-pill risk-' + result.riskLevel.toLowerCase()}>
                    {result.riskLevel + ' RISK'}
                  </div>
                </div>

                {/* Simple visual meter */}
                <div className="score-meter">
                  <div className="score-meter-track">
                    <div
                      className={'score-meter-fill fill-' + result.riskLevel.toLowerCase()}
                      style={{ width: result.riskScore + '%' }}
                    />
                  </div>
                  <div className="meter-scale">
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>
              </div>

              <div className="result-section">
                <h4>Possible Risk Factors</h4>
                <ul className="risk-factor-list">
                  {result.riskFactors.map((f, i) => (
                    <li key={i}>
                      <span className="factor-icon">⚠️</span> {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="result-section">
                <h4>Smart Recommendation</h4>
                <div className="recommendation-box">
                  <span className="recommendation-icon">💡</span>
                  <p>{result.recommendation}</p>
                </div>
              </div>

              <div className="result-section">
                <h4>Conditions Checked</h4>
                <div className="conditions-summary">
                  <span className="cond-chip">⏰ {result.hour}:00</span>
                  <span className="cond-chip">📶 {result.networkType}</span>
                  <span className="cond-chip">📱 {result.deviceType}</span>
                  <span className="cond-chip">🏦 {result.bank}</span>
                </div>
              </div>

              <Button variant="outline" size="md" className="w-100" onClick={handleReset}>
                Check Another Transaction
              </Button>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}