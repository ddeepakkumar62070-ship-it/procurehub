import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orderApi } from '../api/orderApi';
import { invoiceApi } from '../api/invoiceApi';
import { supplierApi } from '../api/supplierApi';

function PurchaseOrderDetailPage({ supplierView = false }) {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewInfo, setReviewInfo] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [isReviewSaving, setIsReviewSaving] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
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

  useEffect(() => {
    if (supplierView) return undefined;
    let active = true;
    supplierApi.getOrderReview(id)
      .then((result) => { if (active) setReviewInfo(result); })
      .catch(() => { if (active) setReviewInfo(null); });
    return () => { active = false; };
  }, [id, supplierView]);

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

  async function handlePayment() {
    if (!order?.payment?.can_pay) return;
    setError('');
    setIsSaving(true);
    try {
      await invoiceApi.pay(order.payment.invoice_id);
      setOrder(await orderApi.get(id));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not record payment');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReview(event) {
    event.preventDefault();
    setError('');
    setReviewMessage('');
    setIsReviewSaving(true);
    try {
      await supplierApi.createOrderReview(id, { rating: Number(reviewRating), ...(reviewText.trim() && { review: reviewText.trim() }) });
      setReviewInfo(await supplierApi.getOrderReview(id));
      setReviewText('');
      setReviewMessage('Supplier review submitted.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not submit supplier review');
    } finally {
      setIsReviewSaving(false);
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
            {order.payment && <p>
              Payment: <strong>{order.payment.status.replaceAll('_', ' ')}</strong>
              {' · '}{order.currency} {order.payment.amount_paid} / {order.payment.total}
            </p>}
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
            <div className={`request-detail-grid order-detail-grid${order.allowed_transitions.length ? '' : ' order-detail-grid-single'}`}>
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
            </div>
            {order.payment?.can_pay && <section className="request-detail-section">
              <h2>Payment</h2>
              <button className="primary-button" type="button" disabled={isSaving} onClick={handlePayment}>
                {isSaving ? 'Processing…' : 'Pay invoice'}
              </button>
            </section>}
            {!supplierView && reviewInfo?.eligible && <section className="request-detail-section">
              <h2>Rate supplier</h2>
              {reviewInfo.review ? (
                <p><strong>{'★'.repeat(reviewInfo.review.rating)}{'☆'.repeat(5 - reviewInfo.review.rating)}</strong>{reviewInfo.review.review && ` · ${reviewInfo.review.review}`}</p>
              ) : (
                <form className="form-stack" onSubmit={handleReview}>
                  <label>Rating
                    <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)}>
                      {[5, 4, 3, 2, 1].map((rating) => <option value={rating} key={rating}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)} ({rating}/5)</option>)}
                    </select>
                  </label>
                  <label>Write a review (optional)
                    <textarea rows="3" maxLength="2000" value={reviewText} onChange={(event) => setReviewText(event.target.value)} />
                  </label>
                  <button className="primary-button" disabled={isReviewSaving}>{isReviewSaving ? 'Submitting…' : 'Submit review'}</button>
                </form>
              )}
              {reviewMessage && <p className="success-message" role="status">{reviewMessage}</p>}
            </section>}
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
