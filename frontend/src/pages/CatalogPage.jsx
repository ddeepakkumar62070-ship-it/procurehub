import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalogApi';
import { useAuthStore } from '../store/authStore';

const pageSize = 12;

function CatalogPage() {
  const user = useAuthStore((state) => state.user);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    keyword: '',
    category: '',
    supplier: '',
    minPrice: '',
    maxPrice: '',
    currency: '',
    availability: '',
    sort: 'name',
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    catalogApi.getCategories().then(setCategories).catch((requestError) => {
      setError(requestError.response?.data?.error?.message || 'Could not load categories');
    });
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      const params = {
        page,
        limit: pageSize,
        sort: filters.sort,
        ...(filters.keyword && { keyword: filters.keyword }),
        ...(filters.category && { category: filters.category }),
        ...(filters.supplier && { supplier: filters.supplier }),
        ...(filters.minPrice !== '' && { minPrice: filters.minPrice }),
        ...(filters.maxPrice !== '' && { maxPrice: filters.maxPrice }),
        ...((filters.minPrice !== '' || filters.maxPrice !== '' || filters.sort.startsWith('price_'))
          && filters.currency && { currency: filters.currency.toUpperCase() }),
        ...(filters.availability && { availability: filters.availability }),
      };
      catalogApi.getProducts(params).then((nextResult) => {
        if (active) setResult(nextResult);
      }).catch((requestError) => {
        if (active) {
          setError(requestError.response?.data?.error?.message || 'Could not load products');
        }
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, page]);

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
    setPage(1);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to={user ? '/dashboard' : '/'}>ProcureHub</Link>
        <nav>
          {user?.roles.includes('SUPPLIER') && <Link to="/inventory">Manage inventory</Link>}
          {user ? <Link to="/dashboard">Dashboard</Link> : <Link to="/login">Sign in</Link>}
        </nav>
      </header>
      <section className="dashboard-card catalog-card">
        <div className="page-heading">
          <div><p className="eyebrow">Product marketplace</p><h1>Products & suppliers</h1></div>
          {user && <Link className="secondary-button button-link" to="/dashboard">Workspace</Link>}
        </div>
        <form className="catalog-filters" onSubmit={(event) => event.preventDefault()}>
          <label className="catalog-keyword">
            Search
            <input name="keyword" value={filters.keyword} onChange={updateFilter} placeholder="Name, SKU, or details" />
          </label>
          <label>Category
            <select name="category" value={filters.category} onChange={updateFilter}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>Supplier
            <input name="supplier" value={filters.supplier} onChange={updateFilter} placeholder="Supplier ID" />
          </label>
          <label>Min price
            <input name="minPrice" type="number" min="0" step="0.01" value={filters.minPrice} onChange={updateFilter} />
          </label>
          <label>Max price
            <input name="maxPrice" type="number" min="0" step="0.01" value={filters.maxPrice} onChange={updateFilter} />
          </label>
          <label>Currency
            <input name="currency" minLength={3} maxLength={3} value={filters.currency} onChange={updateFilter} placeholder="e.g. USD" />
          </label>
          <label>Availability
            <select name="availability" value={filters.availability} onChange={updateFilter}>
              <option value="">Any offer status</option>
              <option value="true">An offer has stock</option>
              <option value="false">An offer is out of stock</option>
            </select>
          </label>
          <label>Sort
            <select name="sort" value={filters.sort} onChange={updateFilter}>
              <option value="name">Name</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </form>

        {error && <p className="form-error" role="alert">{error}</p>}
        {isLoading && <p className="muted">Loading products…</p>}
        {!isLoading && !error && result.data.length === 0 && (
          <p className="muted">No matching products found. Try changing the filters.</p>
        )}
        {!isLoading && result.data.length > 0 && <div className="table-scroll product-table">
          <table><thead><tr><th>Product</th><th>Category</th><th>Supplier pricing</th><th>Suppliers</th><th>Available</th><th>Action</th></tr></thead>
            <tbody>{result.data.map((product) => (
              <tr key={product.id}>
                <td><strong>{product.name}</strong><small className="table-subtext">SKU {product.sku} · {product.description || 'Supplier-listed product'}</small></td>
                <td>{product.category_name || '—'}</td>
                <td>{product.price_ranges
                  ? Object.entries(product.price_ranges).map(([currency, range]) => (
                    <span className="price-range" key={currency}>
                      {currency} {range.min}{range.max !== range.min ? ` – ${range.max}` : ''}
                    </span>
                  ))
                  : <span className="muted">No offers</span>}</td>
                <td>{product.supplier_count}</td>
                <td>{product.available_quantity}</td>
                <td>{user?.roles.includes('BUYER')
                  ? <Link to="/purchase-requests/new">Request quote</Link>
                  : <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}

        <footer className="pagination-bar">
          <span className="muted">
            {result.total} product{result.total === 1 ? '' : 's'} · Page {page} of {Math.max(result.totalPages, 1)}
          </span>
          <div>
            <button className="secondary-button" disabled={page <= 1 || isLoading} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button className="secondary-button" disabled={page >= result.totalPages || isLoading} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

export default CatalogPage;
