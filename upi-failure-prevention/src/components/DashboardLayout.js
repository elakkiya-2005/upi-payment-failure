import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, Bell, LogOut } from "lucide-react";
import Sidebar from "./Sidebar";
import { useAuth } from "../context/AuthContext";

// Wrapper used by every dashboard page. It renders the sidebar, top bar and content.
export default function DashboardLayout({ user, title, onLogout, adminView = false, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }
    logout();
    navigate("/login");
  };

  return (
    <div className="dash">
      <Sidebar
        user={user}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        adminView={adminView}
      />

      <main className="dash-main">
        <header className="dash-topbar">
          <div className="topbar-title">
            <button
              className="menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            {title}
          </div>

          <div className="topbar-right">
            {!adminView && (
              <Link to="/warnings" className="icon-btn" aria-label="Notifications">
                <Bell size={18} />
                <span className="notif-dot">3</span>
              </Link>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <div className="dash-content">{children}</div>
      </main>
    </div>
  );
}
