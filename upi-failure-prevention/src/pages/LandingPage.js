import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Gauge,
  Clock,
  AlertTriangle,
  Lightbulb,
  RefreshCcw,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
  Zap,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Button from "../components/Button";

const features = [
  {
    icon: Gauge,
    color: "f-icon-primary",
    title: "Failure Risk Assessment",
    desc: "Analyze amount, time, app, bank, device and network before paying to see your Low, Medium or High failure risk instantly.",
  },
  {
    icon: Clock,
    color: "f-icon-success",
    title: "Smart Retry Time Predictor",
    desc: "Missed a transaction? Get the best time window to retry with the highest expected success probability.",
  },
  {
    icon: AlertTriangle,
    color: "f-icon-danger",
    title: "Failure Spike Early Warning",
    desc: "Know the moment failure rates jump for a bank or payment app so you can avoid the affected period.",
  },
  {
    icon: Lightbulb,
    color: "f-icon-warning",
    title: "Smart Recommendations",
    desc: "Receive simple, actionable suggestions on network, timing and amount to reduce failure chances.",
  },
  {
    icon: RefreshCcw,
    color: "f-icon-info",
    title: "Recovery Tracking",
    desc: "Track every failed payment, its retry status and recovery outcome, all in one clear view.",
  },
];

const steps = [
  { title: "Enter transaction details", desc: "Amount, time, app, bank, device and network." },
  { title: "Get failure risk instantly", desc: "A score from 0–100 with Low / Medium / High level." },
  { title: "Follow smart suggestions", desc: "Know when, how and on which network to retry safely." },
];

export default function LandingPage() {
  return (
    <div className="app-shell">
      <Navbar />

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <span className="hero-badge">
            <Zap size={15} />
            Final Year Project · B.Tech CSE
          </span>
          <h1>
            Stop UPI failures <span className="grad">before they happen</span>
          </h1>
          <p>
            UPI Transaction Failure Prevention and Smart Recovery System predicts the
            risk of a failed payment, suggests the best retry time, warns about failure
            spikes and tracks every recovery — all in one clean dashboard.
          </p>
          <div className="hero-actions">
            <Link to="/risk-check">
              <Button size="lg" icon={ShieldCheck}>
                Check Transaction Risk
              </Button>
            </Link>
            <Link to="/register">
              <Button variant="outline" size="lg">
                Get Started Free
              </Button>
            </Link>
          </div>
          <div className="hero-points">
            <div className="hero-point">
              <TrendingDown size={18} /> Reduce failed payments
            </div>
            <div className="hero-point">
              <Clock size={18} /> Smart retry timing
            </div>
            <div className="hero-point">
              <CheckCircle2 size={18} /> Higher recovery rate
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="container">
          <h2 className="section-heading" style={{ justifyContent: "center", fontSize: "1.5rem" }}>
            Everything you need for safer UPI payments
          </h2>
          <div className="features-grid">
            {features.map((f) => (
              <div className="feature-card" key={f.title}>
                <div className={`feature-icon ${f.color}`}>
                  <f.icon />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how" id="how">
        <div className="container">
          <h2 className="section-heading">How it works</h2>
          <div className="steps">
            {steps.map((s, i) => (
              <div className="step" key={s.title}>
                <div className="step-num">{i + 1}</div>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container" style={{ paddingBottom: 72 }}>
        <div className="cta-banner">
          <h2>Ready to check your next transaction?</h2>
          <p>
            Analyze failure risk in seconds, skip troubled hours and recover failed
            payments smarter.
          </p>
          <Link to="/risk-check">
            <Button size="lg" icon={ArrowRight}>
              Analyze Failure Risk Now
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}