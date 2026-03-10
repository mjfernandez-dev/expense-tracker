// COMPONENTE RAÍZ: Aplicación con diseño moderno usando Tailwind
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Movimiento } from './types';
import MovimientoModal from './components/MovimientoModal';
import MovimientoList from './components/MovimientoList';
import DashboardCiclo from './components/DashboardCiclo';
import CicloWizard from './components/CicloWizard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useAuth } from './context/useAuth';
import { createMovimiento } from './services/api';
import { getPendingOperations, removePendingOperation } from './services/offlineDB';

function App() {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900/70 py-4 sm:py-8">
      <OfflineIndicator />
      <div className="max-w-6xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Mis Finanzas</h1>
            <span className="text-slate-300 text-sm sm:text-base">
              Hola, <span className="font-medium text-white">{user?.username}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate('/tools')}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 transition-all duration-200"
            >
              Herramientas
            </button>
            <button
              onClick={() => navigate('/account')}
              className="border border-blue-400/60 bg-slate-700/50 text-blue-300 font-medium px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Mi Cuenta
            </button>
            <button
              onClick={logout}
              className="border border-slate-600/70 bg-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500 font-medium px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base rounded-lg transition-all duration-200"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* WIDGET DAILY SOLVENCY */}
        <DashboardCiclo refreshKey={refreshKey} />

        {/* ACCIÓN PRINCIPAL desktop: encima de la lista */}
        <div className="hidden sm:flex justify-end mb-4">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-5 py-2.5 rounded-xl shadow-[0_0_25px_rgba(59,130,246,0.5)] border border-blue-300/50 transition-all duration-200 hover:-translate-y-px"
          >
            <span className="text-xl leading-none font-light">+</span>
            Registrar movimiento
          </button>
        </div>

        {/* LISTA DE MOVIMIENTOS */}
        <MovimientoList
          key={refreshKey}
          onEdit={handleEdit}
        />
      </div>

      {/* FAB mobile: centrado en el fondo, solo visible en mobile */}
      <button
        onClick={() => setShowModal(true)}
        className="sm:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-[0_0_28px_rgba(59,130,246,0.6)] border border-blue-300/30 active:scale-95 transition-all duration-150"
        aria-label="Registrar movimiento"
      >
        <span className="text-xl leading-none font-light">+</span>
        Registrar
      </button>

      {/* MODAL: Registrar / Editar movimiento */}
      <MovimientoModal
        isOpen={showModal}
        onClose={handleCloseModal}
        movimientoToEdit={movimientoToEdit}
        onMovimientoCreated={handleMovimientoCreated}
        onMovimientoUpdated={handleMovimientoUpdated}
      />

      {/* WIZARD: Configuración de ciclo financiero */}
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
