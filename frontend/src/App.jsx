import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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

function RequireAuth({ children }) {
  const isLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);

  if (isLoading) return <main className="page-message">Restoring your session…</main>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ role, children }) {
  const user = useAuthStore((state) => state.user);
  if (!user?.roles.includes(role)) return <Navigate to="/dashboard" replace />;
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
      <AuthBootstrap>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route
            path="/dashboard"
            element={<RequireAuth><DashboardPage /></RequireAuth>}
          />
          <Route
            path="/inventory"
            element={(
              <RequireAuth>
                <RequireRole role="SUPPLIER"><InventoryPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/admin/catalog"
            element={(
              <RequireAuth>
                <RequireRole role="ADMIN"><AdminCatalogPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/purchase-requests"
            element={(
              <RequireAuth>
                <RequireRole role="BUYER"><PurchaseRequestsPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/purchase-requests/new"
            element={(
              <RequireAuth>
                <RequireRole role="BUYER"><PurchaseRequestCreatePage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/purchase-requests/:id"
            element={(
              <RequireAuth>
                <RequireRole role="BUYER"><PurchaseRequestDetailPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/purchase-orders"
            element={(
              <RequireAuth>
                <RequireRole role="BUYER"><PurchaseOrdersPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/purchase-orders/:id"
            element={(
              <RequireAuth>
                <RequireRole role="BUYER"><PurchaseOrderDetailPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/supplier/requests"
            element={(
              <RequireAuth>
                <RequireRole role="SUPPLIER"><PurchaseRequestsPage /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/supplier/requests/:id"
            element={(
              <RequireAuth>
                <RequireRole role="SUPPLIER"><PurchaseRequestDetailPage supplierView /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/supplier/orders"
            element={(
              <RequireAuth>
                <RequireRole role="SUPPLIER"><PurchaseOrdersPage supplierView /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/supplier/orders/:id"
            element={(
              <RequireAuth>
                <RequireRole role="SUPPLIER"><PurchaseOrderDetailPage supplierView /></RequireRole>
              </RequireAuth>
            )}
          />
          <Route
            path="/profile"
            element={<RequireAuth><ProfilePage /></RequireAuth>}
          />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
  );
}

export default App;
