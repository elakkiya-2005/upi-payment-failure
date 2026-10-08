import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, User, Mail, Phone, Lock, Eye, EyeOff } from "lucide-react";
import Button from "../components/Button";
import { TextInput } from "../components/FormInputs";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (e) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!values.name.trim()) e.name = "Full name is required";
    if (!values.email) e.email = "Email is required";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email))
      e.email = "Enter a valid email address";
    if (!values.phone) e.phone = "Phone number is required";
    else if (!/^[6-9]\d{9}$/.test(values.phone))
      e.phone = "Enter a valid 10-digit Indian mobile number";
    if (!values.password) e.password = "Password is required";
    else if (values.password.length < 6)
      e.password = "Password must be at least 6 characters";
    if (!values.confirmPassword) e.confirmPassword = "Please confirm your password";
    else if (values.confirmPassword !== values.password)
      e.confirmPassword = "Passwords do not match";
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
      // Creates a real account, then signs that same account in.
      const account = await register({
        name: values.name,
        email: values.email,
        phone: values.phone,
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
          <h1>Create your account</h1>
          <p>Start protecting your UPI transactions today</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <TextInput
            label="Full Name"
            name="name"
            type="text"
            placeholder="Your full name"
            icon={User}
            value={values.name}
            onChange={onChange}
            error={errors.name}
            autoComplete="name"
          />

          <div className="form-row">
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
            <TextInput
              label="Mobile Number"
              name="phone"
              type="tel"
              placeholder="9876543210"
              icon={Phone}
              value={values.phone}
              onChange={onChange}
              error={errors.phone}
              autoComplete="tel"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Password</label>
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
                  placeholder="Min 6 characters"
                  value={values.password}
                  onChange={onChange}
                  autoComplete="new-password"
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

            <TextInput
              label="Confirm Password"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter password"
              icon={Lock}
              value={values.confirmPassword}
              onChange={onChange}
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
          </div>

          {formError && <div className="form-error">{formError}</div>}

          <Button type="submit" size="block" loading={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}