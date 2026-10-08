import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Menu, X } from "lucide-react";
import Button from "./Button";

const links = [
  { label: "Home", to: "/" },
  { label: "Features", to: "/#features" },
  { label: "How It Works", to: "/#how" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-nav">
      <nav className="container site-nav-inner" style={{ paddingTop: 14, paddingBottom: 14 }}>
        <Link to="/" className="brand">
          <span className="brand-logo">
            <ShieldCheck />
          </span>
          UPI SafeGuard
        </Link>

        <div className="site-nav-links">
          {links.map((l) => (
            <a key={l.label} href={l.to}>
              {l.label}
            </a>
          ))}
        </div>

        <div className="nav-actions">
          <Link to="/dashboard">
            <Button variant="ghost" className="btn-text">
              Dashboard
            </Button>
          </Link>
          <Link to="/login">
            <Button className="btn-text">Sign In</Button>
          </Link>
          <button
            className="nav-burger"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      <div className={`mobile-menu ${open ? "open" : ""}`}>
        {links.map((l) => (
          <a key={l.label} href={l.to} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <Link to="/dashboard" onClick={() => setOpen(false)}>
          Dashboard
        </Link>
        <Link to="/login" onClick={() => setOpen(false)}>
          Sign In
        </Link>
      </div>
    </header>
  );
}