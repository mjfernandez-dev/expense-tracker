// COMPONENTE RAÍZ: Aplicación con diseño moderno usando Tailwind
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Movimiento } from './types';
import MovimientoModal from './components/MovimientoModal';
import MovimientoList from './components/MovimientoList';
import DashboardCiclo from './components/DashboardCiclo';
import BalanceCiclo from './components/BalanceCiclo';
import CicloWizard from './components/CicloWizard';
import PresupuestoManager from './components/PresupuestoManager';
import InversionesDashboard from './components/InversionesDashboard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useAuth } from './context/useAuth';
import { createMovimiento } from './services/api';

type Tab = 'inicio' | 'movimientos' | 'balance' | 'presupuesto' | 'inversiones';
import { getPendingOperations, removePendingOperation } from './services/offlineDB';

function App() {
  const [tab, setTab] = useState<Tab>('inicio');
  const [movimientoToEdit, setMovimientoToEdit] = useState<Movimiento | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Estado del wizard de ciclo
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [wizardMovimientoId, setWizardMovimientoId] = useState<number | null>(null);
  const [wizardImporte, setWizardImporte] = useState<number>(0);

  const handleMovimientoCreated = (movimiento?: Movimiento) => {
    setShowModal(false);
    setRefreshKey(prev => prev + 1);
    // Si el ingreso fue marcado como inicio de ciclo, abrir el wizard
    if (movimiento?.es_inicio_ciclo && movimiento.tipo === 'ingreso') {
      setWizardMovimientoId(movimiento.id);
      setWizardImporte(movimiento.importe);
      setShowWizard(true);
    }
  };

  const handleMovimientoUpdated = () => {
    setShowModal(false);
    setMovimientoToEdit(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleEdit = (movimiento: Movimiento) => {
    setMovimientoToEdit(movimiento);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setMovimientoToEdit(null);
  };

  const handleWizardComplete = () => {
    setShowWizard(false);
    setWizardMovimientoId(null);
    setWizardImporte(0);
    setRefreshKey(prev => prev + 1);
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setWizardMovimientoId(null);
    setWizardImporte(0);
  };

  const syncPendingQueue = useCallback(async () => {
    const pending = await getPendingOperations();
    if (pending.length === 0) return;
    for (const op of pending) {
      try {
        if (op.type === 'createMovimiento') {
          await createMovimiento(op.payload); // navigator.onLine=true, no encolará de nuevo
          await removePendingOperation(op.id!);
        }
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Error al sincronizar operaciones pendientes');
        break;
      }
    }
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    window.addEventListener('online', syncPendingQueue);
    return () => window.removeEventListener('online', syncPendingQueue);
  }, [syncPendingQueue]);

  // Recargar cuando el service worker se actualice (nuevo deploy)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handler = () => window.location.reload();
      navigator.serviceWorker.addEventListener('controllerchange', handler);
      return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
    }
  }, []);

  const tabLabel: Record<Tab, string> = {
    inicio: 'Inicio',
    movimientos: 'Movimientos',
    balance: 'Balance',
    presupuesto: 'Presupuesto',
    inversiones: 'Inversiones',
  };

  const tabIcon: Record<Tab, string> = {
    inicio: '⚡',
    movimientos: '📋',
    balance: '📊',
    presupuesto: '💰',
    inversiones: '📈',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900">
      <OfflineIndicator />

      {/* HEADER */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/70 shadow-lg sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Mis Finanzas</h1>
            <span className="text-slate-400 text-xs">
              Hola, <span className="font-medium text-slate-300">{user?.username}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/account')}
              className="border border-slate-600/70 bg-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
            >
              Cuenta
            </button>
            <button
              onClick={logout}
              className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1.5 rounded-lg hover:bg-slate-800/40 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* ERROR DE SINCRONIZACIÓN OFFLINE */}
      {syncError && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-2 rounded-lg text-sm flex justify-between items-center">
            <span>{syncError}</span>
            <button onClick={() => setSyncError(null)} className="text-red-300 hover:text-red-100 ml-4">✕</button>
          </div>
        </div>
      )}

      {/* CONTENIDO POR TAB */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-32 pt-4">

        {tab === 'inicio' && (
          <>
            <DashboardCiclo refreshKey={refreshKey} />
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-8 py-3 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200 active:scale-95"
              >
                <span className="text-lg leading-none font-light">+</span>
                Registrar movimiento
              </button>
            </div>
          </>
        )}

        {tab === 'movimientos' && (
          <MovimientoList key={refreshKey} onEdit={handleEdit} />
        )}

        {tab === 'balance' && (
          <BalanceCiclo refreshKey={refreshKey} />
        )}

        {tab === 'presupuesto' && (
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 sm:p-6">
            <PresupuestoManager />
          </div>
        )}

        {tab === 'inversiones' && (
          <InversionesDashboard refreshKey={refreshKey} />
        )}

      </div>

      {/* BOTTOM TAB BAR */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/90 backdrop-blur-xl border-t border-slate-700/70 shadow-lg">
        <div className="max-w-6xl mx-auto flex">
          {(['inicio', 'movimientos', 'balance', 'presupuesto', 'inversiones'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                tab === t
                  ? 'text-blue-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-lg leading-none">{tabIcon[t]}</span>
              <span className="text-xs font-medium">{tabLabel[t]}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* FAB: solo en Movimientos para no duplicar la acción */}
      {tab === 'movimientos' && (
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-300/30 active:scale-95 transition-all duration-150 flex items-center justify-center"
          aria-label="Registrar movimiento"
        >
          <span className="text-2xl leading-none font-light -mt-0.5">+</span>
        </button>
      )}

      {/* MODAL */}
      <MovimientoModal
        isOpen={showModal}
        onClose={handleCloseModal}
        movimientoToEdit={movimientoToEdit}
        onMovimientoCreated={handleMovimientoCreated}
        onMovimientoUpdated={handleMovimientoUpdated}
      />

      {/* WIZARD */}
      {showWizard && (
        <CicloWizard
          movimientoOrigenId={wizardMovimientoId}
          importeReferencia={wizardImporte}
          onComplete={handleWizardComplete}
          onClose={handleWizardClose}
          porcentajeAhorro={user?.porcentaje_ahorro_default ?? 10}
        />
      )}
    </div>
  );
}

export default App;
