// StatCard component: dashboard statistics card with icon and value

export default function StatCard({ icon, label, value, sub, tone = 'primary' }) {
  return (
    <div className={'stat-card stat-' + tone}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-info">
        <p className="stat-label">{label}</p>
        <h3 className="stat-value">{value}</h3>
        {sub && <p className="stat-sub">{sub}</p>}
      </div>
    </div>
  );
}