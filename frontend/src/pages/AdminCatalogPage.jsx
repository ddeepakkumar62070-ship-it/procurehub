import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../api/catalogApi';

function AdminCatalogPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', description: '' });
  const [productForm, setProductForm] = useState({ categoryId: '', name: '', sku: '', description: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadCatalog() {
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        catalogApi.getCategories(),
        catalogApi.getProducts({ page: 1, limit: 100, sort: 'name' }),
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts.data);
      if (!productForm.categoryId && nextCategories[0]) {
        setProductForm((current) => ({ ...current, categoryId: nextCategories[0].id }));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not load catalog');
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  async function handleCategorySubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await catalogApi.createCategory(categoryForm);
      setCategoryForm({ name: '', slug: '', description: '' });
      setMessage('Category created.');
      await loadCatalog();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not create category');
    }
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await catalogApi.createProduct({
        ...productForm,
        description: productForm.description || null,
      });
      setProductForm((current) => ({ ...current, name: '', sku: '', description: '' }));
      setMessage('Product created.');
      await loadCatalog();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not create product');
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <nav><Link to="/catalog">Browse catalog</Link><Link to="/dashboard">Dashboard</Link></nav>
      </header>
      <section className="dashboard-card catalog-card">
        <p className="eyebrow">Platform administration</p>
        <h1>Catalog management</h1>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="success-message" role="status">{message}</p>}
        <div className="admin-catalog-grid">
          <form className="form-stack" onSubmit={handleCategorySubmit}>
            <h2>Create category</h2>
            <label>Name<input required minLength={2} maxLength={100} value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value, slug: event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></label>
            <label>Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} /></label>
            <label>Description<input maxLength={1000} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></label>
            <button className="primary-button">Create category</button>
          </form>
          <form className="form-stack" onSubmit={handleProductSubmit}>
            <h2>Create product</h2>
            <label>Category
              <select required value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}>
                <option value="" disabled>Select a category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>Name<input required minLength={2} maxLength={200} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            <label>SKU<input required maxLength={100} value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>
            <label>Description<input maxLength={5000} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
            <button className="primary-button" disabled={categories.length === 0}>Create product</button>
          </form>
        </div>
        <h2>Active catalog</h2>
        <p className="muted">{categories.length} categories · {products.length} products shown</p>
        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.id}>
              <span className="product-category">{product.category_name}</span>
              <h2>{product.name}</h2>
              <p className="muted">SKU: {product.sku}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default AdminCatalogPage;
