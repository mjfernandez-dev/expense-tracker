import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import PresupuestoManager from '../components/PresupuestoManager';

function AccountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Refrescar la plantilla al volver a la pestaña (datos sin cache obsoleto)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setRefreshKey(k => k + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Mi Cuenta</h1>
            <span className="text-slate-300 text-sm sm:text-base">
              Hola, <span className="font-medium text-white">{user?.username}</span>
            </span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
          >
            Volver al inicio
          </button>
        </div>

        {/* OPCIONES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

          {/* Card: Plantilla de presupuesto (configuración) */}
          <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 sm:col-span-2">
            <h3 className="text-xl font-bold text-white mb-1">Plantilla de presupuesto</h3>
            <p className="text-sm text-slate-400 mb-4">
              Define los defaults que el ciclo y el asistente consumen.
            </p>
            <PresupuestoManager refreshKey={refreshKey} />
          </div>

          {/* Card: Cambiar Contraseña */}
          <div
            onClick={() => navigate('/account/change-password')}
            className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all duration-300 cursor-pointer group"
          >
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
              Cambiar Contraseña
            </h3>
            <p className="text-sm text-slate-400">
              Actualiza tu contraseña de acceso a la aplicacion.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default AccountPage;
