import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { updatePaymentInfo } from '../services/api';

function AccountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [alias, setAlias] = useState('');
  const [cvuValue, setCvuValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    if (user) {
      setAlias(user.alias_bancario || '');
      setCvuValue(user.cvu || '');
    }
  }, [user]);

  const handleSavePaymentInfo = async () => {
    try {
      setSaving(true);
      setSaved(false);
      await updatePaymentInfo(alias.trim() || null, cvuValue.trim() || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

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

        {/* MIS DATOS DE PAGO */}
        <div className="bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 border-l-blue-500 p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white">Mis Datos de Pago</h2>
            <button
              onClick={() => setShowPaymentForm(!showPaymentForm)}
              className="text-blue-300 hover:text-blue-200 font-medium text-sm transition-colors"
            >
              {showPaymentForm ? 'Ocultar' : 'Editar'}
            </button>
          </div>

          {!showPaymentForm ? (
            <div className="text-sm text-slate-300">
              {user?.alias_bancario || user?.cvu ? (
                <div className="flex flex-wrap gap-4">
                  {user?.alias_bancario && (
                    <span>Alias: <span className="font-mono text-white">{user.alias_bancario}</span></span>
                  )}
                  {user?.cvu && (
                    <span>CVU: <span className="font-mono text-white">{user.cvu}</span></span>
                  )}
                </div>
              ) : (
                <p className="text-slate-400">Configura tu alias y CVU para que aparezcan cuando te deban dinero en grupos.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-100 mb-1">Alias bancario</label>
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="Ej: mi.alias.mp"
                    className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-100 mb-1">CVU</label>
                  <input
                    type="text"
                    value={cvuValue}
                    onChange={(e) => setCvuValue(e.target.value)}
                    placeholder="Ej: 0000003100000000000001"
                    className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSavePaymentInfo}
                  disabled={saving}
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                {saved && (
                  <span className="text-green-300 text-sm font-medium">Guardado correctamente</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* GRID DE OPCIONES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

          {/* Card: Contactos */}
          <div
            onClick={() => navigate('/account/contacts')}
            className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all duration-300 cursor-pointer group"
          >
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
              Contactos
            </h3>
            <p className="text-sm text-slate-400">
              Gestiona tus amigos y sus datos de pago (alias, CVU) para transferencias rapidas.
            </p>
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
