import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalogApi';
import { purchaseRequestApi } from '../api/purchaseRequestApi';
import { useAuthStore } from '../store/authStore';

function PurchaseRequestsPage() {
  const user = useAuthStore((state) => state.user);
  const isSupplier = user.roles.includes('SUPPLIER');
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    keyword: '',
    category: '',
    deliveryBefore: '',
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    const load = isSupplier
      ? purchaseRequestApi.listEligible({
        page,
        limit: pageSize,
        ...(filters.keyword && { keyword: filters.keyword }),
        ...(filters.category && { category: filters.category }),
        ...(filters.deliveryBefore && { deliveryBefore: filters.deliveryBefore }),
      })
      : purchaseRequestApi.listMine({
        page,
        limit: pageSize,
        ...(filters.status && { status: filters.status }),
      });
    load.then((nextResult) => {
      if (active) setResult(nextResult);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.error?.message || 'Could not load purchase requests');
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [filters, isSupplier, page]);

  useEffect(() => {
    if (!isSupplier) return;
    catalogApi.getCategories().then(setCategories)
      .catch((requestError) => {
        setError(requestError.response?.data?.error?.message || 'Could not load categories');
      });
  }, [isSupplier]);

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPage(1);
  }

  const detailPath = isSupplier ? '/supplier/requests' : '/purchase-requests';

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav>
          {isSupplier
            ? <Link to="/dashboard">Dashboard</Link>
            : <><Link to="/purchase-requests/new">New request</Link><Link to="/dashboard">Dashboard</Link></>}
        </nav>
      </header>
      <section className="dashboard-card request-card">
        <p className="eyebrow">{isSupplier ? 'Supplier marketplace' : 'Buyer workspace'}</p>
        <h1>{isSupplier ? 'Eligible purchase requests' : 'My purchase requests'}</h1>
        {isSupplier && (
          <div className="catalog-filters request-filters">
            <label>Search requests<input name="keyword" value={filters.keyword} onChange={updateFilter} placeholder="Title, notes, or requested product" /></label>
            <label>Product category
              <select name="category" value={filters.category} onChange={updateFilter}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>Delivery by<input name="deliveryBefore" type="date" value={filters.deliveryBefore} onChange={updateFilter} /></label>
          </div>
        )}
        {!isSupplier && (
          <div className="request-list-toolbar">
            <label>Status
              <select name="status" value={filters.status} onChange={updateFilter}>
                <option value="">All requests</option>
                <option value="OPEN">Open</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <Link className="primary-button button-link" to="/purchase-requests/new">Create request</Link>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {isLoading && <p className="muted">Loading requests…</p>}
        {!isLoading && !result.data.length && <p className="muted">No requests match these filters.</p>}
        <div className="request-list">
          {result.data.map((purchaseRequest) => (
            <Link className="request-list-item" key={purchaseRequest.id} to={`${detailPath}/${purchaseRequest.id}`}>
              <div>
                <span className="product-category">
                  {purchaseRequest.request_number}
                  {!isSupplier && ` · ${purchaseRequest.status}`}
                </span>
                <h2>{purchaseRequest.title}</h2>
                <p className="muted">
                  {isSupplier ? purchaseRequest.buyer_business_name : `${purchaseRequest.item_count} item(s)`}
                  {' · '}
                  Delivery by {new Date(`${purchaseRequest.required_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}
                  {' · '}
                  {purchaseRequest.delivery_location.city}, {purchaseRequest.delivery_location.country}
                </p>
              </div>
              <span aria-hidden="true">View →</span>
            </Link>
          ))}
        </div>
        <footer className="pagination-bar">
          <span className="muted">{result.total} request(s) · Page {page} of {Math.max(result.totalPages, 1)}</span>
          <div>
            <button className="secondary-button" disabled={page <= 1 || isLoading} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="secondary-button" disabled={page >= result.totalPages || isLoading} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default PurchaseRequestsPage;
