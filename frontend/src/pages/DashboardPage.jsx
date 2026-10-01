import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav>
          <Link to="/profile">Business profile</Link>
          <button className="text-button" onClick={handleLogout}>Sign out</button>
        </nav>
      </header>
      <section className="dashboard-card">
        <p className="eyebrow">Workspace</p>
        <h1>Welcome, {user.firstName}</h1>
        <p className="muted">{user.email}</p>
        <div className="pill-row">
          {user.roles.map((role) => <span key={role}>{role}</span>)}
        </div>
        <p className="dashboard-note">
          Your account is ready. Procurement requests, quotations, and orders will appear here as those modules are added.
        </p>
        <Link className="primary-button button-link" to="/profile">Review your business profile</Link>
      </section>
    </main>
  );
}

export default DashboardPage;
