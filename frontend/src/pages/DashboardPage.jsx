import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../api/analyticsApi';
import { useAuthStore } from '../store/authStore';
import { ErrorState, LoadingState, PageHeader } from '../components/PageStates';
import { AnalyticsSummary } from './WorkspacePages';

const shortcuts = {
  BUYER: [
    ['Browse products', '/products'],
    ['Find suppliers', '/suppliers'],
    ['Create purchase request', '/purchase-requests/new'],
    ['Review requests', '/purchase-requests'],
    ['View orders', '/purchase-orders'],
    ['Invoices & payments', '/invoices'],
  ],
  SUPPLIER: [
    ['Manage product offers', '/supplier/products'],
    ['Update inventory', '/inventory'],
    ['Eligible requests', '/supplier/requests'],
    ['Manage orders', '/supplier/orders'],
    ['Shipment tracking', '/supplier/shipments'],
    ['Analytics', '/supplier/analytics'],
  ],
  ADMIN: [
    ['Manage users', '/admin/users'],
    ['Supplier verification', '/admin/suppliers'],
    ['Categories & products', '/admin/catalog'],
    ['Monitor orders', '/admin/orders'],
    ['Review disputes', '/admin/disputes'],
    ['Audit logs', '/admin/audit-logs'],
  ],
};

function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const role = user.roles.includes('ADMIN') ? 'ADMIN' : user.roles.includes('SUPPLIER') ? 'SUPPLIER' : 'BUYER';
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    analyticsApi.mine().then(setMetrics)
      .catch((requestError) => setError(requestError.response?.data?.error?.message || 'Could not load workspace metrics'));
  }, []);

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={`${role.toLowerCase()} workspace`}
        title={`Welcome back, ${user.firstName}`}
        description="A live overview of your procurement work."
      />
      {error && <ErrorState message={error} />}
      {metrics ? <AnalyticsSummary data={metrics} /> : !error && <LoadingState label="Loading workspace metrics…" />}
      <h2>Quick access</h2>
      <div className="entity-grid">{shortcuts[role].map(([label, path]) => (
        <Link className="entity-card shortcut-card" to={path} key={path}>
          <strong>{label}</strong><span aria-hidden="true">→</span>
        </Link>
      ))}</div>
    </section>
  );
}

export default DashboardPage;
