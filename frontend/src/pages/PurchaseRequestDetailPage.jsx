import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { purchaseRequestApi } from '../api/purchaseRequestApi';
import { useAuthStore } from '../store/authStore';

function PurchaseRequestDetailPage({ supplierView = false }) {
  const user = useAuthStore((state) => state.user);
  const { id } = useParams();
  const [purchaseRequest, setPurchaseRequest] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const backPath = supplierView ? '/supplier/requests' : '/purchase-requests';

  useEffect(() => {
    const load = supplierView
      ? purchaseRequestApi.getEligible(id)
      : purchaseRequestApi.getMine(id);
    load.then(setPurchaseRequest)
      .catch((requestError) => {
        setError(requestError.response?.data?.error?.message || 'Could not load purchase request');
      })
      .finally(() => setIsLoading(false));
  }, [id, supplierView]);

  async function handleCancel() {
    setError('');
    setIsCancelling(true);
    try {
      setPurchaseRequest(await purchaseRequestApi.cancel(id));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not cancel request');
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to={backPath}>Back to requests</Link><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card request-card">
        {isLoading && <p className="muted">Loading request…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {purchaseRequest && (
          <>
            <p className="eyebrow">{purchaseRequest.request_number} · {purchaseRequest.status}</p>
            <h1>{purchaseRequest.title}</h1>
            <p className="muted">
              {supplierView && `${purchaseRequest.buyer_business_name} · `}
              Required by {new Date(`${purchaseRequest.required_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}
            </p>
            <section className="request-detail-section">
              <h2>Requested products</h2>
              <div className="request-items-table">
                {purchaseRequest.items.map((item) => (
                  <div className="request-item" key={item.id}>
                    <div>
                      <strong>{item.product_name}</strong>
                      <small>{item.product_sku}{item.category_name ? ` · ${item.category_name}` : ''}</small>
                    </div>
                    <strong>Quantity: {item.quantity}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="request-detail-section">
              <h2>Delivery location</h2>
              <p>
                {purchaseRequest.delivery_location.address}<br />
                {purchaseRequest.delivery_location.city}
                {purchaseRequest.delivery_location.state && `, ${purchaseRequest.delivery_location.state}`}
                {purchaseRequest.delivery_location.postalCode && ` ${purchaseRequest.delivery_location.postalCode}`}<br />
                {purchaseRequest.delivery_location.country}
              </p>
            </section>
            {purchaseRequest.notes && (
              <section className="request-detail-section">
                <h2>Buyer notes</h2>
                <p>{purchaseRequest.notes}</p>
              </section>
            )}
            {!supplierView && user.roles.includes('BUYER') && purchaseRequest.status === 'OPEN' && (
              <button className="danger-button" disabled={isCancelling} onClick={handleCancel}>
                {isCancelling ? 'Cancelling…' : 'Cancel request'}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default PurchaseRequestDetailPage;
