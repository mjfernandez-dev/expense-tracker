// COMPONENTE RAÍZ: Aplicación con diseño moderno usando Tailwind
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Movimiento } from './types';
import MovimientoModal from './components/MovimientoModal';
import MovimientoList from './components/MovimientoList';
import DashboardCiclo from './components/DashboardCiclo';
import BalanceCiclo from './components/BalanceCiclo';
import CicloWizard from './components/CicloWizard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useAuth } from './context/useAuth';
import { createMovimiento } from './services/api';

type Tab = 'inicio' | 'movimientos' | 'balance';
import { getPendingOperations, removePendingOperation } from './services/offlineDB';

function App() {
  const [tab, setTab] = useState<Tab>('inicio');
  const [movimientoToEdit, setMovimientoToEdit] = useState<Movimiento | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [showModal, setShowModal] = useState<boolean>(false);
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
      } catch {
        break; // parar en el primer error (ej: sesión expirada)
      }
    }
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    window.addEventListener('online', syncPendingQueue);
    return () => window.removeEventListener('online', syncPendingQueue);
  }, [syncPendingQueue]);

  const tabLabel: Record<Tab, string> = {
    inicio: 'Inicio',
    movimientos: 'Movimientos',
    balance: 'Balance',
  };

  const tabIcon: Record<Tab, string> = {
    inicio: '⚡',
    movimientos: '📋',
    balance: '📊',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900/70">
      <OfflineIndicator />

      {/* HEADER */}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-2">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Mis Finanzas</h1>
            <span className="text-slate-400 text-xs">
              Hola, <span className="font-medium text-slate-300">{user?.username}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/tools')}
              className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
            >
              Herramientas
            </button>
            <button
              onClick={() => navigate('/account')}
              className="text-slate-400 hover:text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
            >
              Cuenta
            </button>
            <button
              onClick={logout}
              className="text-slate-500 hover:text-slate-300 text-xs px-3 py-1.5 rounded-lg hover:bg-slate-800/40 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      {/* CONTENIDO POR TAB */}
      <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-32 pt-2">

        {tab === 'inicio' && (
          <>
            <DashboardCiclo refreshKey={refreshKey} />
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-6 py-3 rounded-xl shadow-[0_0_25px_rgba(59,130,246,0.5)] border border-blue-300/50 transition-all duration-200 hover:-translate-y-px"
              >
                <span className="text-xl leading-none font-light">+</span>
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

      </div>

      {/* BOTTOM TAB BAR */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/60 safe-area-pb">
        <div className="max-w-2xl mx-auto flex">
          {(['inicio', 'movimientos', 'balance'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors ${
                tab === t ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-lg leading-none">{tabIcon[t]}</span>
              <span className="text-[10px] font-medium">{tabLabel[t]}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* FAB mobile (tab inicio) */}
      {tab !== 'inicio' && (
        <button
          onClick={() => setShowModal(true)}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-300/30 active:scale-95 transition-all duration-150 flex items-center justify-center"
          aria-label="Registrar movimiento"
        >
          <span className="text-2xl leading-none font-light mt-[-2px]">+</span>
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
        />
      )}
    </div>
  );
}

export default App;
