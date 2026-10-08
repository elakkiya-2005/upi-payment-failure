import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-grid">
          <div className="footer-about">
            <h4>
              <span className="brand-logo">₹</span> UPI Safety
            </h4>
            <p>
              UPI Transaction Failure Prevention and Smart Recovery System. Analyse your transaction
              risk before you pay and recover smartly from failures.
            </p>
          </div>

          <div className="footer-col">
            <h4>Quick Links</h4>
            <ul>
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/dashboard">Dashboard</Link>
              </li>
              <li>
                <Link to="/risk-check">Risk Check</Link>
              </li>
              <li>
                <Link to="/history">Transaction History</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Features</h4>
            <ul>
              <li>
                <Link to="/risk-check">Failure Risk Assessment</Link>
              </li>
              <li>
                <Link to="/retry-predictor">Smart Retry Time Predictor</Link>
              </li>
              <li>
                <Link to="/spike-warning">Failure Spike Warning</Link>
              </li>
              <li>
                <Link to="/recovery">Recovery Tracking</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Contact</h4>
            <ul>
              <li>support@upisafety.in</li>
              <li>+91 98765 43210</li>
              <li>Chennai, India</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 UPI Transaction Failure Prevention & Smart Recovery System | Final Year Project</p>
        </div>
      </div>
    </footer>
  );
}