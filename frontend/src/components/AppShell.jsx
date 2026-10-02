import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import NotificationCenter from './NotificationCenter';
import { useToast } from './ToastProvider';

const navigation = {
  BUYER: [
    ['Workspace', [
      ['Overview', '/dashboard'],
      ['Products', '/products'],
      ['Suppliers', '/suppliers'],
    ]],
    ['Procurement', [
      ['New request', '/purchase-requests/new'],
      ['My requests', '/purchase-requests'],
      ['Purchase orders', '/purchase-orders'],
    ]],
    ['Finance & support', [
      ['Invoices & payments', '/invoices'],
      ['Disputes', '/disputes'],
    ]],
    ['Account', [['Profile', '/profile']]],
  ],
  SUPPLIER: [
    ['Workspace', [
      ['Overview', '/dashboard'],
      ['Analytics', '/supplier/analytics'],
    ]],
    ['Catalog & inventory', [
      ['Products & offers', '/supplier/products'],
      ['Inventory', '/inventory'],
    ]],
    ['Procurement', [
      ['Purchase requests', '/supplier/requests'],
      ['Quotations', '/supplier/quotations'],
      ['Orders', '/supplier/orders'],
      ['Shipments', '/supplier/shipments'],
    ]],
    ['Finance & support', [
      ['Invoices', '/invoices'],
      ['Disputes', '/supplier/disputes'],
    ]],
    ['Account', [['Profile', '/profile']]],
  ],
  ADMIN: [
    ['Workspace', [
      ['Overview', '/dashboard'],
      ['Analytics', '/admin/analytics'],
    ]],
    ['Platform', [
      ['Users', '/admin/users'],
      ['Suppliers', '/admin/suppliers'],
      ['Categories & products', '/admin/catalog'],
    ]],
    ['Operations', [
      ['Orders', '/admin/orders'],
      ['Disputes', '/admin/disputes'],
      ['Audit logs', '/admin/audit-logs'],
    ]],
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
    <div className="workspace app-shell">
      <aside className="sidebar app-sidebar">
        <NavLink className="brand" to="/dashboard">ProcureHub</NavLink>
        <div className="workspace-role">{role.toLowerCase()} workspace</div>
        <nav aria-label={`${role.toLowerCase()} navigation`}>
          {navigation[role].map(([group, links]) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-title">{group}</span>
              {links.map(([label, path]) => (
                <NavLink key={path} to={path} end={path === '/dashboard'}>
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{user.firstName} {user.lastName}</span>
          <small>{user.email}</small>
          <button className="text-button" type="button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="workspace-main app-main">
        <header className="workspace-topbar app-topbar">
          <div><strong>{role.charAt(0) + role.slice(1).toLowerCase()} workspace</strong></div>
          <div className="topbar-actions">
            <NotificationCenter />
            <NavLink to="/notifications">All notifications</NavLink>
            <NavLink to="/profile">My profile</NavLink>
          </div>
        </header>
        <div className="workspace-content page-content"><Outlet /></div>
      </div>
    </div>
  );
}

export default AppShell;
