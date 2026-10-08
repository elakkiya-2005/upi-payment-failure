import { Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import Button from '../components/common/Button';

const FEATURES = [
  {
    icon: '🛡️',
    title: 'Failure Risk Assessment',
    description:
      'Analyse transaction conditions like amount, time, bank, app, device and network to predict the failure risk before you pay.',
  },
  {
    icon: '⏰',
    title: 'Smart Retry Time Predictor',
    description:
      'When a transaction fails, our system suggests the best time window to retry based on historical success patterns.',
  },
  {
    icon: '🚨',
    title: 'Failure Spike Early Warning',
    description:
      'Get alerted instantly when failure rates suddenly spike for a payment app, bank or network type.',
  },
  {
    icon: '💡',
    title: 'Smart Recommendations',
    description:
      'Receive personalised recommendations to reduce transaction failures — from network choice to better timing.',
  },
  {
    icon: '🔄',
    title: 'Recovery Tracking',
    description:
      'Track all your failed transactions and monitor retry and recovery status in one clean dashboard.',
  },
];

const HOW_IT_WORKS = [
  { step: '1', title: 'Enter Transaction Details', description: 'Amount, time, app, bank, device and network.' },
  { step: '2', title: 'Get Risk Analysis', description: 'Instant risk score with Low / Medium / High level.' },
  { step: '3', title: 'Receive Smart Advice', description: 'Clear recommendation on how to proceed safely.' },
  { step: '4', title: 'Retry & Recover Smartly', description: 'Best retry time suggestions for failed transactions.' },
];

const STATS = [
  { value: '94.2%', label: 'Successful Transactions' },
  { value: '~0.8s', label: 'Risk Analysis Time' },
  { value: '24/7', label: 'Monitoring' },
  { value: '5+', label: 'Payment Apps Supported' },
];

export default function Home() {
  return (
    <div className="home-page">
      <Navbar />

      {/* Hero section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <span className="hero-badge">Final Year Project</span>
            <h1>UPI Transaction Failure Prevention & Smart Recovery System</h1>
            <p>
              Check the failure risk of your UPI transaction before you pay. Get smart recommendations,
              predict the best retry time for failed transactions, and stay alerted to failure spikes.
            </p>
            <div className="hero-actions">
              <Link to="/risk-check">
                <Button variant="primary" size="lg">
                  Check Transaction Risk →
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="outline" size="lg">
                  View Dashboard
                </Button>
              </Link>
            </div>
          </div>

          <div className="hero-visual">
            <div className="risk-meter-card">
              <div className="meter-header">
                <span>Transaction Risk</span>
                <span className="meter-status">LIVE</span>
              </div>
              <ul className="meter-bars">
                <li className="meter-bar meter-low"><span style={{ width: '18%' }}>Low</span></li>
                <li className="meter-bar meter-medium"><span style={{ width: '45%' }}>Medium</span></li>
                <li className="meter-bar meter-high"><span style={{ width: '78%' }}>High</span></li>
              </ul>
              <div className="meter-badge high">HIGH RISK</div>
              <p className="meter-tip">💡 Tip: Retry after 8:30 PM on stable Wi-Fi</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="home-stats">
        {STATS.map((s) => (
          <div key={s.label} className="home-stat">
            <h3>{s.value}</h3>
            <p>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Features */}
      <section className="home-section">
        <div className="home-section-head">
          <h2>Why UPI Safety?</h2>
          <p>Five smart features built to stop transaction failures and recover missed payments quickly.</p>
        </div>
        <div className="features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="home-section home-section-alt">
        <div className="home-section-head">
          <h2>How It Works</h2>
          <p>From risk check to smart recovery in four simple steps.</p>
        </div>
        <div className="steps-grid">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step} className="step-card">
              <div className="step-number">{s.step}</div>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta">
        <h2>Ready to pay with confidence?</h2>
        <p>Check the failure risk of your next UPI transaction in seconds.</p>
        <Link to="/register">
          <Button variant="light" size="lg">
            Get Started Free
          </Button>
        </Link>
      </section>

      <Footer />
    </div>
  );
}