import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import CatalogPage from './pages/CatalogPage';
import InventoryPage from './pages/InventoryPage';
import AdminCatalogPage from './pages/AdminCatalogPage';
import PurchaseRequestCreatePage from './pages/PurchaseRequestCreatePage';
import PurchaseRequestsPage from './pages/PurchaseRequestsPage';
import PurchaseRequestDetailPage from './pages/PurchaseRequestDetailPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import PurchaseOrderDetailPage from './pages/PurchaseOrderDetailPage';
import AppShell from './components/AppShell';
import { ToastProvider } from './components/ToastProvider';
import {
  AdminAuditLogsPage,
  AdminOrderDetailPage,
  AdminOrdersPage,
  AdminSuppliersPage,
  AdminUsersPage,
  AnalyticsPage,
  DisputePage,
  InvoiceDetailPage,
  InvoiceListPage,
  NotificationListPage,
  SupplierDetailPage,
  SupplierDirectoryPage,
  SupplierProductsPage,
  SupplierQuotationsPage,
  ShipmentsPage,
} from './pages/WorkspacePages';

function RequireAuth({ children }) {
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);

  if (isLoading) return <main className="page-message">Restoring your session…</main>;
  if (!user) return <Navigate to="/login" replace />;
  return children || <Outlet />;
}

function RequireRole({ role, children }) {
  const user = useAuthStore((state) => state.user);
  if (!user?.roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireAnyRole({ roles, children }) {
  const user = useAuthStore((state) => state.user);
  if (!user?.roles.some((role) => roles.includes(role))) return <Navigate to="/dashboard" replace />;
  return children;
}

function AuthBootstrap({ children }) {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    bootstrap().catch((bootstrapError) => {
      if (active) setError(bootstrapError.message || 'Could not restore your session');
    });
    return () => {
      active = false;
    };
  }, [bootstrap]);

  if (isLoading) return <main className="page-message">Restoring your session…</main>;
  if (error) return <main className="page-message error-message">{error}</main>;
  return children;
}

function HomeRedirect() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthBootstrap>
          <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="notifications" element={<NotificationListPage />} />
            <Route path="products" element={<RequireRole role="BUYER"><CatalogPage /></RequireRole>} />
            <Route path="suppliers" element={<RequireRole role="BUYER"><SupplierDirectoryPage /></RequireRole>} />
            <Route path="suppliers/:id" element={<RequireRole role="BUYER"><SupplierDetailPage /></RequireRole>} />
            <Route path="purchase-requests" element={<RequireRole role="BUYER"><PurchaseRequestsPage /></RequireRole>} />
            <Route path="purchase-requests/new" element={<RequireRole role="BUYER"><PurchaseRequestCreatePage /></RequireRole>} />
            <Route path="purchase-requests/:id" element={<RequireRole role="BUYER"><PurchaseRequestDetailPage /></RequireRole>} />
            <Route path="purchase-orders" element={<RequireRole role="BUYER"><PurchaseOrdersPage /></RequireRole>} />
            <Route path="purchase-orders/:id" element={<RequireRole role="BUYER"><PurchaseOrderDetailPage /></RequireRole>} />
            <Route path="invoices" element={<RequireAnyRole roles={['BUYER', 'SUPPLIER']}><InvoiceListPage /></RequireAnyRole>} />
            <Route path="invoices/:id" element={<RequireAnyRole roles={['BUYER', 'SUPPLIER']}><InvoiceDetailPage /></RequireAnyRole>} />
            <Route path="disputes" element={<RequireAnyRole roles={['BUYER', 'SUPPLIER']}><DisputePage /></RequireAnyRole>} />
            <Route path="supplier/products" element={<RequireRole role="SUPPLIER"><SupplierProductsPage /></RequireRole>} />
            <Route path="inventory" element={<RequireRole role="SUPPLIER"><InventoryPage /></RequireRole>} />
            <Route path="supplier/requests" element={<RequireRole role="SUPPLIER"><PurchaseRequestsPage /></RequireRole>} />
            <Route path="supplier/requests/:id" element={<RequireRole role="SUPPLIER"><PurchaseRequestDetailPage supplierView /></RequireRole>} />
            <Route path="supplier/quotations" element={<RequireRole role="SUPPLIER"><SupplierQuotationsPage /></RequireRole>} />
            <Route path="supplier/orders" element={<RequireRole role="SUPPLIER"><PurchaseOrdersPage supplierView /></RequireRole>} />
            <Route path="supplier/orders/:id" element={<RequireRole role="SUPPLIER"><PurchaseOrderDetailPage supplierView /></RequireRole>} />
            <Route path="supplier/shipments" element={<RequireRole role="SUPPLIER"><ShipmentsPage /></RequireRole>} />
            <Route path="supplier/disputes" element={<RequireRole role="SUPPLIER"><DisputePage /></RequireRole>} />
            <Route path="supplier/analytics" element={<RequireRole role="SUPPLIER"><AnalyticsPage /></RequireRole>} />
            <Route path="admin/catalog" element={<RequireRole role="ADMIN"><AdminCatalogPage /></RequireRole>} />
            <Route path="admin/users" element={<RequireRole role="ADMIN"><AdminUsersPage /></RequireRole>} />
            <Route path="admin/suppliers" element={<RequireRole role="ADMIN"><AdminSuppliersPage /></RequireRole>} />
            <Route path="admin/orders" element={<RequireRole role="ADMIN"><AdminOrdersPage /></RequireRole>} />
            <Route path="admin/orders/:id" element={<RequireRole role="ADMIN"><AdminOrderDetailPage /></RequireRole>} />
            <Route path="admin/disputes" element={<RequireRole role="ADMIN"><DisputePage admin /></RequireRole>} />
            <Route path="admin/audit-logs" element={<RequireRole role="ADMIN"><AdminAuditLogsPage /></RequireRole>} />
            <Route path="admin/analytics" element={<RequireRole role="ADMIN"><AnalyticsPage /></RequireRole>} />
          </Route>
          <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </AuthBootstrap>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
