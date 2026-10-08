import { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import Card from '../components/common/Card';
import TransactionTable from '../components/txn/TransactionTable';
import Pagination from '../components/txn/Pagination';
import EmptyState from '../components/common/EmptyState';
import { transactions } from '../data/transactionsData';
import { formatCurrency } from '../utils/format';

const PAGE_SIZE = 8;

const paymentApps = [...new Set(transactions.map((t) => t.app))];
const statuses = ['Success', 'Failed'];
const riskLevels = ['Low', 'Medium', 'High'];

export default function History() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  function handleReset() {
    setSearch('');
    setStatusFilter('');
    setDateFilter('');
    setAppFilter('');
    setRiskFilter('');
    setSelectedDate('');
    setCurrentPage(1);
  }

  const filtered = transactions.filter((txn) => {
    // Search by ID or amount
    if (search && !txn.id.toLowerCase().includes(search.toLowerCase()) && !String(txn.amount).includes(search)) {
      return false;
    }
    if (statusFilter && txn.status !== statusFilter) return false;
    if (appFilter && txn.app !== appFilter) return false;
    if (riskFilter && txn.risk !== riskFilter) return false;
    if (dateFilter && txn.date !== dateFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  // Clamp page when filters change
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageData = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const filterCount = [search, statusFilter, dateFilter, appFilter, riskFilter].filter(Boolean).length;

  return (
    <DashboardLayout title="Transaction History">
      <Card
        title="Filters"
        subtitle="Search and filter your transactions"
        actions={
          filterCount > 0 && (
            <div className="card-actions-inline">
              <span className="filter-count">{filterCount} active {filterCount === 1 ? 'filter' : 'filters'}</span>
              <button className="btn btn-ghost btn-sm" onClick={handleReset}>
                ✕ Clear all
              </button>
            </div>
          )
        }
      >
        <div className="filter-grid">
          <div className="form-field">
            <label className="form-label">Search (ID or Amount)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search TXN1001 or 2500..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Status</label>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Payment App</label>
            <select
              className="form-control"
              value={appFilter}
              onChange={(e) => {
                setAppFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Apps</option>
              {paymentApps.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Risk Level</label>
            <select
              className="form-control"
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Risk Levels</option>
              {riskLevels.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-control"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      <Card title={'Transactions' + (filtered.length ? ' (' + filtered.length + ')' : '')}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="No transactions match your filters"
            message="Try changing the search text or clearing some filters."
          />
        ) : (
          <>
            <TransactionTable
              data={pageData}
              empty={<EmptyState icon="💳" title="No transactions" message="There are no transactions to display." />}
            />
            <Pagination
              currentPage={safePage}
              totalPages={Math.max(1, totalPages)}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </Card>

      {/* Detail breakdown card for the selected page */}
      {filtered.length > 0 && (
        <Card title="Page Summary">
          <div className="summary-row">
            <div className="summary-item">
              <span className="summary-dot dot-success" />
              <div>
                <p className="summary-value">
                  {formatCurrency(pageData.reduce((sum, t) => (t.status === 'Success' ? sum + t.amount : sum), 0))}
                </p>
                <p className="summary-label">Successful Amount (this page)</p>
              </div>
            </div>
            <div className="summary-item">
              <span className="summary-dot dot-danger" />
              <div>
                <p className="summary-value">
                  {pageData.filter((t) => t.status === 'Failed').length}
                </p>
                <p className="summary-label">Failed on this page</p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}