import Badge from '../common/Badge';
import { formatCurrency, formatDate } from '../../utils/format';

// DataTable: reusable table wrapper
export function DataTable({ columns, children, empty }) {
  if (!children || Object.keys(children).length === 0) {
    return empty;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// TransactionTable: displays the standard transaction columns
export default function TransactionTable({ data = [], empty }) {
  if (!data || data.length === 0) {
    return empty;
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Time</th>
            <th>Payment App</th>
            <th>Status</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
          {data.map((txn) => (
            <tr key={txn.id}>
              <td className="cell-mono">{txn.id}</td>
              <td className="cell-strong">{formatCurrency(txn.amount)}</td>
              <td>{formatDate(txn.date)}</td>
              <td>{txn.time}</td>
              <td>{txn.app}</td>
              <td>
                <Badge label={txn.status} />
              </td>
              <td>
                <Badge label={txn.risk} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}