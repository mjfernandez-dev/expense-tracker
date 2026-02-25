// COMPONENTE RAÍZ: Aplicación con diseño moderno usando Tailwind
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Movimiento } from './types';
import MovimientoForm from './components/MovimientoForm';
import MovimientoList from './components/MovimientoList';
import CategoryManager from './components/CategoryManager';
import GastoFijoManager from './components/GastoFijoManager';
import { useAuth } from './context/useAuth';

function App() {
  const [movimientoToEdit, setMovimientoToEdit] = useState<Movimiento | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [categoriesKey, setCategoriesKey] = useState<number>(0);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [configTab, setConfigTab] = useState<'categorias' | 'gastos-fijos'>('categorias');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleMovimientoCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleMovimientoUpdated = () => {
    setMovimientoToEdit(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleCategoriesChanged = () => {
    setCategoriesKey(prev => prev + 1);
  };

  const handleEdit = (movimiento: Movimiento) => {
    setMovimientoToEdit(movimiento);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setMovimientoToEdit(null);
  };

  const toggleConfig = () => {
    setShowConfig(prev => !prev);
  };

  return (
    // CONTENEDOR PRINCIPAL: BlueGlass Design System
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">

        {/* HEADER CON USUARIO */}
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
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Mi Cuenta
            </button>
            <button
              onClick={logout}
              className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 text-white font-medium px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-300/50 transition-all duration-200"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* BOTÓN CONFIGURACIÓN */}
        <div className="mb-6">
          <button
            onClick={toggleConfig}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-5 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
          >
            {showConfig ? 'Ocultar Configuración' : 'Configuración'}
          </button>
        </div>

        {/* PANEL DE CONFIGURACIÓN con tabs */}
        {showConfig && (
          <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 mb-6">
            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-slate-950/50 rounded-xl w-fit">
              <button
                onClick={() => setConfigTab('categorias')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  configTab === 'categorias'
                    ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Categorías
              </button>
              <button
                onClick={() => setConfigTab('gastos-fijos')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  configTab === 'gastos-fijos'
                    ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Gastos Fijos
              </button>
            </div>

            {/* Contenido del tab activo */}
            {configTab === 'categorias' && (
              <CategoryManager onCategoriesChanged={handleCategoriesChanged} />
            )}
            {configTab === 'gastos-fijos' && (
              <GastoFijoManager />
            )}
          </div>
        )}

        {/* FORMULARIO DE MOVIMIENTOS */}
        <MovimientoForm
          categoriesVersion={categoriesKey}
          onMovimientoCreated={handleMovimientoCreated}
          onMovimientoUpdated={handleMovimientoUpdated}
          movimientoToEdit={movimientoToEdit}
          onCancelEdit={handleCancelEdit}
        />

        {/* LISTA DE MOVIMIENTOS */}
        <MovimientoList
          key={refreshKey}
          onEdit={handleEdit}
        />
      </div>
    </div>
  );
}

export default App;
