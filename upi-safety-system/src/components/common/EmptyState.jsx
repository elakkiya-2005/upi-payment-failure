// EmptyState component: shown when there is no data

export default function EmptyState({ icon = '🔍', title = 'No data found', message = 'There is nothing to show here yet.' }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}