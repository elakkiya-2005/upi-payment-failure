// Loading and empty state components.
import { PackageOpen } from "lucide-react";

export function LoadingState({ label = "Loading data..." }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({ title = "No records found", message = "Try adjusting your filters." }) {
  return (
    <div className="empty-state">
      <PackageOpen size={52} />
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

export function PageLoader({ label = "Loading page..." }) {
  return (
    <div className="loading-state" style={{ minHeight: "40vh" }}>
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}