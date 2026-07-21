import { StrictMode, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { AuthProvider } from './context/AuthProvider.tsx';
import ProtectedRoute from './components/ProtectedRoute.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

// Páginas públicas: carga estática (son el punto de entrada)
import Login from './pages/Login.tsx';
import Register from './pages/Register.tsx';
import ForgotPassword from './pages/ForgotPassword.tsx';
import ResetPassword from './pages/ResetPassword.tsx';
import App from './App.tsx';

// Páginas protegidas secundarias: lazy loading (solo las ve el usuario autenticado)
const AccountPage = lazy(() => import('./pages/AccountPage.tsx'));
const ChangePassword = lazy(() => import('./pages/ChangePassword.tsx'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <main id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
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
                path="/"
                element={
                  <ProtectedRoute>
                    <App />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateServiceWorker?.();
  },
});

// Service Worker gestionado por vite-plugin-pwa (registerType: 'autoUpdate')
