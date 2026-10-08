// Reusable form input with a label and error message.
export function TextInput({
  label,
  error,
  hint,
  icon: Icon,
  className = "",
  ...props
}) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <div style={{ position: "relative" }}>
        {Icon && (
          <Icon
            size={17}
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              color: "var(--text-muted)",
            }}
          />
        )}
        <input
          className={`form-control ${error ? "is-invalid" : ""} ${className}`}
          style={Icon ? { paddingLeft: 38 } : undefined}
          {...props}
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      {hint && !error && <div className="form-helper">{hint}</div>}
    </div>
  );
}

// Reusable select input with a label and error message.
export function SelectInput({ label, error, children, className = "", ...props }) {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <select
        className={`form-control ${error ? "is-invalid" : ""} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}