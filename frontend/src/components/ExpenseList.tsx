// COMPONENTE: Lista de gastos con tabla moderna usando Tailwind
import { useEffect, useState } from 'react';
import type { Expense } from '../types';
import { getExpenses, deleteExpense } from '../services/api';

interface ExpenseListProps {
  onEdit?: (expense: Expense) => void;
}

function ExpenseList({ onEdit }: ExpenseListProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const data = await getExpenses();
      setExpenses(data);
    } catch (err) {
      setError('Error al cargar los gastos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este gasto?')) {
      return;
    }

    try {
      await deleteExpense(id);
      await fetchExpenses();
    } catch (err) {
      alert('Error al eliminar el gasto');
      console.error(err);
    }
  };

  const handleEdit = (expense: Expense) => {
    if (onEdit) {
      onEdit(expense);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center text-gray-600">Cargando gastos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">📋 Lista de Gastos</h2>
      
      {expenses.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg">No hay gastos registrados.</p>
          <p className="text-sm mt-2">Comienza agregando tu primer gasto arriba ↑</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fecha</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descripción</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Categoría</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Importe</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nota</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(expense.fecha).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {expense.descripcion}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {expense.categoria.nombre}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                    ${expense.importe.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {expense.nota || <span className="text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => handleEdit(expense)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDelete(expense.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ExpenseList;