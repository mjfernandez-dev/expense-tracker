import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import Login from './pages/Login.tsx';
import Register from './pages/Register.tsx';
import ForgotPassword from './pages/ForgotPassword.tsx';
import ResetPassword from './pages/ResetPassword.tsx';
import ChangePassword from './pages/ChangePassword.tsx';
import Tools from './pages/Tools.tsx';
import AccountPage from './pages/AccountPage.tsx';
import ContactsPage from './pages/ContactsPage.tsx';
import SplitGroupsPage from './pages/SplitGroupsPage.tsx';
import SplitGroupDetail from './pages/SplitGroupDetail.tsx';
import PaymentResultPage from './pages/PaymentResultPage.tsx';
import { AuthProvider } from './context/AuthProvider.tsx';
import ProtectedRoute from './components/ProtectedRoute.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
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
