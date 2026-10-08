// Reusable page header with title, subtitle and optional action buttons.
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {title && <h1>{title}</h1>}
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="quick-links">{actions}</div>}
    </div>
  );
}