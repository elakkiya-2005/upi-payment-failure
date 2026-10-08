import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';
import FormField from '../components/common/FormField';
import Button from '../components/common/Button';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function validate() {
    const errs = {};
    if (!form.email) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Enter a valid email address';
    }
    if (!form.password) {
      errs.password = 'Password is required';
    } else if (form.password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    // Simulate a backend login call
    setTimeout(() => {
      // Demo: any valid input logs you in
      navigate('/dashboard');
    }, 900);
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Login to check transaction risk and track your UPI transactions.">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="alert alert-danger">{error}</div>}

        <FormField
          label="Email Address"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          required
        />

        <FormField
          label="Password"
          name="password"
          type="password"
          placeholder="Enter your password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          required
        />

        <div className="auth-row">
          <label className="checkbox-label">
            <input type="checkbox" /> Remember me
          </label>
          <span className="link-muted">Forgot password?</span>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-100" disabled={loading}>
          {loading ? 'Signing in...' : 'Login'}
        </Button>
      </form>

      <p className="auth-switch">
        Don't have an account? <Link to="/register">Create one</Link>
      </p>
    </AuthLayout>
  );
}