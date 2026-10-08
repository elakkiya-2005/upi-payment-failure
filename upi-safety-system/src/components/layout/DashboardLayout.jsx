import { NavLink, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/risk-check', label: 'Risk Check', icon: '🛡️' },
  { to: '/retry-predictor', label: 'Retry Predictor', icon: '⏰' },
  { to: '/history', label: 'Transaction History', icon: '📋' },
  { to: '/recovery', label: 'Recovery Tracking', icon: '🔄' },
  { to: '/spike-warning', label: 'Spike Warning', icon: '🚨' },
  { to: '/admin', label: 'Admin Dashboard', icon: '👑' },
];

export default function DashboardLayout({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile sidebar whenever the route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="dashboard-shell">
      {/* Mobile top bar */}
      <div className="dash-topbar">
        <button className="dash-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Open menu">
          <span className={sidebarOpen ? 'hamburger active' : 'hamburger'}>
            <span />
            <span />
            <span />
          </span>
        </button>
        <Link to="/" className="dash-topbar-brand">
          <span className="brand-logo">₹</span> UPI Safety
        </Link>
        <Link to="/" className="dash-topbar-home">
          ← Home
        </Link>
      </div>

      <div className={'sidebar-overlay' + (sidebarOpen ? ' show' : '')} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={'sidebar' + (sidebarOpen ? ' open' : '')}>
        <div className="sidebar-brand">
          <Link to="/">
            <span className="brand-logo">₹</span>
            <span>UPI Safety</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link to="/login" className="sidebar-link">
            <span className="sidebar-icon">👤</span> Logout
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="dash-main">
        <div className="dash-content">
          {title && (
            <div className="dash-page-heading">
              <h1>{title}</h1>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}