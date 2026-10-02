import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import NotificationCenter from './NotificationCenter';
import { useToast } from './ToastProvider';

const navigation = {
  BUYER: [
    ['Dashboard', '/dashboard'],
    ['Products', '/products'],
    ['Suppliers', '/suppliers'],
    ['Create request', '/purchase-requests/new'],
    ['My requests', '/purchase-requests'],
    ['Orders', '/purchase-orders'],
    ['Invoices & payments', '/invoices'],
    ['Disputes', '/disputes'],
    ['Profile', '/profile'],
  ],
  SUPPLIER: [
    ['Dashboard', '/dashboard'],
    ['Products', '/supplier/products'],
    ['Inventory', '/inventory'],
    ['Purchase requests', '/supplier/requests'],
    ['Quotations', '/supplier/quotations'],
    ['Orders', '/supplier/orders'],
    ['Shipments', '/supplier/shipments'],
    ['Invoices', '/invoices'],
    ['Analytics', '/supplier/analytics'],
    ['Disputes', '/supplier/disputes'],
    ['Profile', '/profile'],
  ],
  ADMIN: [
    ['Dashboard', '/dashboard'],
    ['Users', '/admin/users'],
    ['Suppliers', '/admin/suppliers'],
    ['Categories & products', '/admin/catalog'],
    ['Orders', '/admin/orders'],
    ['Disputes', '/admin/disputes'],
    ['Audit logs', '/admin/audit-logs'],
    ['Analytics', '/admin/analytics'],
  ],
};

function AppShell() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const toast = useToast();
  const navigate = useNavigate();
  const role = user.roles.includes('ADMIN') ? 'ADMIN'
    : user.roles.includes('SUPPLIER') ? 'SUPPLIER' : 'BUYER';

  async function signOut() {
    try {
      await logout();
    } catch (error) {
      toast(error.response?.data?.error?.message || 'Could not complete sign out', 'error');
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <NavLink className="brand" to="/dashboard">ProcureHub</NavLink>
        <div className="workspace-role">{role.toLowerCase()} workspace</div>
        <nav aria-label={`${role.toLowerCase()} navigation`}>
          {navigation[role].map(([label, path]) => (
            <NavLink key={path} to={path} end={path === '/dashboard'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{user.firstName} {user.lastName}</span>
          <small>{user.email}</small>
          <button className="text-button" type="button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div><strong>{role.charAt(0) + role.slice(1).toLowerCase()} workspace</strong></div>
          <div className="topbar-actions">
            <NotificationCenter />
            <NavLink to="/notifications">All notifications</NavLink>
            <NavLink to="/profile">My profile</NavLink>
          </div>
        </header>
        <main className="workspace-content"><Outlet /></main>
      </div>
    </div>
  );
}

export default AppShell;
