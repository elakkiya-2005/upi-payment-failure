// Formatting helper functions

// Convert a number to Indian Rupee format: ₹12,500
export function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

// Format date like "05 Sep 2026"
export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// Format date + time like "05 Sep 2026, 18:45"
export function formatDateTime(dateString, timeString) {
  if (!dateString) return '-';
  const date = formatDate(dateString);
  return timeString ? date + ', ' + timeString : date;
}