import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { AuthProvider, RateProvider, ThemeProvider, ToastProvider, useAuth } from './context/AppProviders';
import AppLayout from './components/layout/AppLayout';
import { PageLoader } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

// Route-level code splitting keeps the first load small.
const RetailPage = lazy(() => import('./pages/RetailPage'));
const WholesalePage = lazy(() => import('./pages/WholesalePage'));
const WholesaleBillPage = lazy(() => import('./pages/WholesaleBillPage'));
const PartyDetailPage = lazy(() => import('./pages/PartyDetailPage'));
const DistributionDetailPage = lazy(() => import('./pages/DistributionDetailPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomerDetailPage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const StockPage = lazy(() => import('./pages/StockPage'));
const GoldRatePage = lazy(() => import('./pages/GoldRatePage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const InvoicePage = lazy(() => import('./pages/BillingPage').then((m) => ({ default: m.InvoicePage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <RateProvider>
              <BrowserRouter>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                      element={
                        <RequireAuth>
                          <AppLayout />
                        </RequireAuth>
                      }
                    >
                      <Route index element={<DashboardPage />} />
                      <Route path="retail" element={<RetailPage />} />
                      <Route path="wholesale" element={<WholesalePage />} />
                      <Route path="wholesale/new-bill" element={<WholesaleBillPage />} />
                      <Route path="wholesale/parties/:id" element={<PartyDetailPage />} />
                      <Route path="wholesale/distributions/:id" element={<DistributionDetailPage />} />
                      <Route path="customers" element={<CustomersPage />} />
                      <Route path="customers/:id" element={<CustomerDetailPage />} />
                      <Route path="products" element={<ProductsPage />} />
                      <Route path="stock" element={<StockPage />} />
                      <Route path="gold-rate" element={<GoldRatePage />} />
                      <Route path="billing" element={<BillingPage />} />
                      <Route path="billing/:id" element={<InvoicePage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </RateProvider>
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
