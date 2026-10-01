import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { catalogApi } from '../api/catalogApi';
import { purchaseRequestApi } from '../api/purchaseRequestApi';

function defaultDeliveryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function PurchaseRequestCreatePage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [form, setForm] = useState({
    title: '',
    requiredDeliveryDate: defaultDeliveryDate(),
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    catalogApi.getProducts({ page: 1, limit: 100, sort: 'name' })
      .then((result) => setProducts(result.data))
      .catch((requestError) => {
        setError(requestError.response?.data?.error?.message || 'Could not load products');
      })
      .finally(() => setIsLoading(false));
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function toggleProduct(productId, checked) {
    setQuantities((current) => {
      const next = { ...current };
      if (checked) next[productId] = next[productId] || '1';
      else delete next[productId];
      return next;
    });
  }

  function setQuantity(productId, value) {
    setQuantities((current) => ({ ...current, [productId]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const items = Object.entries(quantities).map(([productId, quantity]) => ({
      productId,
      quantity: Number(quantity),
    }));
    if (!items.length) {
      setError('Select at least one product.');
      return;
    }
    if (items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
      setError('Each selected product must have a whole-number quantity of at least 1.');
      return;
    }

    setIsSubmitting(true);
    try {
      const purchaseRequest = await purchaseRequestApi.create({
        title: form.title,
        requiredDeliveryDate: form.requiredDeliveryDate,
        deliveryLocation: {
          address: form.address,
          city: form.city,
          ...(form.state && { state: form.state }),
          country: form.country,
          ...(form.postalCode && { postalCode: form.postalCode }),
        },
        notes: form.notes || null,
        items,
      });
      navigate(`/purchase-requests/${purchaseRequest.id}`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not create purchase request');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to="/purchase-requests">My requests</Link><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card request-card">
        <p className="eyebrow">Buyer workspace</p>
        <h1>Create purchase request</h1>
        <p className="muted">Suppliers with active listings and enough available stock for every requested item can respond.</p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>Request title<input name="title" value={form.title} onChange={updateField} required minLength={3} maxLength={200} /></label>
          <label>Required delivery date<input name="requiredDeliveryDate" type="date" value={form.requiredDeliveryDate} onChange={updateField} required min={new Date().toISOString().slice(0, 10)} /></label>
          <fieldset className="product-picker">
            <legend>Requested products and quantities</legend>
            {isLoading && <p className="muted">Loading products…</p>}
            {!isLoading && products.length === 0 && <p className="muted">No active catalog products are available.</p>}
            {products.map((product) => {
              const selected = Object.hasOwn(quantities, product.id);
              return (
                <div className="request-product-row" key={product.id}>
                  <label className="product-checkbox">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleProduct(product.id, event.target.checked)}
                    />
                    <span>{product.name} <small>({product.sku})</small></span>
                  </label>
                  <label className="quantity-field">
                    Quantity
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={!selected}
                      value={quantities[product.id] || ''}
                      onChange={(event) => setQuantity(product.id, event.target.value)}
                    />
                  </label>
                </div>
              );
            })}
          </fieldset>
          <fieldset className="product-picker">
            <legend>Delivery location</legend>
            <label>Address<input name="address" value={form.address} onChange={updateField} required maxLength={300} /></label>
            <div className="form-grid">
              <label>City<input name="city" value={form.city} onChange={updateField} required maxLength={100} /></label>
              <label>State / region<input name="state" value={form.state} onChange={updateField} maxLength={100} /></label>
              <label>Country<input name="country" value={form.country} onChange={updateField} required maxLength={100} /></label>
              <label>Postal code<input name="postalCode" value={form.postalCode} onChange={updateField} maxLength={32} /></label>
            </div>
          </fieldset>
          <label>Notes<textarea name="notes" value={form.notes} onChange={updateField} maxLength={5000} rows={4} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={isLoading || isSubmitting || products.length === 0}>
            {isSubmitting ? 'Creating request…' : 'Create purchase request'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default PurchaseRequestCreatePage;
