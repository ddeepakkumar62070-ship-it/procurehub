import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../api/adminApi';
import { analyticsApi } from '../api/analyticsApi';
import { catalogApi } from '../api/catalogApi';
import { disputeApi } from '../api/disputeApi';
import { invoiceApi } from '../api/invoiceApi';
import { notificationApi } from '../api/notificationApi';
import { orderApi } from '../api/orderApi';
import { quotationApi } from '../api/quotationApi';
import { supplierApi } from '../api/supplierApi';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastProvider';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
} from '../components/PageStates';
import { useAuthStore } from '../store/authStore';

function requestMessage(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}
function usePagedData(loader, dependencies = []) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    loader(page).then((next) => {
      if (active) setResult(next);
    }).catch((loadError) => {
      if (active) setError(requestMessage(loadError, 'Could not load data'));
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [page, reloadKey, ...dependencies]);

  return { page, setPage, result, isLoading, error, reload };
}

export function AnalyticsSummary({ data }) {
  const labels = {
    users: 'Users',
    suppliers: 'Suppliers',
    suspended_suppliers: 'Suspended suppliers',
    active_categories: 'Active categories',
    open_requests: 'Open requests',
    active_orders: 'Active orders',
    open_disputes: 'Open disputes',
    outstanding_invoices: 'Outstanding invoices',
    paid_total: 'Paid total',
    active_products: 'Active products',
    low_stock_items: 'Low-stock items',
    submitted_quotations: 'Submitted quotations',
    received_payments: 'Payments received',
    quotations_to_review: 'Quotations to review',
    total_paid: 'Total paid',
  };
  return (
    <div className="metric-grid">
      {Object.entries(data).filter(([key]) => labels[key]).map(([key, value]) => (
        <article className="metric-card" key={key}>
          <span className="muted">{labels[key]}</span>
          <strong>{Number(value || 0).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}</strong>
        </article>
      ))}
    </div>
  );
}

export function SupplierDirectoryPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    supplierApi.list({ search: search || undefined, page, limit: 12 })
      .then((next) => { if (active) setResult(next); })
      .catch((loadError) => { if (active) setError(requestMessage(loadError, 'Could not load suppliers')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search]);
  return (
    <section className="page-stack">
      <PageHeader eyebrow="Marketplace" title="Suppliers" description="Browse verified suppliers, their ratings, and active catalog offers." />
      <label className="search-control">Search suppliers
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Business name, city, or country" />
      </label>
      {error && <ErrorState message={error} />}
      {isLoading ? <LoadingState label="Loading verified suppliers…" />
        : result.data.length === 0 ? <EmptyState title="No suppliers found" description="Try a different search." />
          : <div className="entity-grid">{result.data.map((supplier) => (
            <article className="entity-card" key={supplier.id}>
              <p className="eyebrow">{[supplier.city, supplier.country].filter(Boolean).join(', ') || 'Verified supplier'}</p>
              <h2>{supplier.business_name}</h2>
              <p className="muted">{supplier.product_count} active products</p>
              <p>Rating: {Number(supplier.rating_average || 0).toFixed(1)} / 5 ({supplier.rating_count || 0})</p>
              <Link className="secondary-button button-link" to={`/suppliers/${supplier.id}`}>View supplier</Link>
            </article>
          ))}</div>}
      <Pagination page={page} totalPages={result.totalPages} total={result.total || 0} onPageChange={setPage} isLoading={isLoading} />
    </section>
  );
}

export function SupplierDetailPage() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    supplierApi.get(id).then(setSupplier).catch((loadError) => setError(requestMessage(loadError, 'Could not load supplier')));
  }, [id]);
  if (error) return <ErrorState message={error} />;
  if (!supplier) return <LoadingState label="Loading supplier details…" />;
  return (
    <section className="page-stack">
      <PageHeader eyebrow="Verified supplier" title={supplier.business_name} description={[supplier.city, supplier.state, supplier.country].filter(Boolean).join(', ')} />
      <article className="entity-card">
        <p>Rating: {Number(supplier.rating_average || 0).toFixed(1)} / 5 ({supplier.rating_count || 0} reviews)</p>
        {supplier.address && <p>{supplier.address}</p>}
        {supplier.registration_number && <p className="muted">Registration: {supplier.registration_number}</p>}
      </article>
      <h2>Active products</h2>
      {supplier.products.length === 0 ? <EmptyState title="No active offers" />
        : <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Lead time</th><th>Available</th></tr></thead>
          <tbody>{supplier.products.map((product) => <tr key={product.supplier_product_id}>
            <td>{product.name}</td><td>{product.sku}</td><td>{product.currency} {product.unit_price}</td>
            <td>{product.lead_time_days} days</td><td>{product.available_quantity}</td>
          </tr>)}</tbody></table></div>}
    </section>
  );
}

export function InvoiceListPage() {
  const role = useAuthStore((state) => state.user.roles.includes('BUYER') ? 'BUYER' : 'SUPPLIER');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setBusy(true);
    invoiceApi.list({ page, limit: 20, ...(status && { status }) })
      .then((next) => { if (active) setResult(next); })
      .catch((loadError) => { if (active) setError(requestMessage(loadError, 'Could not load invoices')); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page, status]);
  const download = async (id, invoiceNumber) => {
    try {
      const file = await invoiceApi.downloadPdf(id);
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${invoiceNumber}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(requestMessage(downloadError, 'Could not download invoice PDF'));
    }
  };
  return (
    <section className="page-stack">
      <PageHeader eyebrow={role === 'BUYER' ? 'Buyer workspace' : 'Supplier workspace'} title="Invoices & payments" description="Track invoice status, balances, and simulated payments." />
      <label className="filter-control">Status
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['UNPAID', 'PAYMENT_INITIATED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'REFUNDED'].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      {error && <ErrorState message={error} />}
      {busy ? <LoadingState label="Loading invoices…" />
        : result.data.length === 0 ? <EmptyState title="No invoices found" />
          : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Issue date</th><th>Due date</th><th>Total</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{result.data.map((invoice) => <tr key={invoice.id}>
              <td><Link to={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link></td>
              <td>{new Date(invoice.issue_date).toLocaleDateString()}</td>
              <td>{new Date(invoice.due_date).toLocaleDateString()}</td>
              <td>{invoice.currency} {invoice.total}</td><td>{invoice.currency} {invoice.amount_paid}</td>
              <td><StatusBadge>{invoice.status}</StatusBadge></td>
              <td><button type="button" className="text-button" onClick={() => download(invoice.id, invoice.invoice_number)}>Download PDF</button></td>
            </tr>)}</tbody></table></div>}
      <Pagination page={page} totalPages={result.totalPages} total={result.total || 0} onPageChange={setPage} isLoading={busy} />
    </section>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [invoice, setInvoice] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => invoiceApi.get(id)
    .then(setInvoice)
    .catch((loadError) => setError(requestMessage(loadError, 'Could not load invoice'))), [id]);
  useEffect(() => { load(); }, [load]);
  async function pay() {
    setBusy(true);
    setError('');
    try {
      await invoiceApi.pay(id, amount || undefined);
      toast('Payment recorded successfully.');
      setAmount('');
      await load();
    } catch (paymentError) {
      setError(requestMessage(paymentError, 'Could not process payment'));
    } finally {
      setBusy(false);
    }
  }
  if (error && !invoice) return <ErrorState message={error} />;
  if (!invoice) return <LoadingState label="Loading invoice…" />;
  return (
    <section className="page-stack">
      <PageHeader eyebrow="Invoice detail" title={invoice.invoice_number} description={`Order ${invoice.order_number} · Due ${new Date(invoice.due_date).toLocaleDateString()}`} actions={<StatusBadge>{invoice.status}</StatusBadge>} />
      {error && <ErrorState message={error} />}
      <div className="detail-grid">
        <article className="entity-card"><h2>Invoice summary</h2>
          <p>Subtotal: {invoice.currency} {invoice.subtotal}</p><p>Tax: {invoice.currency} {invoice.tax}</p>
          <p>Discount: {invoice.currency} {invoice.discount}</p><p>Shipping: {invoice.currency} {invoice.shipping}</p>
          <strong>Total: {invoice.currency} {invoice.total}</strong>
          <p>Paid: {invoice.currency} {invoice.amount_paid}</p>
        </article>
        <article className="entity-card"><h2>Parties</h2><p>Buyer: {invoice.buyer_business_name}</p><p>Supplier: {invoice.supplier_business_name}</p></article>
      </div>
      <h2>Items</h2>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
        <tbody>{invoice.items.map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{item.product_sku}</td><td>{item.quantity}</td><td>{invoice.currency} {item.unit_price}</td><td>{invoice.currency} {item.line_total}</td></tr>)}</tbody></table></div>
      <h2>Payments</h2>
      {invoice.payments.length === 0 ? <EmptyState title="No payments recorded" />
        : <div className="table-scroll"><table><thead><tr><th>Provider</th><th>Reference</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{invoice.payments.map((payment) => <tr key={payment.id}><td>{payment.provider}</td><td>{payment.provider_reference}</td><td>{new Date(payment.created_at).toLocaleString()}</td><td>{payment.currency} {payment.amount}</td><td><StatusBadge>{payment.status}</StatusBadge></td></tr>)}</tbody></table></div>}
      {invoice.can_pay && <div className="payment-panel"><h2>Make a simulated payment</h2>
        <p className="muted">Leave the amount blank to pay the full outstanding balance.</p>
        <label>Payment amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <button className="primary-button" type="button" disabled={busy} onClick={pay}>{busy ? 'Processing…' : 'Pay invoice'}</button>
      </div>}
    </section>
  );
}

export function NotificationListPage() {
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => notificationApi.list({ page, limit: 20 })
    .then(setResult)
    .catch((loadError) => setError(requestMessage(loadError, 'Could not load notifications')))
    .finally(() => setBusy(false)), [page]);
  useEffect(() => { setBusy(true); load(); }, [load]);
  async function readAll() {
    try {
      await notificationApi.markAllRead();
      setResult((current) => ({ ...current, data: current.data.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })) }));
    } catch (readError) {
      setError(requestMessage(readError, 'Could not mark notifications as read'));
    }
  }
  return (
    <section className="page-stack">
      <PageHeader eyebrow="Your activity" title="Notifications" description="Updates about requests, quotations, orders, payments, and inventory." actions={<button className="secondary-button" type="button" onClick={readAll}>Mark all read</button>} />
      {error && <ErrorState message={error} />}
      {busy ? <LoadingState label="Loading notifications…" />
        : result.data.length === 0 ? <EmptyState title="You're all caught up" />
          : <div className="notification-list">{result.data.map((item) => <article className={`notification-row ${item.read_at ? '' : 'unread'}`} key={item.id}>
            <div><strong>{item.title}</strong><p>{item.message}</p><small>{item.type.replaceAll('_', ' ')} · {new Date(item.created_at).toLocaleString()}</small></div>
            {!item.read_at && <button className="text-button" type="button" onClick={async () => {
              try {
                const updated = await notificationApi.markRead(item.id);
                setResult((current) => ({ ...current, data: current.data.map((notification) => notification.id === updated.id ? updated : notification) }));
              } catch (readError) { setError(requestMessage(readError, 'Could not update notification')); }
            }}>Mark read</button>}
          </article>)}</div>}
      <Pagination page={page} totalPages={result.totalPages} total={result.total || 0} onPageChange={setPage} isLoading={busy} />
    </section>
  );
}

export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { analyticsApi.mine().then(setData).catch((loadError) => setError(requestMessage(loadError, 'Could not load analytics'))); }, []);
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading analytics…" />;
  return <section className="page-stack"><PageHeader eyebrow="Performance" title="Analytics" description="Live operational metrics from your ProcureHub activity." /><AnalyticsSummary data={data} /></section>;
}

export function DisputePage({ admin = false }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ orderId: '', type: 'ORDER_NOT_RECEIVED', title: '', description: '' });
  const [activeDispute, setActiveDispute] = useState(null);
  const [resolution, setResolution] = useState('');
  const [nextStatus, setNextStatus] = useState('UNDER_REVIEW');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => (admin ? adminApi.disputes({ page, limit: 20, ...(status && { status }) })
    : disputeApi.list({ page, limit: 20, ...(status && { status }) }))
    .then(setResult)
    .catch((loadError) => setError(requestMessage(loadError, 'Could not load disputes')))
    .finally(() => setBusy(false)), [admin, page, status]);
  useEffect(() => { setBusy(true); load(); }, [load]);
  useEffect(() => {
    if (!admin) orderApi.list({ page: 1, limit: 100 }).then((ordersResult) => setOrders(ordersResult.data))
      .catch((loadError) => setError(requestMessage(loadError, 'Could not load orders')));
  }, [admin]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await disputeApi.create(form);
      toast('Dispute opened.');
      setForm({ orderId: '', type: 'ORDER_NOT_RECEIVED', title: '', description: '' });
      await load();
    } catch (submitError) {
      setError(requestMessage(submitError, 'Could not open dispute'));
    } finally {
      setSaving(false);
    }
  }
  async function updateDispute() {
    setSaving(true);
    try {
      await adminApi.updateDispute(activeDispute.id, {
        status: nextStatus,
        ...(nextStatus !== 'UNDER_REVIEW' && { resolution }),
      });
      toast(`Dispute moved to ${nextStatus.toLowerCase().replaceAll('_', ' ')}.`);
      setActiveDispute(null);
      setResolution('');
      await load();
    } catch (updateError) {
      setError(requestMessage(updateError, 'Could not update dispute'));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="page-stack">
      <PageHeader eyebrow={admin ? 'Case management' : 'Order support'} title="Disputes" description={admin ? 'Review and resolve buyer and supplier disputes.' : 'Open a case on an order and track its resolution.'} />
      {!admin && <form className="entity-card form-stack" onSubmit={submit}>
        <h2>Open a dispute</h2>
        <label>Order<select required value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })}><option value="">Select an order</option>
          {orders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.request_title}</option>)}</select></label>
        <label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['ORDER_NOT_RECEIVED', 'DAMAGED_PRODUCT', 'WRONG_QUANTITY', 'WRONG_PRODUCT', 'PAYMENT_ISSUE', 'OTHER'].map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Title<input required minLength={3} maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Description<textarea required minLength={10} maxLength={5000} rows="4" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <button className="primary-button" disabled={saving || !orders.length}>{saving ? 'Opening…' : 'Open dispute'}</button>
      </form>}
      <label className="filter-control">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="">All statuses</option>{['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      {error && <ErrorState message={error} />}
      {busy ? <LoadingState label="Loading disputes…" />
        : result.data.length === 0 ? <EmptyState title="No disputes" description="There are no disputes matching this view." />
          : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Title</th><th>Category</th><th>Opened by</th><th>Status</th><th>Created</th>{admin && <th>Action</th>}</tr></thead>
            <tbody>{result.data.map((dispute) => <tr key={dispute.id}><td>{dispute.order_number}</td><td>{dispute.title}<small className="table-subtext">{dispute.description}</small></td><td>{dispute.type.replaceAll('_', ' ')}</td><td>{dispute.opened_by_email}</td><td><StatusBadge>{dispute.status}</StatusBadge></td><td>{new Date(dispute.created_at).toLocaleDateString()}</td>
              {admin && <td>{['OPEN', 'UNDER_REVIEW'].includes(dispute.status) && <button className="secondary-button" type="button" onClick={() => { setActiveDispute(dispute); setNextStatus(dispute.status === 'OPEN' ? 'UNDER_REVIEW' : 'RESOLVED'); }}>Review</button>}</td>}</tr>)}</tbody></table></div>}
      <Pagination page={page} totalPages={result.totalPages} total={result.total || 0} onPageChange={setPage} isLoading={busy} />
      <ConfirmDialog open={Boolean(activeDispute)} title="Update dispute" confirmLabel="Save decision" isBusy={saving} onCancel={() => setActiveDispute(null)} onConfirm={updateDispute}>
        <div className="form-stack">
          <p>{activeDispute?.title} · {activeDispute?.order_number}</p>
          <label>New status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
            {['UNDER_REVIEW', 'RESOLVED', 'REJECTED'].filter((value) => value !== activeDispute?.status).map((value) => <option key={value}>{value}</option>)}
          </select></label>
          {nextStatus !== 'UNDER_REVIEW' && <label>Resolution notes<textarea required minLength="5" maxLength="4000" rows="4" value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>}
        </div>
      </ConfirmDialog>
    </section>
  );
}

export function AdminUsersPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const loader = useCallback((page) => adminApi.users({ page, limit: 20, ...(search && { search }), ...(role && { role }), ...(active && { active }) }), [search, role, active]);
  const state = usePagedData(loader, [search, role, active]);
  const [confirmUser, setConfirmUser] = useState(null);
  const [saving, setSaving] = useState(false);
  async function toggle() {
    setSaving(true);
    try {
      await adminApi.updateUser(confirmUser.id, !confirmUser.is_active);
      toast(confirmUser.is_active ? 'User deactivated.' : 'User activated.');
      setConfirmUser(null);
      state.reload();
    } catch (error) { toast(requestMessage(error, 'Could not update user'), 'error'); }
    finally { setSaving(false); }
  }
  return <section className="page-stack">
    <PageHeader eyebrow="Administration" title="Users" description="Search accounts and manage account access." />
    <div className="toolbar-filters">
      <input aria-label="Search users" placeholder="Search name, email, or business" value={search} onChange={(event) => { setSearch(event.target.value); state.setPage(1); }} />
      <select aria-label="Filter users by role" value={role} onChange={(event) => { setRole(event.target.value); state.setPage(1); }}><option value="">All roles</option>{['BUYER', 'SUPPLIER', 'ADMIN'].map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter users by activation" value={active} onChange={(event) => { setActive(event.target.value); state.setPage(1); }}><option value="">Any status</option><option value="true">Active</option><option value="false">Inactive</option></select>
    </div>
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    {state.isLoading ? <LoadingState /> : state.result.data.length === 0 ? <EmptyState title="No users found" /> : <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Business</th><th>Roles</th><th>Status</th><th>Joined</th><th /></tr></thead>
      <tbody>{state.result.data.map((user) => <tr key={user.id}><td>{user.first_name} {user.last_name}</td><td>{user.email}</td><td>{user.business_name || '—'}</td><td>{user.roles.join(', ')}</td><td><StatusBadge>{user.is_active ? 'ACTIVE' : 'INACTIVE'}</StatusBadge></td><td>{new Date(user.created_at).toLocaleDateString()}</td><td><button className={user.is_active ? 'danger-button' : 'secondary-button'} type="button" onClick={() => setConfirmUser(user)}>{user.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div>}
    <Pagination page={state.page} totalPages={state.result.totalPages} total={state.result.total || 0} onPageChange={state.setPage} isLoading={state.isLoading} />
    <ConfirmDialog open={Boolean(confirmUser)} title={`${confirmUser?.is_active ? 'Deactivate' : 'Activate'} user?`} confirmLabel={confirmUser?.is_active ? 'Deactivate user' : 'Activate user'} destructive={confirmUser?.is_active} isBusy={saving} onCancel={() => setConfirmUser(null)} onConfirm={toggle}>This changes access to the platform for {confirmUser?.email}.</ConfirmDialog>
  </section>;
}

export function AdminSuppliersPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [suspended, setSuspended] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [suspensionTarget, setSuspensionTarget] = useState(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const loader = useCallback((page) => adminApi.suppliers({
    page,
    limit: 20,
    ...(search && { search }),
    ...(suspended && { suspended }),
    ...(verificationStatus && { verificationStatus }),
  }), [search, suspended, verificationStatus]);
  const state = usePagedData(loader, [search, suspended, verificationStatus]);
  async function setVerification(supplier, verificationStatus) {
    try {
      await adminApi.updateSupplier(supplier.id, verificationStatus);
      toast(`Supplier ${verificationStatus.toLowerCase()}.`);
      state.reload();
    } catch (error) { toast(requestMessage(error, 'Could not update supplier'), 'error'); }
  }
  async function updateSuspension() {
    if (!suspensionTarget) return;
    setSaving(true);
    try {
      await adminApi.updateSupplierSuspension(
        suspensionTarget.id,
        !suspensionTarget.is_suspended,
        suspensionReason
      );
      toast(suspensionTarget.is_suspended ? 'Supplier reinstated.' : 'Supplier suspended.');
      setSuspensionTarget(null);
      setSuspensionReason('');
      state.reload();
    } catch (error) {
      toast(requestMessage(error, 'Could not update supplier suspension'), 'error');
    } finally {
      setSaving(false);
    }
  }
  return <section className="page-stack"><PageHeader eyebrow="Administration" title="Suppliers" description="Verify suppliers, review account status, and suspend or reinstate access." />
    <div className="toolbar-filters">
      <input aria-label="Search suppliers" placeholder="Search business or email" value={search} onChange={(event) => { setSearch(event.target.value); state.setPage(1); }} />
      <select aria-label="Filter suppliers by suspension" value={suspended} onChange={(event) => { setSuspended(event.target.value); state.setPage(1); }}><option value="">All account states</option><option value="false">Not suspended</option><option value="true">Suspended</option></select>
      <select aria-label="Filter suppliers by verification" value={verificationStatus} onChange={(event) => { setVerificationStatus(event.target.value); state.setPage(1); }}><option value="">All verification states</option>{['PENDING', 'VERIFIED', 'REJECTED'].map((status) => <option key={status}>{status}</option>)}</select>
    </div>
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    {state.isLoading ? <LoadingState /> : state.result.data.length === 0 ? <EmptyState title="No suppliers found" /> : <div className="table-scroll"><table><thead><tr><th>Business</th><th>Contact</th><th>Location</th><th>Rating</th><th>Products</th><th>Verification</th><th>Account</th><th>Actions</th></tr></thead><tbody>
      {state.result.data.map((supplier) => <tr key={supplier.id}><td>{supplier.business_name}</td><td>{supplier.first_name} {supplier.last_name}<small className="table-subtext">{supplier.email}</small></td><td>{[supplier.city, supplier.country].filter(Boolean).join(', ')}</td><td>{Number(supplier.rating_average || 0).toFixed(1)} ({supplier.rating_count})</td><td>{supplier.product_count}</td><td><select aria-label={`Verification for ${supplier.business_name}`} value={supplier.verification_status} onChange={(event) => setVerification(supplier, event.target.value)}>{['PENDING', 'VERIFIED', 'REJECTED'].map((status) => <option key={status}>{status}</option>)}</select></td><td><StatusBadge>{supplier.is_suspended ? 'SUSPENDED' : supplier.is_active ? 'ACTIVE' : 'INACTIVE'}</StatusBadge>{supplier.is_suspended && <small className="table-subtext">{supplier.suspension_reason}</small>}</td><td><button className={supplier.is_suspended ? 'secondary-button' : 'danger-button'} type="button" onClick={() => { setSuspensionTarget(supplier); setSuspensionReason(''); }}>{supplier.is_suspended ? 'Reinstate' : 'Suspend'}</button></td></tr>)}
    </tbody></table></div>}
    <Pagination page={state.page} totalPages={state.result.totalPages} total={state.result.total || 0} onPageChange={state.setPage} isLoading={state.isLoading} />
    <ConfirmDialog
      open={Boolean(suspensionTarget)}
      title={suspensionTarget?.is_suspended ? 'Reinstate supplier?' : 'Suspend supplier?'}
      confirmLabel={suspensionTarget?.is_suspended ? 'Reinstate supplier' : 'Suspend supplier'}
      destructive={!suspensionTarget?.is_suspended}
      isBusy={saving}
      isConfirmDisabled={!suspensionTarget?.is_suspended && suspensionReason.trim().length < 5}
      onCancel={() => setSuspensionTarget(null)}
      onConfirm={updateSuspension}
    >
      <div className="form-stack">
        <p>{suspensionTarget?.business_name}</p>
        {!suspensionTarget?.is_suspended && <label>Reason<textarea required minLength={5} maxLength={2000} rows="3" value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} /></label>}
      </div>
    </ConfirmDialog>
  </section>;
}

export function AdminOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const loader = useCallback((page) => adminApi.orders({ page, limit: 20, ...(search && { search }), ...(status && { status }) }), [search, status]);
  const state = usePagedData(loader, [search, status]);
  return <section className="page-stack"><PageHeader eyebrow="Administration" title="Orders" description="Monitor marketplace orders without bypassing the order state machine." />
    <div className="toolbar-filters"><input aria-label="Search orders" placeholder="Order number, request, or business" value={search} onChange={(event) => { setSearch(event.target.value); state.setPage(1); }} />
      <select aria-label="Filter orders by status" value={status} onChange={(event) => { setStatus(event.target.value); state.setPage(1); }}><option value="">All statuses</option>{['REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_ACCEPTED', 'PO_CREATED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICE_GENERATED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].map((value) => <option key={value}>{value}</option>)}</select>
    </div>
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    {state.isLoading ? <LoadingState /> : state.result.data.length === 0 ? <EmptyState title="No orders found" /> : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Request</th><th>Buyer</th><th>Supplier</th><th>Status</th><th>Amount</th><th>Created</th></tr></thead><tbody>
      {state.result.data.map((order) => <tr key={order.id}><td><Link to={`/admin/orders/${order.id}`}>{order.order_number}</Link></td><td>{order.request_title}</td><td>{order.buyer_business_name}</td><td>{order.supplier_business_name}</td><td><StatusBadge>{order.status}</StatusBadge></td><td>{order.currency} {order.subtotal}</td><td>{new Date(order.created_at).toLocaleDateString()}</td></tr>)}
    </tbody></table></div>}
    <Pagination page={state.page} totalPages={state.result.totalPages} total={state.result.total || 0} onPageChange={state.setPage} isLoading={state.isLoading} />
  </section>;
}

export function AdminOrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminApi.getOrder(id).then(setOrder).catch((loadError) => setError(requestMessage(loadError, 'Could not load order'))); }, [id]);
  if (error) return <ErrorState message={error} />;
  if (!order) return <LoadingState label="Loading order…" />;
  return <section className="page-stack"><PageHeader eyebrow={order.order_number} title={order.request_title} description={`${order.buyer_business_name} → ${order.supplier_business_name}`} actions={<StatusBadge>{order.status}</StatusBadge>} />
    <h2>Order items</h2><div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{item.product_sku}</td><td>{item.quantity}</td><td>{order.currency} {item.unit_price}</td><td>{order.currency} {item.line_total}</td></tr>)}</tbody></table></div>
    <h2>Order history</h2><div className="timeline">{order.audit.map((entry) => <article key={entry.id}><StatusBadge>{entry.to_status}</StatusBadge><p>{entry.reason || 'Status changed'}</p><small>{entry.actor_role} · {new Date(entry.created_at).toLocaleString()}</small></article>)}</div>
  </section>;
}

export function AdminAuditLogsPage() {
  const [search, setSearch] = useState('');
  const loader = useCallback((page) => adminApi.auditLogs({ page, limit: 25, ...(search && { search }) }), [search]);
  const state = usePagedData(loader, [search]);
  return <section className="page-stack"><PageHeader eyebrow="Administration" title="Audit logs" description="Immutable history of administrator actions and order transitions." />
    <input className="search-control" aria-label="Search audit logs" placeholder="Search action, entity, user, or details" value={search} onChange={(event) => { setSearch(event.target.value); state.setPage(1); }} />
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    {state.isLoading ? <LoadingState /> : state.result.data.length === 0 ? <EmptyState title="No audit events found" /> : <div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Actor</th><th>Changes / reason</th></tr></thead><tbody>
      {state.result.data.map((entry) => <tr key={entry.id}><td>{new Date(entry.created_at).toLocaleString()}</td><td>{entry.action.replaceAll('_', ' ')}</td><td>{entry.entity_type.replaceAll('_', ' ')} · {entry.entity_id}</td><td>{entry.actor_email}</td><td><details><summary>View details</summary><pre>{JSON.stringify({ before: entry.before_data, after: entry.after_data, reason: entry.reason }, null, 2)}</pre></details></td></tr>)}
    </tbody></table></div>}
    <Pagination page={state.page} totalPages={state.result.totalPages} total={state.result.total || 0} onPageChange={state.setPage} isLoading={state.isLoading} />
  </section>;
}

export function SupplierProductsPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState({ productId: '', unitPrice: '', currency: 'USD', leadTimeDays: '7', totalQuantity: '0' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeOffer, setActiveOffer] = useState(null);
  const [offerPrice, setOfferPrice] = useState('');
  const load = useCallback(async () => {
    const [own, all] = await Promise.all([
      catalogApi.getSupplierProducts(),
      catalogApi.getProducts({ page: 1, limit: 100, sort: 'name' }),
    ]);
    setProducts(own);
    setCatalog(all.data);
    if (all.data[0]) setForm((current) => current.productId ? current : ({ ...current, productId: all.data[0].id }));
  }, []);
  useEffect(() => { load().catch((loadError) => setError(requestMessage(loadError, 'Could not load supplier products'))).finally(() => setLoading(false)); }, [load]);
  async function create(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await catalogApi.createSupplierProduct({ ...form, unitPrice: Number(form.unitPrice), leadTimeDays: Number(form.leadTimeDays), totalQuantity: Number(form.totalQuantity) });
      toast('Supplier offer created.');
      await load();
    } catch (submitError) { setError(requestMessage(submitError, 'Could not create offer')); }
    finally { setSaving(false); }
  }
  async function updateOffer(isActive) {
    setSaving(true);
    try {
      await catalogApi.updateSupplierProduct(activeOffer.id, {
        isActive,
        ...(offerPrice !== '' && { unitPrice: Number(offerPrice) }),
      });
      toast('Product offer updated.');
      setActiveOffer(null);
      setOfferPrice('');
      await load();
    } catch (updateError) {
      setError(requestMessage(updateError, 'Could not update product offer'));
    } finally {
      setSaving(false);
    }
  }
  return <section className="page-stack"><PageHeader eyebrow="Supplier workspace" title="Products & offers" description="Publish offers for catalog products and maintain listing prices." />
    <form className="entity-card form-stack" onSubmit={create}><h2>Add product offer</h2>
      <label>Catalog product<select required value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}><option value="">Choose a product</option>{catalog.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
      <div className="form-grid"><label>Unit price<input required type="number" min="0.01" step="0.01" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} /></label>
        <label>Currency<input required minLength="3" maxLength="3" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
        <label>Lead time (days)<input required type="number" min="1" max="365" value={form.leadTimeDays} onChange={(event) => setForm({ ...form, leadTimeDays: event.target.value })} /></label>
        <label>Initial stock<input required type="number" min="0" value={form.totalQuantity} onChange={(event) => setForm({ ...form, totalQuantity: event.target.value })} /></label></div>
      <button className="primary-button" disabled={saving || loading || !catalog.length}>{saving ? 'Saving…' : 'Publish offer'}</button>
    </form>
    {error && <ErrorState message={error} />}
    {loading ? <LoadingState /> : products.length === 0 ? <EmptyState title="No offers yet" description="Add an offer to appear in the product marketplace." /> : <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Lead time</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.product_name}</td><td>{product.sku}</td><td>{product.currency} {product.unit_price}</td><td>{product.lead_time_days} days</td><td><StatusBadge>{product.is_active ? 'ACTIVE' : 'INACTIVE'}</StatusBadge></td><td><button className="secondary-button" type="button" onClick={() => { setActiveOffer(product); setOfferPrice(String(product.unit_price)); }}>{product.is_active ? 'Edit / pause' : 'Edit / activate'}</button></td></tr>)}</tbody></table></div>}
    <ConfirmDialog open={Boolean(activeOffer)} title="Update product offer" confirmLabel="Save offer" isBusy={saving} onCancel={() => setActiveOffer(null)} onConfirm={() => updateOffer(activeOffer?.is_active ?? false)}>
      <div className="form-stack"><p>{activeOffer?.product_name}</p>
        <label>Unit price<input type="number" min="0" step="0.01" value={offerPrice} onChange={(event) => setOfferPrice(event.target.value)} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={Boolean(activeOffer?.is_active)} onChange={(event) => setActiveOffer((current) => ({ ...current, is_active: event.target.checked }))} /> Offer is active</label>
      </div>
    </ConfirmDialog>
  </section>;
}

export function SupplierQuotationsPage() {
  const [status, setStatus] = useState('');
  const state = usePagedData(
    (page) => quotationApi.listMine({ page, limit: 20, ...(status && { status }) }),
    [status]
  );
  return <section className="page-stack">
    <PageHeader eyebrow="Supplier workspace" title="Quotations" description="Track submitted offers, buyer decisions, and quotation expiry." />
    <label className="filter-control">Status<select value={status} onChange={(event) => { setStatus(event.target.value); state.setPage(1); }}>
      <option value="">All statuses</option>{['SUBMITTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'].map((value) => <option key={value}>{value}</option>)}
    </select></label>
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    {state.isLoading ? <LoadingState label="Loading quotations…" />
      : state.result.data.length === 0 ? <EmptyState title="No quotations found" description="Eligible requests can be quoted from the purchase requests page." />
        : <div className="table-scroll"><table><thead><tr><th>Quotation</th><th>Purchase request</th><th>Buyer</th><th>Valid until</th><th>Delivery</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>{state.result.data.map((quotation) => <tr key={quotation.id}>
            <td>{quotation.quotation_number}</td>            <td>{quotation.request_number} · {quotation.request_title}</td><td>Buyer</td>
            <td>{new Date(quotation.valid_until).toLocaleDateString()}</td><td>{quotation.delivery_time_days} days</td><td>{quotation.currency} {quotation.subtotal}</td>
            <td><StatusBadge>{quotation.status}</StatusBadge></td><td><Link to={`/supplier/requests/${quotation.purchase_request_id}`}>Open request</Link></td>
          </tr>)}</tbody></table></div>}
    <Pagination page={state.page} totalPages={state.result.totalPages} total={state.result.total || 0} onPageChange={state.setPage} isLoading={state.isLoading} />
  </section>;
}

export function ShipmentsPage() {
  const [status, setStatus] = useState('SHIPPED');
  const state = usePagedData(
    (page) => orderApi.list({ page, limit: 20, status }),
    [status]
  );
  return <section className="page-stack">
    <PageHeader eyebrow="Supplier workspace" title="Shipments" description="Follow orders through shipping and delivery. Update order status from order details." />
    <label className="filter-control">Shipment status<select value={status} onChange={(event) => { setStatus(event.target.value); state.setPage(1); }}>
      {['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED'].map((value) => <option key={value}>{value}</option>)}
    </select></label>
    {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
    {state.isLoading ? <LoadingState label="Loading shipments…" />
      : state.result.data.length === 0 ? <EmptyState title="No shipments in this status" />
        : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Request</th><th>Buyer</th><th>Expected delivery</th><th>Status</th><th /></tr></thead>
          <tbody>{state.result.data.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{order.request_title}</td><td>{order.buyer_business_name}</td>
            <td>{order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString() : '—'}</td><td><StatusBadge>{order.status}</StatusBadge></td>
            <td><Link to={`/supplier/orders/${order.id}`}>Open order</Link></td></tr>)}</tbody></table></div>}
    <Pagination page={state.page} totalPages={state.result.totalPages} total={state.result.total || 0} onPageChange={state.setPage} isLoading={state.isLoading} />
  </section>;
}
