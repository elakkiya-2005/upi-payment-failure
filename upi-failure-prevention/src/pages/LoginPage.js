import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Mail, Lock, Eye, EyeOff } from "lucide-react";
import Button from "../components/Button";
import { TextInput } from "../components/FormInputs";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [values, setValues] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!values.email) e.email = "Email is required";
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
      // Stores the account in localStorage and in auth state before navigating.
      const account = await login({
        email: values.email,
        password: values.password,
      });
      navigate(account.role === "admin" ? "/admin" : "/dashboard");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-head">
          <span className="brand-logo">
            <ShieldCheck />
          </span>
          <h1>Welcome back</h1>
          <p>Sign in to access your UPI risk dashboard</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <TextInput
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@example.com"
            icon={Mail}
            value={values.email}
            onChange={onChange}
            error={errors.email}
            autoComplete="email"
          />

          <div className="form-group">
            <div className="password-hint">
              <label>Password</label>
              <a href="#forgot" onClick={(e) => e.preventDefault()}>
                Forgot password?
              </a>
            </div>
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
                placeholder="Enter your password"
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
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="auth-foot">
          New here? <Link to="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
}