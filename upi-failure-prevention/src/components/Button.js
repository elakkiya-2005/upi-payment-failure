// Reusable button component.
export default function Button({
  children,
  variant = "primary",
  size = "",
  type = "button",
  icon: Icon,
  className = "",
  loading = false,
  disabled = false,
  ...props
}) {
  const variantClass = {
    primary: "btn-primary",
    outline: "btn-outline",
    ghost: "btn-ghost",
    danger: "btn-danger",
  }[variant];

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${size === "lg" ? "btn-lg" : ""} ${
        size === "block" ? "btn-block" : ""
      } ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
      {!loading && Icon && <Icon size={18} />}
      {children}
    </button>
  );
}