import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orderApi } from '../api/orderApi';

function PurchaseOrderDetailPage({ supplierView = false }) {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const listPath = supplierView ? '/supplier/orders' : '/purchase-orders';

  useEffect(() => {
    let active = true;
    orderApi.get(id)
      .then((result) => {
        if (active) setOrder(result);
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.error?.message || 'Could not load purchase order');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleTransition(event) {
    event.preventDefault();
    if (!nextStatus) return;
    setError('');
    setIsSaving(true);
    try {
      await orderApi.transition(id, { status: nextStatus, reason: reason || null });
      setOrder(await orderApi.get(id));
      setNextStatus('');
      setReason('');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not update purchase order');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to={listPath}>Back to orders</Link><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card request-card">
        {isLoading && <p className="muted">Loading purchase order…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {order && (
          <>
            <p className="eyebrow">{order.order_number} · {order.status}</p>
            <h1>{order.request_title}</h1>
            <p className="muted">
              Buyer: {order.buyer_business_name} · Supplier: {order.supplier_business_name}
            </p>
            <p>
              Total: <strong>{order.currency} {order.subtotal}</strong>
              {' · Expected delivery '}
              {new Date(`${order.expected_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}
            </p>
            <section className="request-detail-section">
              <h2>Delivery location</h2>
              <p>
                {order.delivery_location.address}<br />
                {order.delivery_location.city}
                {order.delivery_location.state && `, ${order.delivery_location.state}`}<br />
                {order.delivery_location.country}
              </p>
              {order.buyer_notes && <p>Buyer notes: {order.buyer_notes}</p>}
            </section>
            <section className="request-detail-section">
              <h2>Items</h2>
              <div className="request-items-table">
                {order.items.map((item) => (
                  <div className="request-item" key={item.id}>
                    <div>
                      <strong>{item.product_name} × {item.quantity}</strong>
                      <small>{item.product_sku}</small>
                    </div>
                    <span>{order.currency} {item.unit_price} each · {order.currency} {item.line_total}</span>
                  </div>
                ))}
              </div>
            </section>
            {order.allowed_transitions.length > 0 && (
              <section className="request-detail-section">
                <h2>Update order status</h2>
                <form className="form-stack" onSubmit={handleTransition}>
                  <label>Next status
                    <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} required>
                      <option value="" disabled>Select allowed transition</option>
                      {order.allowed_transitions.map((status) => (
                        <option value={status} key={status}>{status.replaceAll('_', ' ')}</option>
                      ))}
                    </select>
                  </label>
                  <label>Reason or update (optional)
                    <textarea rows="2" maxLength="2000" value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  <button className="primary-button" disabled={isSaving || !nextStatus}>
                    {isSaving ? 'Saving…' : 'Record transition'}
                  </button>
                </form>
              </section>
            )}
            <section className="request-detail-section">
              <h2>Order history</h2>
              <ol className="order-audit-list">
                {order.audit.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.from_status.replaceAll('_', ' ')} → {entry.to_status.replaceAll('_', ' ')}</strong>
                    <small>
                      {new Date(entry.created_at).toLocaleString()} · {entry.actor_role}
                      {entry.reason && ` · ${entry.reason}`}
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default PurchaseOrderDetailPage;
