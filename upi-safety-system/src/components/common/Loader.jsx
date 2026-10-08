// Loader component: skeleton loading state

export default function Loader({ text = 'Loading...', rows = 3 }) {
  return (
    <div className="loader-container" aria-label="Loading">
      <div className="spinner" />
      <p>{text}</p>
      <div className="skeleton-list">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-row" />
        ))}
      </div>
    </div>
  );
}