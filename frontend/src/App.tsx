// COMPONENTE RAÍZ: Aplicación con diseño moderno usando Tailwind
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Expense } from './types';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import CategoryManager from './components/CategoryManager';
import { useAuth } from './context/useAuth';

function App() {
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [categoriesKey, setCategoriesKey] = useState<number>(0);
  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleExpenseCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleExpenseUpdated = () => {
    setExpenseToEdit(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleCategoriesChanged = () => {
    setCategoriesKey(prev => prev + 1);
  };

  const handleEdit = (expense: Expense) => {
    setExpenseToEdit(expense);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setExpenseToEdit(null);
  };

  const toggleCategoryManager = () => {
    setShowCategoryManager(prev => !prev);
  };

  return (
    // CONTENEDOR PRINCIPAL: BlueGlass Design System
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">

        {/* HEADER CON USUARIO */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Registro de Gastos</h1>
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

        {/* BOTÓN GESTIONAR CATEGORÍAS */}
        <div className="mb-6">
          <button
            onClick={toggleCategoryManager}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-5 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
          >
            {showCategoryManager ? 'Ocultar Categorias' : 'Gestionar Categorias'}
          </button>
        </div>
        
        {/* PANEL DE CATEGORÍAS */}
        {showCategoryManager && <CategoryManager onCategoriesChanged={handleCategoriesChanged} />}

        {/* FORMULARIO DE GASTOS */}
        <ExpenseForm
          categoriesVersion={categoriesKey}
          onExpenseCreated={handleExpenseCreated}
          onExpenseUpdated={handleExpenseUpdated}
          expenseToEdit={expenseToEdit}
          onCancelEdit={handleCancelEdit}
        />
        
        {/* LISTA DE GASTOS */}
        <ExpenseList 
          key={refreshKey}
          onEdit={handleEdit}
        />
      </div>
    </div>
  );
}

export default App;
