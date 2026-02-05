// COMPONENTE RAÍZ: Aplicación con diseño moderno usando Tailwind
import { useState } from 'react';
import type { Expense } from './types';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import CategoryManager from './components/CategoryManager';

function App() {
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);

  const handleExpenseCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleExpenseUpdated = () => {
    setExpenseToEdit(null);
    setRefreshKey(prev => prev + 1);
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
    // CONTENEDOR PRINCIPAL: Fondo gris claro, padding, centrado
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        
        {/* ENCABEZADO */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Registro de Gastos</h1>
          <p className="text-gray-600">Gestiona tus finanzas personales de forma simple</p>
        </div>
        
        {/* BOTÓN GESTIONAR CATEGORÍAS */}
        <div className="mb-6">
          <button 
            onClick={toggleCategoryManager}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors duration-200"
          >
            {showCategoryManager ? '✕ Ocultar Categorías' : '⚙️ Gestionar Categorías'}
          </button>
        </div>
        
        {/* PANEL DE CATEGORÍAS */}
        {showCategoryManager && <CategoryManager />}
        
        {/* FORMULARIO DE GASTOS */}
        <ExpenseForm 
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
