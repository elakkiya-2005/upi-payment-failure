// Small formatting helpers used all over the app.

export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date) {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(date) {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(date) {
  if (!date) return "—";
  return `${formatDate(date)}, ${formatTime(date)}`;
}

export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}