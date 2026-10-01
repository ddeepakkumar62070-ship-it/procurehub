import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalogApi';

function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [newOffer, setNewOffer] = useState({
    productId: '',
    unitPrice: '',
    currency: 'USD',
    leadTimeDays: '',
    totalQuantity: '0',
    reorderLevel: '0',
  });
  const [stockDrafts, setStockDrafts] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);
    setError('');
    try {
      const stock = await catalogApi.getInventory(lowStockOnly);
      setInventory(stock);
      setStockDrafts(Object.fromEntries(stock.map((item) => [item.supplier_product_id, {
        totalQuantity: item.total_quantity,
        reorderLevel: item.reorder_level,
      }])));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not load inventory');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [lowStockOnly]);

  useEffect(() => {
    catalogApi.getProducts({ page: 1, limit: 100, sort: 'name' }).then((catalog) => {
      setCatalogProducts(catalog.data);
      if (catalog.data[0]) {
        setNewOffer((current) => ({ ...current, productId: catalog.data[0].id }));
      }
    }).catch((requestError) => {
      setError(requestError.response?.data?.error?.message || 'Could not load catalog products');
    });
  }, []);

  function updateStockDraft(id, field, value) {
    setStockDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  }

  async function handleStockSave(item) {
    setError('');
    setMessage('');
    try {
      await catalogApi.updateInventory(item.supplier_product_id, {
        totalQuantity: Number(stockDrafts[item.supplier_product_id].totalQuantity),
        reorderLevel: Number(stockDrafts[item.supplier_product_id].reorderLevel),
      });
      setMessage(`${item.product_name} inventory updated.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not update inventory');
    }
  }

  async function handleOfferCreate(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await catalogApi.createSupplierProduct({
        productId: newOffer.productId,
        unitPrice: Number(newOffer.unitPrice),
        currency: newOffer.currency,
        leadTimeDays: newOffer.leadTimeDays === '' ? null : Number(newOffer.leadTimeDays),
        totalQuantity: Number(newOffer.totalQuantity),
        reorderLevel: Number(newOffer.reorderLevel),
      });
      setMessage('Product listing created with inventory.');
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not create product listing');
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to="/catalog">Browse catalog</Link><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card inventory-card">
        <p className="eyebrow">Supplier workspace</p>
        <h1>Inventory management</h1>
        <p className="muted">Available stock is derived from total stock less reservations. Reserved quantities cannot be edited here.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="success-message" role="status">{message}</p>}

        <h2>List a catalog product</h2>
        <form className="catalog-filters offer-form" onSubmit={handleOfferCreate}>
          <label>Product
            <select required value={newOffer.productId} onChange={(event) => setNewOffer({ ...newOffer, productId: event.target.value })}>
              <option value="" disabled>Select a product</option>
              {catalogProducts.map((product) => (
                <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
              ))}
            </select>
          </label>
          <label>Unit price<input type="number" min="0" step="0.01" required value={newOffer.unitPrice} onChange={(event) => setNewOffer({ ...newOffer, unitPrice: event.target.value })} /></label>
          <label>Currency<input required minLength={3} maxLength={3} value={newOffer.currency} onChange={(event) => setNewOffer({ ...newOffer, currency: event.target.value.toUpperCase() })} /></label>
          <label>Lead time (days)<input type="number" min="0" value={newOffer.leadTimeDays} onChange={(event) => setNewOffer({ ...newOffer, leadTimeDays: event.target.value })} /></label>
          <label>Initial total quantity<input type="number" min="0" required value={newOffer.totalQuantity} onChange={(event) => setNewOffer({ ...newOffer, totalQuantity: event.target.value })} /></label>
          <label>Low-stock threshold<input type="number" min="0" required value={newOffer.reorderLevel} onChange={(event) => setNewOffer({ ...newOffer, reorderLevel: event.target.value })} /></label>
          <button className="primary-button">Create listing</button>
        </form>

        <div className="inventory-heading">
          <h2>Your stock</h2>
          <label className="toggle-label">
            <input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} />
            Show low-stock only
          </label>
        </div>
        {isLoading && <p className="muted">Loading inventory…</p>}
        {!isLoading && inventory.length === 0 && <p className="muted">No inventory records match this view yet.</p>}
        <div className="inventory-list">
          {inventory.map((item) => (
            <article className="inventory-row" key={item.supplier_product_id}>
              <div>
                <h3>{item.product_name}</h3>
                <p className="muted">SKU {item.sku} · reserved {item.reserved_quantity}</p>
                <span className={item.is_low_stock ? 'stock-warning' : 'stock-ok'}>
                  {item.is_low_stock ? 'Low stock' : 'Stock healthy'}
                </span>
              </div>
              <label>Total stock
                <input
                  type="number"
                  min={item.reserved_quantity}
                  value={stockDrafts[item.supplier_product_id]?.totalQuantity ?? item.total_quantity}
                  onChange={(event) => updateStockDraft(item.supplier_product_id, 'totalQuantity', event.target.value)}
                />
              </label>
              <label>Reorder at
                <input
                  type="number"
                  min="0"
                  value={stockDrafts[item.supplier_product_id]?.reorderLevel ?? item.reorder_level}
                  onChange={(event) => updateStockDraft(item.supplier_product_id, 'reorderLevel', event.target.value)}
                />
              </label>
              <div>
                <strong>{item.available_quantity}</strong>
                <small> available</small>
              </div>
              <button className="secondary-button" onClick={() => handleStockSave(item)}>Save stock</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default InventoryPage;
