// COMPONENTE: Lista de gastos con tabla moderna usando Tailwind
import { useEffect, useState, useMemo } from 'react';
import type { Expense } from '../types';
import { getExpenses, deleteExpense } from '../services/api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

interface ExpenseListProps {
  onEdit?: (expense: Expense) => void;
}

function ExpenseList({ onEdit }: ExpenseListProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

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

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((expense) => {
        const date = new Date(expense.fecha);
        return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [expenses, selectedYear, selectedMonth]);

  const totalMes = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + exp.importe, 0);
  }, [filteredExpenses]);

  const totalesPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses.forEach((exp) => {
      const catName = exp.categoria.nombre;
      map.set(catName, (map.get(catName) || 0) + exp.importe);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

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
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <div className="text-center text-slate-300">Cargando gastos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
      <h2 className="text-2xl font-bold mb-4 text-white">Lista de Gastos</h2>

      {/* SELECTOR DE MES */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="border border-blue-400/70 bg-slate-800/40 text-blue-300 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-all"
        >
          &larr; Anterior
        </button>
        <h3 className="text-lg font-semibold text-white">
          {MESES[selectedMonth]} {selectedYear}
        </h3>
        <button
          onClick={handleNextMonth}
          className="border border-blue-400/70 bg-slate-800/40 text-blue-300 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-all"
        >
          Siguiente &rarr;
        </button>
      </div>

      {/* RESUMEN DEL MES */}
      <div className="bg-blue-500/10 border border-blue-300/60 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-200">
            Total {MESES[selectedMonth]}
          </span>
          <span className="text-2xl font-bold text-blue-100">
            ${totalMes.toFixed(2)}
          </span>
        </div>
        {totalesPorCategoria.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {totalesPorCategoria.map(([catName, amount]) => (
              <span
                key={catName}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30"
              >
                {catName}: ${amount.toFixed(2)}
              </span>
            ))}
          </div>
        )}
      </div>

      {filteredExpenses.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <p className="text-lg">No hay gastos en {MESES[selectedMonth]} {selectedYear}.</p>
          <p className="text-sm mt-2">
            {expenses.length === 0
              ? 'Comienza agregando tu primer gasto arriba'
              : 'Prueba navegando a otro mes'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700/70">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Descripcion</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Categoria</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300 uppercase tracking-wider">Importe</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Nota</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {new Date(expense.fecha).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                    {expense.descripcion}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      {expense.categoria.nombre}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-white">
                    ${expense.importe.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {expense.nota || <span className="text-slate-500">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleEdit(expense)}
                        className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800/40 border-t-2 border-slate-600">
                <td colSpan={3} className="px-4 py-3 text-sm font-bold text-white text-right">
                  Total:
                </td>
                <td className="px-4 py-3 text-sm text-right font-bold text-white">
                  ${totalMes.toFixed(2)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default ExpenseList;
