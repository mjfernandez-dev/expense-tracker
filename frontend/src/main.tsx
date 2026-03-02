import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthProvider.tsx';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

// Páginas públicas: carga estática (son el punto de entrada)
import Login from './pages/Login.tsx';
import Register from './pages/Register.tsx';
import ForgotPassword from './pages/ForgotPassword.tsx';
import ResetPassword from './pages/ResetPassword.tsx';

// Páginas protegidas: lazy loading (solo las ve el usuario autenticado)
const App = lazy(() => import('./App.tsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.tsx'));
const ChangePassword = lazy(() => import('./pages/ChangePassword.tsx'));
const ContactsPage = lazy(() => import('./pages/ContactsPage.tsx'));
const Tools = lazy(() => import('./pages/Tools.tsx'));
const CategoriasPage = lazy(() => import('./pages/CategoriasPage.tsx'));
const RecurrentesPage = lazy(() => import('./pages/RecurrentesPage.tsx'));
const SplitGroupsPage = lazy(() => import('./pages/SplitGroupsPage.tsx'));
const SplitGroupDetail = lazy(() => import('./pages/SplitGroupDetail.tsx'));
const PaymentResultPage = lazy(() => import('./pages/PaymentResultPage.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div style={{ background: '#020617', minHeight: '100vh' }} />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <AccountPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account/change-password"
                element={
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account/contacts"
                element={
                  <ProtectedRoute>
                    <ContactsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools"
                element={
                  <ProtectedRoute>
                    <Tools />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools/categorias"
                element={
                  <ProtectedRoute>
                    <CategoriasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools/recurrentes"
                element={
                  <ProtectedRoute>
                    <RecurrentesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools/split-groups"
                element={
                  <ProtectedRoute>
                    <SplitGroupsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools/split-groups/:groupId"
                element={
                  <ProtectedRoute>
                    <SplitGroupDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payments/result"
                element={
                  <ProtectedRoute>
                    <PaymentResultPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <App />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

// SERVICE WORKER DESHABILITADO TEMPORALMENTE
// TODO: Reactivar cuando la app básica esté estable
// if ('serviceWorker' in navigator && import.meta.env.PROD) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js')
//       .then((registration) => {
//         console.log('Service Worker registrado:', registration);
//       })
//       .catch((error) => {
//         console.log('Error al registrar Service Worker:', error);
//       });
//   });
// }

// Desregistrar cualquier Service Worker existente
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}
