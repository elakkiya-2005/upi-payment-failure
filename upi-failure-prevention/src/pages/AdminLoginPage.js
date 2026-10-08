import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ShieldAlert, Mail, Lock, Eye, EyeOff } from "lucide-react";
import Button from "../components/Button";
import { TextInput } from "../components/FormInputs";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { admin, login } = useAdminAuth();
  const [values, setValues] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!values.email) e.email = "Admin username or email is required";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email))
      e.email = "Enter a valid email address";
    if (!values.password) e.password = "Password is required";
    else if (values.password.length < 6)
      e.password = "Password must be at least 6 characters";
    return e;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    setFormError("");

    try {
      await login({
        email: values.email,
        password: values.password,
      });
      navigate("/admin");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (admin) return <Navigate to="/admin" replace />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <span className="brand-logo">
            <ShieldAlert />
          </span>
          <h1>Admin Access</h1>
          <p>Sign in with an administrator account to open the Admin Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <TextInput
            label="Admin Username / Email"
            name="email"
            type="email"
            placeholder="admin@example.com"
            icon={Mail}
            value={values.email}
            onChange={onChange}
            error={errors.email}
            autoComplete="username"
          />

          <div className="form-group">
            <label>Admin Password</label>
            <div style={{ position: "relative" }}>
              <Lock
                size={17}
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  color: "var(--text-muted)",
                }}
              />
              <input
                className={`form-control ${errors.password ? "is-invalid" : ""}`}
                style={{ paddingLeft: 38, paddingRight: 40 }}
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter your admin password"
                value={values.password}
                onChange={onChange}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                }}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <div className="form-error">{errors.password}</div>}
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <Button type="submit" size="block" loading={loading}>
            {loading ? "Signing in..." : "Admin Sign In"}
          </Button>
        </form>

        <div className="auth-foot">
          Not an administrator? <Link to="/login">Back to user sign in</Link>
        </div>
      </div>
    </div>
  );
}
