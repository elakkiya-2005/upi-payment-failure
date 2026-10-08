import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-top">
          <div className="footer-brand">
            <Link to="/" className="brand">
              <span className="brand-logo">
                <ShieldCheck />
              </span>
              UPI SafeGuard
            </Link>
            <p>
              UPI Transaction Failure Prevention and Smart Recovery System — a
              final year project that predicts failure risk, suggests smart retry
              times and tracks recovery.
            </p>
          </div>

          <div className="footer-col">
            <h4>Platform</h4>
            <Link to="/dashboard">User Dashboard</Link>
            <Link to="/risk-check">Risk Check</Link>
            <Link to="/retry-predictor">Retry Predictor</Link>
            <Link to="/recovery">Recovery Tracking</Link>
          </div>

          <div className="footer-col">
            <h4>Insights</h4>
            <Link to="/history">Transaction History</Link>
            <Link to="/warnings">Failure Spike Alerts</Link>
          </div>

          <div className="footer-col">
            <h4>Account</h4>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>&copy; 2026 UPI SafeGuard. Final Year Project.</span>
          <span>Built with React</span>
        </div>
      </div>
    </footer>
  );
}