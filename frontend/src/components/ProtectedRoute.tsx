import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Mientras carga, mostrar skeleton del app (coincide con el shell HTML pre-React)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 flex flex-col" role="status" aria-label="Cargando aplicación">
        <div className="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/70">
          <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex flex-col gap-0.5">
              <div className="h-5 w-28 bg-slate-600/30 rounded-md animate-pulse" />
              <div className="h-2.5 w-20 bg-slate-600/20 rounded animate-pulse" />
            </div>
            <div className="h-7 w-16 bg-slate-600/30 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 pt-4 box-border">
          <div className="bg-slate-700/30 border border-slate-600/40 rounded-2xl p-4 animate-pulse h-44" />
        </div>
        <div className="bg-slate-800/90 backdrop-blur-xl border-t border-slate-700/70">
          <div className="max-w-6xl mx-auto flex justify-center gap-4 px-4 py-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-9 w-12 bg-slate-600/25 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Si no está autenticado, redirigir a login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Si está autenticado, mostrar el contenido
  return <>{children}</>;
}
