// FormField component: reusable form field with label, input, and error

export default function FormField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  options,
  required = false,
  name,
}) {
  let control;

  if (type === 'select') {
    control = (
      <select
        name={name}
        value={value}
        onChange={onChange}
        className={'form-control' + (error ? ' form-control-error' : '')}
      >
        <option value="">Select...</option>
        {options &&
          options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
      </select>
    );
  } else {
    control = (
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={'form-control' + (error ? ' form-control-error' : '')}
        required={required}
      />
    );
  }

  return (
    <div className="form-field">
      <label className="form-label">
        {label} {required && <span className="required-star">*</span>}
      </label>
      {control}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}