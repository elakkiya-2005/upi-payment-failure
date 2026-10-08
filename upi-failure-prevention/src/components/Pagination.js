// Reusable pagination control.
export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="pagination">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}>
        Prev
      </button>
      {pages[0] > 1 && <button onClick={() => onChange(1)}>1</button>}
      {pages[0] > 2 && <span className="muted small">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          className={p === page ? "active" : ""}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages - 1 && (
        <span className="muted small">…</span>
      )}
      {pages[pages.length - 1] < totalPages && (
        <button onClick={() => onChange(totalPages)}>{totalPages}</button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages}>
        Next
      </button>
    </div>
  );
}