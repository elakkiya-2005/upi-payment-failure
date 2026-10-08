// Badge component: displays status/risk labels with colour coding

const STYLES = {
  Success: 'badge badge-success',
  Failed: 'badge badge-danger',
  Pending: 'badge badge-warning',
  Recovered: 'badge badge-success',
  'Not Recovered': 'badge badge-danger',
  Low: 'badge badge-low',
  Medium: 'badge badge-medium',
  High: 'badge badge-high',
  Active: 'badge badge-success',
  Inactive: 'badge badge-muted',
};

export default function Badge({ label }) {
  const className = STYLES[label] || 'badge badge-muted';
  return <span className={className}>{label}</span>;
}