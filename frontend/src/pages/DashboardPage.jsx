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
          <Link to="/catalog">Product catalog</Link>
          <Link to="/profile">Business profile</Link>
          {user.roles.includes('SUPPLIER') && <Link to="/inventory">Inventory</Link>}
          {user.roles.includes('BUYER') && <Link to="/purchase-requests">My requests</Link>}
          {user.roles.includes('BUYER') && <Link to="/purchase-orders">My orders</Link>}
          {user.roles.includes('SUPPLIER') && <Link to="/supplier/requests">Eligible requests</Link>}
          {user.roles.includes('SUPPLIER') && <Link to="/supplier/orders">Supplier orders</Link>}
          {user.roles.includes('ADMIN') && <Link to="/admin/catalog">Manage catalog</Link>}
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
          Your account is ready. Browse supplier listings and manage catalog inventory from this workspace.
        </p>
        <div className="dashboard-actions">
          <Link className="primary-button button-link" to="/catalog">Browse product catalog</Link>
          {user.roles.includes('SUPPLIER') && (
            <Link className="secondary-button button-link" to="/inventory">Manage inventory</Link>
          )}
          {user.roles.includes('ADMIN') && (
            <Link className="secondary-button button-link" to="/admin/catalog">Manage catalog</Link>
          )}
          {user.roles.includes('BUYER') && (
            <Link className="secondary-button button-link" to="/purchase-requests">My purchase requests</Link>
          )}
          {user.roles.includes('BUYER') && (
            <Link className="secondary-button button-link" to="/purchase-orders">Manage purchase orders</Link>
          )}
          {user.roles.includes('SUPPLIER') && (
            <Link className="secondary-button button-link" to="/supplier/requests">View eligible requests</Link>
          )}
          {user.roles.includes('SUPPLIER') && (
            <Link className="secondary-button button-link" to="/supplier/orders">Manage supplier orders</Link>
          )}
          <Link className="secondary-button button-link" to="/profile">Review business profile</Link>
        </div>
      </section>
    </main>
  );
}

export default DashboardPage;
