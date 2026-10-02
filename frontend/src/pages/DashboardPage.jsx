import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi } from '../api/analyticsApi';
import { adminApi } from '../api/adminApi';
import { orderApi } from '../api/orderApi';
import { purchaseRequestApi } from '../api/purchaseRequestApi';
import { quotationApi } from '../api/quotationApi';
import { useAuthStore } from '../store/authStore';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/PageStates';
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
  const [recent, setRecent] = useState({ orders: [], requests: [], quotations: [], disputes: [] });
  const [recentError, setRecentError] = useState('');
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    analyticsApi.mine().then(setMetrics)
      .catch((requestError) => setError(requestError.response?.data?.error?.message || 'Could not load workspace metrics'));
    const requests = role === 'BUYER'
      ? purchaseRequestApi.listMine({ page: 1, limit: 5 })
      : role === 'SUPPLIER'
        ? purchaseRequestApi.listEligible({ page: 1, limit: 5 })
        : adminApi.disputes({ page: 1, limit: 5 });
    const orders = role === 'ADMIN'
      ? adminApi.orders({ page: 1, limit: 5 })
      : orderApi.list({ page: 1, limit: 5 });
    const quotations = role === 'SUPPLIER'
      ? quotationApi.listMine({ page: 1, limit: 5 })
      : Promise.resolve(null);
    Promise.allSettled([orders, requests, quotations]).then(([orderResult, requestResult, quotationResult]) => {
      const failures = [orderResult, requestResult, quotationResult]
        .filter((result) => result.status === 'rejected');
      if (failures.length) setRecentError('Some recent activity could not be loaded.');
      setRecent({
        orders: orderResult.status === 'fulfilled' ? orderResult.value.data : [],
        requests: role !== 'ADMIN' && requestResult.status === 'fulfilled' ? requestResult.value.data : [],
        quotations: role === 'SUPPLIER' && quotationResult.status === 'fulfilled' ? quotationResult.value.data : [],
        disputes: role === 'ADMIN' && requestResult.status === 'fulfilled' ? requestResult.value.data : [],
      });
      setRecentLoading(false);
    });
  }, [role]);

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={`${role.toLowerCase()} workspace`}
        title={`Welcome back, ${user.firstName}`}
        description="A live overview of your procurement work."
      />
      {error && <ErrorState message={error} />}
      {metrics ? <AnalyticsSummary data={metrics} /> : !error && <LoadingState label="Loading workspace metrics…" />}
      <section className="dashboard-section">
        <div className="section-heading"><h2>Recent activity</h2><span className="muted">Latest records across your workspace</span></div>
        {recentError && <p className="inline-notice">{recentError}</p>}
        <div className="dashboard-recent-grid">
          {role === 'BUYER' && <RecentTable
            title="Purchase orders"
            rows={recent.orders}
            loading={recentLoading}
            empty="No recent orders."
            columns={['PO number', 'Supplier', 'Amount', 'Status']}
            renderRow={(order) => <tr key={order.id}>
              <td><Link to={`/purchase-orders/${order.id}`}>{order.order_number}</Link></td>
              <td>{order.supplier_business_name}</td>
              <td>{order.currency} {order.subtotal}</td>
              <td><StatusBadge>{order.status}</StatusBadge></td>
            </tr>}
            href="/purchase-orders"
          />}
          {role === 'BUYER' && <RecentTable
            title="Purchase requests"
            rows={recent.requests}
            loading={recentLoading}
            empty="No recent requests."
            columns={['Request', 'Items', 'Required by', 'Status']}
            renderRow={(item) => <tr key={item.id}>
              <td><Link to={`/purchase-requests/${item.id}`}>{item.request_number}</Link><small className="table-subtext">{item.title}</small></td>
              <td>{item.item_count}</td>
              <td>{new Date(`${item.required_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}</td>
              <td><StatusBadge>{item.status}</StatusBadge></td>
            </tr>}
            href="/purchase-requests"
          />}
          {role === 'SUPPLIER' && <RecentTable
            title="Purchase orders"
            rows={recent.orders}
            loading={recentLoading}
            empty="No recent orders."
            columns={['PO number', 'Buyer', 'Amount', 'Status']}
            renderRow={(order) => <tr key={order.id}>
              <td><Link to={`/supplier/orders/${order.id}`}>{order.order_number}</Link></td>
              <td>{order.buyer_business_name}</td>
              <td>{order.currency} {order.subtotal}</td>
              <td><StatusBadge>{order.status}</StatusBadge></td>
            </tr>}
            href="/supplier/orders"
          />}
          {role === 'SUPPLIER' && <RecentTable
            title="Eligible purchase requests"
            rows={recent.requests}
            loading={recentLoading}
            empty="No eligible requests."
            columns={['Request', 'Buyer', 'Items', 'Required by']}
            renderRow={(item) => <tr key={item.id}>
              <td><Link to={`/supplier/requests/${item.id}`}>{item.request_number}</Link><small className="table-subtext">{item.title}</small></td>
              <td>{item.buyer_business_name}</td>
              <td>{item.item_count}</td>
              <td>{new Date(`${item.required_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}</td>
            </tr>}
            href="/supplier/requests"
          />}
          {role === 'SUPPLIER' && <RecentTable
            title="Quotations"
            rows={recent.quotations}
            loading={recentLoading}
            empty="No recent quotations."
            columns={['Quotation', 'Request', 'Total', 'Status']}
            renderRow={(quote) => <tr key={quote.id}>
              <td>{quote.quotation_number}</td>
              <td><Link to={`/supplier/requests/${quote.purchase_request_id}`}>{quote.request_number}</Link><small className="table-subtext">{quote.request_title}</small></td>
              <td>{quote.currency} {quote.subtotal}</td>
              <td><StatusBadge>{quote.status}</StatusBadge></td>
            </tr>}
            href="/supplier/quotations"
          />}
          {role === 'ADMIN' && <RecentTable
            title="Orders"
            rows={recent.orders}
            loading={recentLoading}
            empty="No recent orders."
            columns={['PO number', 'Buyer', 'Supplier', 'Status']}
            renderRow={(order) => <tr key={order.id}>
              <td><Link to={`/admin/orders/${order.id}`}>{order.order_number}</Link></td>
              <td>{order.buyer_business_name}</td>
              <td>{order.supplier_business_name}</td>
              <td><StatusBadge>{order.status}</StatusBadge></td>
            </tr>}
            href="/admin/orders"
          />}
          {role === 'ADMIN' && <RecentTable
            title="Disputes"
            rows={recent.disputes}
            loading={recentLoading}
            empty="No recent disputes."
            columns={['Order', 'Title', 'Status']}
            renderRow={(dispute) => <tr key={dispute.id}>
              <td>{dispute.order_number}</td>
              <td>{dispute.title}</td>
              <td><StatusBadge>{dispute.status}</StatusBadge></td>
            </tr>}
            href="/admin/disputes"
          />}
        </div>
      </section>
      <section className="dashboard-section">
        <div className="section-heading"><h2>Quick access</h2><span className="muted">Common tasks</span></div>
        <div className="quick-links">{shortcuts[role].map(([label, path]) => (
          <Link to={path} key={path}>{label}<span aria-hidden="true">→</span></Link>
        ))}</div>
      </section>
    </section>
  );
}

function RecentTable({ title, rows, empty, columns, renderRow, href, loading }) {
  return (
    <section className="recent-panel">
      <div className="section-heading">
        <h3>{title}</h3>
        <Link to={href}>View all</Link>
      </div>
      {loading ? <LoadingState label="Loading recent records…" />
        : rows.length === 0
        ? <EmptyState title={empty} />
        : <div className="table-scroll"><table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row) => renderRow(row))}</tbody>
        </table></div>}
    </section>
  );
}

export default DashboardPage;
