import { Link } from 'react-router-dom';

// AuthLayout: two-column card layout for login/register pages
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-hero-inner">
          <Link to="/" className="auth-brand">
            <span className="brand-logo">₹</span> UPI Safety
          </Link>
          <h2>Stop UPI failures before they happen.</h2>
          <p>
            Our smart system analyses your transaction conditions and predicts the failure risk
            before you pay — plus tells you the best time to retry a failed transaction.
          </p>
          <ul className="auth-points">
            <li>🛡️ Failure Risk Assessment</li>
            <li>⏰ Smart Retry Time Predictor</li>
            <li>🚨 Failure Spike Early Warning</li>
            <li>🔄 Recovery Tracking</li>
          </ul>
        </div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-form-card">
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}