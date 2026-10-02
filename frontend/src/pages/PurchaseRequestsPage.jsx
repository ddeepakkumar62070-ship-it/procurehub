import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalogApi';
import { purchaseRequestApi } from '../api/purchaseRequestApi';
import { useAuthStore } from '../store/authStore';
import { EmptyState, StatusBadge } from '../components/PageStates';

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
        <div className="page-heading">
          <div><p className="eyebrow">{isSupplier ? 'Supplier marketplace' : 'Buyer workspace'}</p>
            <h1>{isSupplier ? 'Eligible purchase requests' : 'My purchase requests'}</h1></div>
          {!isSupplier && <Link className="primary-button button-link" to="/purchase-requests/new">Create request</Link>}
        </div>
        {isSupplier && (
          <div className="toolbar-filters request-filters">
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
          <div className="toolbar-filters">
            <label>Status
              <select name="status" value={filters.status} onChange={updateFilter}>
                <option value="">All requests</option>
                <option value="OPEN">Open</option>
                <option value="QUOTATION_RECEIVED">Quotation received</option>
                <option value="QUOTATION_ACCEPTED">Quotation accepted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {isLoading && <p className="muted">Loading requests…</p>}
        {!isLoading && !result.data.length && <EmptyState title="No requests match these filters." />}
        {!isLoading && result.data.length > 0 && <div className="table-scroll">
          <table><thead><tr><th>Request</th>{isSupplier && <th>Buyer</th>}<th>Items</th><th>Delivery by</th><th>Location</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{result.data.map((purchaseRequest) => (
              <tr key={purchaseRequest.id}>
                <td><Link to={`${detailPath}/${purchaseRequest.id}`}>{purchaseRequest.request_number}</Link><small className="table-subtext">{purchaseRequest.title}</small></td>
                {isSupplier && <td>{purchaseRequest.buyer_business_name}</td>}
                <td>{purchaseRequest.item_count}</td>
                <td>{new Date(`${purchaseRequest.required_delivery_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}</td>
                <td>{purchaseRequest.delivery_location.city}, {purchaseRequest.delivery_location.country}</td>
                <td><StatusBadge>{purchaseRequest.status}</StatusBadge></td>
                <td><Link to={`${detailPath}/${purchaseRequest.id}`}>{isSupplier ? 'Review request' : 'View request'}</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
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
