import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { purchaseRequestApi } from '../api/purchaseRequestApi';
import { quotationApi } from '../api/quotationApi';
import SupplierQuotationForm from '../components/SupplierQuotationForm';
import { StatusBadge } from '../components/PageStates';
import { useAuthStore } from '../store/authStore';

function PurchaseRequestDetailPage({ supplierView = false }) {
  const user = useAuthStore((state) => state.user);
  const { id } = useParams();
  const [purchaseRequest, setPurchaseRequest] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [quotations, setQuotations] = useState([]);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [quotationError, setQuotationError] = useState('');
  const [quotationBusyId, setQuotationBusyId] = useState('');
  const [quotationNotice, setQuotationNotice] = useState('');
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

  useEffect(() => {
    if (supplierView) return;
    quotationApi.listForRequest(id).then(setQuotations)
      .catch((requestError) => {
        setQuotationError(requestError.response?.data?.error?.message || 'Could not load quotations');
      });
  }, [id, supplierView]);

  async function handleCancel() {
    setError('');
    setIsCancelling(true);
    try {
      setPurchaseRequest(await purchaseRequestApi.cancel(id));
      setQuotations(await quotationApi.listForRequest(id));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not cancel request');
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleQuotationAction(quotationId, action) {
    setQuotationError('');
    setQuotationNotice('');
    setQuotationBusyId(quotationId);
    try {
      if (action === 'accept') {
        const accepted = await quotationApi.accept(quotationId);
        setCreatedOrder(accepted.purchaseOrder);
        setQuotationNotice('Quotation accepted. Other submitted quotations have been rejected.');
      } else {
        await quotationApi.reject(quotationId);
        setQuotationNotice('Quotation rejected.');
      }
      setQuotations(await quotationApi.listForRequest(id));
      setPurchaseRequest(await purchaseRequestApi.getMine(id));
    } catch (requestError) {
      setQuotationError(requestError.response?.data?.error?.message || 'Could not update quotation');
      setQuotations(await quotationApi.listForRequest(id));
    } finally {
      setQuotationBusyId('');
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
            <div className="request-detail-grid">
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
              <aside className="request-detail-aside">
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
              </aside>
            </div>
            {!supplierView && user.roles.includes('BUYER')
              && ['OPEN', 'QUOTATION_RECEIVED'].includes(purchaseRequest.status) && (
              <button className="danger-button" disabled={isCancelling} onClick={handleCancel}>
                {isCancelling ? 'Cancelling…' : 'Cancel request'}
              </button>
            )}
            {supplierView && purchaseRequest.my_quotation_id && (
              <p className="success-message">
                You have already submitted a quotation for this request ({purchaseRequest.my_quotation_status}).
              </p>
            )}
            {supplierView && quotationNotice && (
              <p className="success-message" role="status">{quotationNotice}</p>
            )}
            {supplierView && !purchaseRequest.my_quotation_id && purchaseRequest.status !== 'QUOTATION_ACCEPTED' && (
              <SupplierQuotationForm
                purchaseRequest={purchaseRequest}
                onSubmitted={(quotation) => {
                  setQuotationNotice('Your quotation was submitted.');
                  setPurchaseRequest((current) => ({
                    ...current,
                    status: 'QUOTATION_RECEIVED',
                    my_quotation_id: quotation.id,
                    my_quotation_status: quotation.status,
                  }));
                }}
              />
            )}
            {!supplierView && user.roles.includes('BUYER') && (
              <section className="request-detail-section">
                <h2>Supplier quotations</h2>
                {quotationError && <p className="form-error" role="alert">{quotationError}</p>}
                {quotationNotice && <p className="success-message" role="status">{quotationNotice}</p>}
                {createdOrder && (
                  <p className="success-message">
                    Purchase order {createdOrder.order_number} created.{' '}
                    <Link to={`/purchase-orders/${createdOrder.id}`}>Open order</Link>
                  </p>
                )}
                {!quotations.length && <p className="muted">No quotations received yet.</p>}
                {quotations.length > 0 && <div className="table-scroll comparison-table">
                  <table><thead><tr><th>Supplier</th><th>Price</th><th>Delivery</th><th>Rating</th><th>Valid until</th><th>Items & notes</th><th>Decision</th></tr></thead>
                    <tbody>{quotations.map((quotation) => {
                    const expired = new Date(quotation.valid_until).getTime() <= Date.now();
                    const actionable = quotation.status === 'SUBMITTED' && !expired
                      && purchaseRequest.status !== 'CANCELLED'
                      && purchaseRequest.status !== 'QUOTATION_ACCEPTED';
                    return (
                      <tr key={quotation.id}>
                        <td><strong>{quotation.supplier_business_name}</strong><small className="table-subtext">{quotation.quotation_number} · {[quotation.supplier_city, quotation.supplier_state, quotation.supplier_country].filter(Boolean).join(', ')}</small><small className="table-subtext">{quotation.verification_status}</small></td>
                        <td><strong>{quotation.currency} {quotation.subtotal}</strong></td>
                        <td>{quotation.delivery_time_days} days</td>
                        <td>{quotation.rating_average ? `${quotation.rating_average} / 5 (${quotation.rating_count})` : 'Not yet rated'}</td>
                        <td>{new Date(quotation.valid_until).toLocaleDateString()}<small className="table-subtext"><StatusBadge>{expired && quotation.status === 'SUBMITTED' ? 'EXPIRED' : quotation.status}</StatusBadge></small></td>
                        <td><details><summary>View {quotation.items.length} item(s){quotation.notes ? ' & notes' : ''}</summary>
                          <div className="quote-breakdown">{quotation.items.map((item) => (
                            <div key={item.id}><span>{item.product_name} × {item.quantity}</span><span>{quotation.currency} {item.unit_price} each · {quotation.currency} {item.line_total}</span></div>
                          ))}{quotation.notes && <p>{quotation.notes}</p>}</div>
                        </details></td>
                        <td>
                        {actionable && (
                          <div className="quotation-actions comparison-actions">
                            <button
                              className="primary-button"
                              disabled={quotationBusyId === quotation.id}
                              onClick={() => handleQuotationAction(quotation.id, 'accept')}
                            >
                              Accept quotation
                            </button>
                            <button
                              className="danger-button"
                              disabled={quotationBusyId === quotation.id}
                              onClick={() => handleQuotationAction(quotation.id, 'reject')}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {!actionable && <StatusBadge>{quotation.status}</StatusBadge>}
                        </td>
                      </tr>
                    );
                    })}</tbody>
                  </table>
                </div>}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default PurchaseRequestDetailPage;
