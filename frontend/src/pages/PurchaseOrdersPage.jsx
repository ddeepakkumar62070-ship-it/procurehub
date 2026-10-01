import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderApi } from '../api/orderApi';

function PurchaseOrdersPage({ supplierView = false }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const listPath = supplierView ? '/supplier/orders' : '/purchase-orders';

  useEffect(() => {
    let active = true;
    orderApi.list()
      .then((result) => {
        if (active) setOrders(result.data);
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
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card request-card">
        <p className="eyebrow">Order management</p>
        <h1>Purchase orders</h1>
        {isLoading && <p className="muted">Loading purchase orders…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {!isLoading && !error && orders.length === 0 && (
          <p className="muted">No purchase orders yet.</p>
        )}
        <div className="request-list">
          {orders.map((order) => (
            <Link
              className="request-list-card"
              key={order.id}
              to={`${listPath}/${order.id}`}
            >
              <div>
                <span className="eyebrow">{order.order_number} · {order.status}</span>
                <h2>{order.request_title}</h2>
                <p className="muted">
                  {supplierView ? order.buyer_business_name : order.supplier_business_name}
                  {' · Expected delivery '}
                  {new Date(`${order.expected_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}
                </p>
              </div>
              <strong>{order.currency} {order.subtotal}</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

export default PurchaseOrdersPage;
