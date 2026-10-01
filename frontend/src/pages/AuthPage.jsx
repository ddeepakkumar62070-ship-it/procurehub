import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'BUYER',
    businessName: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(form);
      } else {
        await login({ email: form.email, password: form.password });
      }
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message
        || requestError.message
        || 'Unable to complete your request'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <Link className="brand" to="/">ProcureHub</Link>
        <p className="eyebrow">Procurement workspace</p>
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">
          {isRegister
            ? 'Set up your buyer or supplier workspace.'
            : 'Sign in to manage your procurement workspace.'}
        </p>

        <form onSubmit={handleSubmit} className="form-stack">
          {isRegister && (
            <div className="form-grid">
              <label>
                First name
                <input name="firstName" value={form.firstName} onChange={updateField} required maxLength={100} />
              </label>
              <label>
                Last name
                <input name="lastName" value={form.lastName} onChange={updateField} required maxLength={100} />
              </label>
            </div>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 12 : 1}
              value={form.password}
              onChange={updateField}
              required
            />
            {isRegister && <small>Use at least 12 characters.</small>}
          </label>
          {isRegister && (
            <>
              <label>
                Account type
                <select name="role" value={form.role} onChange={updateField}>
                  <option value="BUYER">Buyer</option>
                  <option value="SUPPLIER">Supplier</option>
                </select>
              </label>
              <label>
                Business name
                <input name="businessName" value={form.businessName} onChange={updateField} required minLength={2} maxLength={200} />
              </label>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="form-footer">
          {isRegister ? 'Already have an account?' : 'New to ProcureHub?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Sign in' : 'Create account'}
          </Link>
        </p>
      </section>
    </main>
  );
}

export default AuthPage;
