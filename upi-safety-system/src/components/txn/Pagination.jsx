// Pagination component: page navigation controls for tables/lists

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}) {
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="pagination">
      <p className="pagination-info">
        Showing {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
      </p>
      <div className="pagination-buttons">
        <button
          className="page-btn"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          ‹ Prev
        </button>

        {start > 1 && (
          <>
            <button className={'page-btn' + (currentPage === 1 ? ' active' : '')} onClick={() => onPageChange(1)}>
              1
            </button>
            {start > 2 && <span className="page-ellipsis">…</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            className={'page-btn' + (currentPage === p ? ' active' : '')}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="page-ellipsis">…</span>}
            <button
              className={'page-btn' + (currentPage === totalPages ? ' active' : '')}
              onClick={() => onPageChange(totalPages)}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          className="page-btn"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}