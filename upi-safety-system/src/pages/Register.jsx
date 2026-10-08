import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/layout/AuthLayout';
import FormField from '../components/common/FormField';
import Button from '../components/common/Button';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const errs = {};

    if (!form.name) {
      errs.name = 'Full name is required';
    } else if (form.name.trim().length < 3) {
      errs.name = 'Name must be at least 3 characters';
    }

    if (!form.email) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Enter a valid email address';
    }

    if (!form.mobile) {
      errs.mobile = 'Mobile number is required';
    } else if (!/^[0-9]{10}$/.test(form.mobile)) {
      errs.mobile = 'Enter a valid 10-digit mobile number';
    }

    if (!form.password) {
      errs.password = 'Password is required';
    } else if (form.password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }

    if (form.confirmPassword !== form.password) {
      errs.confirmPassword = 'Passwords do not match';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    // Simulate a registration request
    setTimeout(() => {
      navigate('/login');
    }, 900);
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register to start using the UPI Transaction Failure Prevention and Smart Recovery System."
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Full Name"
          name="name"
          placeholder="e.g. Rahul Sharma"
          value={form.name}
          onChange={handleChange}
          error={errors.name}
          required
        />

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
          label="Mobile Number"
          name="mobile"
          type="tel"
          placeholder="9876543210"
          value={form.mobile}
          onChange={handleChange}
          error={errors.mobile}
          required
        />

        <FormField
          label="Password"
          name="password"
          type="password"
          placeholder="Create a password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          required
        />

        <FormField
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          placeholder="Re-enter your password"
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          required
        />

        <label className="checkbox-label terms">
          <input type="checkbox" required /> I agree to the Terms of Service and Privacy Policy
        </label>

        <Button type="submit" variant="primary" size="lg" className="w-100" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </AuthLayout>
  );
}