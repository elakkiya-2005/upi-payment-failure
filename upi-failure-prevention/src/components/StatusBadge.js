// Badge shown for transaction status (success / failed).
export default function StatusBadge({ status }) {
  const key = status === "success" ? "ok" : "fail";
  return <span className={`badge badge-${key}`}>{status}</span>;
}

// Badge shown for risk levels (low / medium / high).
export function RiskBadge({ level }) {
  const key = String(level).toLowerCase();
  const label =
    key === "low" ? "Low" : key === "medium" ? "Medium" : key === "high" ? "High" : level;
  return <span className={`badge badge-${key}`}>{label} Risk</span>;
}

// Generic badge for other values.
export function Tag({ text, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{text}</span>;
}