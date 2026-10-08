// Reusable stat card used in dashboards.
export default function StatCard({ label, value, sub, icon: Icon, color = "primary" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-bg-${color}`}>
        <Icon size={24} />
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}