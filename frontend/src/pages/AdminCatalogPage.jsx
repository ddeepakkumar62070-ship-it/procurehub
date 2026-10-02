import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/adminApi';
import { catalogApi } from '../api/catalogApi';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastProvider';

function AdminCatalogPage() {
  const toast = useToast();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', description: '' });
  const [productForm, setProductForm] = useState({ categoryId: '', name: '', sku: '', description: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState({ name: '', slug: '', description: '' });
  const [categoryToDeactivate, setCategoryToDeactivate] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  async function loadCatalog() {
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        adminApi.categories(),
        catalogApi.getProducts({ page: 1, limit: 100, sort: 'name' }),
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts.data);
      const activeCategories = nextCategories.filter((category) => category.is_active);
      if (!productForm.categoryId && activeCategories[0]) {
        setProductForm((current) => ({ ...current, categoryId: activeCategories[0].id }));
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
      await adminApi.createCategory(categoryForm);
      setCategoryForm({ name: '', slug: '', description: '' });
      setMessage('Category created.');
      toast('Category created.');
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
      await adminApi.createProduct({
        ...productForm,
        description: productForm.description || null,
      });
      setProductForm((current) => ({ ...current, name: '', sku: '', description: '' }));
      setMessage('Product created.');
      toast('Product created.');
      await loadCatalog();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not create product');
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await adminApi.updateCategory(editingCategory.id, categoryDraft);
      setEditingCategory(null);
      toast('Category updated.');
      await loadCatalog();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not update category');
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivateCategory() {
    setIsSaving(true);
    try {
      await adminApi.deactivateCategory(categoryToDeactivate.id);
      setCategoryToDeactivate(null);
      toast('Category deactivated.');
      await loadCatalog();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not deactivate category');
    } finally {
      setIsSaving(false);
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
                {categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>Name<input required minLength={2} maxLength={200} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></label>
            <label>SKU<input required maxLength={100} value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} /></label>
            <label>Description<input maxLength={5000} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
            <button className="primary-button" disabled={!categories.some((category) => category.is_active)}>Create product</button>
          </form>
        </div>
        <h2>Manage categories</h2>
        {categories.length === 0 ? <p className="muted">No categories have been created.</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Category</th><th>Slug</th><th>Products</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.name}</td><td>{category.slug}</td><td>{category.product_count}</td>
                  <td>{category.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="table-actions">
                    <button type="button" className="secondary-button" onClick={() => {
                      setEditingCategory(category);
                      setCategoryDraft({
                        name: category.name,
                        slug: category.slug,
                        description: category.description || '',
                      });
                    }}>Edit</button>
                    {category.is_active && <button type="button" className="danger-button" onClick={() => setCategoryToDeactivate(category)}>Deactivate</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
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
      <ConfirmDialog
        open={Boolean(categoryToDeactivate)}
        title="Deactivate category?"
        confirmLabel="Deactivate"
        destructive
        isBusy={isSaving}
        onCancel={() => setCategoryToDeactivate(null)}
        onConfirm={deactivateCategory}
      >
        Products in this category will no longer appear in the marketplace.
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(editingCategory)}
        title="Edit category"
        confirmLabel="Save changes"
        isBusy={isSaving}
        onCancel={() => setEditingCategory(null)}
        onConfirm={() => document.getElementById('category-edit-form')?.requestSubmit()}
      >
        <form id="category-edit-form" className="form-stack" onSubmit={saveCategory}>
          <label>Name<input required minLength={2} maxLength={100} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label>
          <label>Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} value={categoryDraft.slug} onChange={(event) => setCategoryDraft({ ...categoryDraft, slug: event.target.value })} /></label>
          <label>Description<input maxLength={1000} value={categoryDraft.description} onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })} /></label>
        </form>
      </ConfirmDialog>
    </main>
  );
}

export default AdminCatalogPage;
