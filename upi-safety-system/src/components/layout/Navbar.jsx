import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const links = [
    { to: '/', label: 'Home' },
    { to: '/login', label: 'Login' },
    { to: '/register', label: 'Register' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/admin', label: 'Admin' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand" onClick={() => setOpen(false)}>
          <span className="brand-logo">₹</span>
          <span className="brand-text">UPI Safety</span>
        </Link>

        <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
          <span className={open ? 'hamburger active' : 'hamburger'}>
            <span />
            <span />
            <span />
          </span>
        </button>

        <div className={'nav-links' + (open ? ' open' : '')}>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={'nav-link' + (location.pathname === link.to ? ' active' : '')}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}