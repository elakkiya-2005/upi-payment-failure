// Button component: reusable button with variants

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  disabled = false,
  className = '',
  style,
}) {
  const variantClass = 'btn-' + variant;
  const sizeClass = 'btn-' + size;

  return (
    <button
      type={type}
      className={'btn ' + variantClass + ' ' + sizeClass + ' ' + className}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}