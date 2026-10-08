// Reusable card wrapper.
export default function Card({ title, icon: Icon, children, className = "", actions }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-16">
          {title && (
            <div className="card-title" style={{ marginBottom: 0 }}>
              {Icon && <Icon size={18} />}
              {title}
            </div>
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}