import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderApi } from '../api/orderApi';
import { EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge } from '../components/PageStates';

function PurchaseOrdersPage({ supplierView = false }) {
  const [result, setResult] = useState({ data: [], page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const listPath = supplierView ? '/supplier/orders' : '/purchase-orders';

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    orderApi.list({ page, limit: 10, ...(status && { status }) })
      .then((result) => {
        if (active) setResult(result);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.error?.message || 'Could not load purchase orders');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, status]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card request-card">
        <PageHeader eyebrow={supplierView ? 'Supplier workspace' : 'Buyer workspace'} title="Purchase orders" description="Track procurement commitments, delivery dates, and current status." />
        <div className="toolbar-filters">
        <label className="filter-control">Status
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'PO_CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        </div>
        {error && <ErrorState message={error} />}
        {isLoading ? <LoadingState label="Loading purchase orders…" />
          : result.data.length === 0 ? <EmptyState title="No purchase orders found" description="Try another status or create a purchase request." />
            : null}
        {!isLoading && result.data.length > 0 && <div className="table-scroll">
          <table><thead><tr><th>PO number</th><th>Request</th><th>{supplierView ? 'Buyer' : 'Supplier'}</th><th>Amount</th><th>Status</th><th>Expected delivery</th><th>Action</th></tr></thead>
            <tbody>{result.data.map((order) => (
              <tr key={order.id}>
                <td><Link to={`${listPath}/${order.id}`}>{order.order_number}</Link></td>
                <td>{order.request_title}</td>
                <td>{supplierView ? order.buyer_business_name : order.supplier_business_name}</td>
                <td>{order.currency} {order.subtotal}</td>
                <td><StatusBadge>{order.status}</StatusBadge></td>
                <td>{order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString() : 'Not scheduled'}</td>
                <td><Link to={`${listPath}/${order.id}`}>View order</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
        <Pagination page={page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} isLoading={isLoading} />
      </section>
    </main>
  );
}

export default PurchaseOrdersPage;
