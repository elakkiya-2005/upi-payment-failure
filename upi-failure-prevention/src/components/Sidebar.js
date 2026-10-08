import { NavLink } from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  Gauge,
  Clock,
  History,
  RefreshCcw,
  AlertTriangle,
  ShieldAlert,
  Network,
  ScanLine,
  ClipboardList,
  FileSpreadsheet,
} from "lucide-react";
import { roleLabel } from "../utils/auth";
import { useAuth } from "../context/AuthContext";

const mainLinks = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Check Transaction Risk", to: "/risk-check", icon: Gauge },
  { label: "Dataset Analyzer", to: "/dataset-analyzer", icon: FileSpreadsheet },
  { label: "My Risk History", to: "/my-risk-history", icon: ClipboardList },
  { label: "Smart Retry Predictor", to: "/retry-predictor", icon: Clock },
  { label: "Transaction History", to: "/history", icon: History },
  { label: "Recovery Tracking", to: "/recovery", icon: RefreshCcw },
];

const insightLinks = [
  { label: "Failure Spike Warnings", to: "/warnings", icon: AlertTriangle, badge: 3 },
  { label: "Bank Pair Analysis", to: "/bank-pair-analysis", icon: Network },
  { label: "Anomaly Detection", to: "/anomaly-detection", icon: ScanLine },
  { label: "Admin Dashboard", to: "/admin", icon: ShieldAlert, adminOnly: true },
];

const adminLinks = [{ label: "Admin Dashboard", to: "/admin", icon: ShieldAlert }];

export default function Sidebar({ user: userProp, open, onClose, adminView = false }) {
  const { user: sessionUser } = useAuth();
  const user = userProp || sessionUser;

  const sections = adminView
    ? [{ label: "Admin", links: adminLinks }]
    : [
        { label: "Main", links: mainLinks },
        { label: "Insights", links: insightLinks.filter((l) => !l.adminOnly) },
      ];

  return (
    <>
      <aside className={`dash-sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-logo">
            <ShieldCheck />
          </span>
          UPI SafeGuard
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="sidebar-section">{section.label}</div>
              {section.links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
                  onClick={onClose}
                >
                  <l.icon />
                  {l.label}
                  {l.badge && <span className="sidebar-badge-count">{l.badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{(user?.name || "G")[0]}</div>
          <div style={{ minWidth: 0 }}>
            <div className="u-name">{user?.name || "Guest"}</div>
            <div className="u-role">{roleLabel(user?.role)}</div>
          </div>
        </div>
      </aside>
      {open && <div className="dash-overlay show" onClick={onClose} />}
    </>
  );
}