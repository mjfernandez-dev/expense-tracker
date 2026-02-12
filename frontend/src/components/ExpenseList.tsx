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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteRequest = (id: number) => {
    setDeleteTarget(id);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return;
    setIsDeleting(true);
    try {
      await deleteExpense(deleteTarget);
      await fetchExpenses();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
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
        <>
        {/* DESKTOP: Tabla clásica */}
        <div className="hidden sm:block overflow-x-auto">
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
                        onClick={() => handleDeleteRequest(expense.id)}
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

        {/* MÓVIL: Lista compacta con acordeón */}
        <div className="sm:hidden space-y-2">
          {filteredExpenses.map((expense) => {
            const isExpanded = expandedId === expense.id;
            return (
              <div
                key={expense.id}
                className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden"
              >
                {/* Resumen (siempre visible) */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                  className="w-full px-4 py-3 text-left"
                >
                  {/* Línea 1: Descripción + Monto */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-100 truncate mr-3">
                      {expense.descripcion}
                    </span>
                    <span className="text-sm font-bold text-white whitespace-nowrap">
                      ${expense.importe.toFixed(2)}
                    </span>
                  </div>
                  {/* Línea 2: Fecha + Categoría + Chevron */}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {new Date(expense.fecha).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        {expense.categoria.nombre}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Detalle expandible con animación */}
                <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="px-4 pb-3 pt-1 border-t border-slate-700/40">
                    {expense.nota && (
                      <p className="text-xs text-slate-400 mb-3">
                        <span className="text-slate-500">Nota:</span> {expense.nota}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(expense)}
                        className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteRequest(expense.id)}
                        className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Total del mes - móvil */}
          <div className="bg-slate-800/40 border border-slate-600 rounded-xl px-4 py-3 flex items-center justify-between mt-3">
            <span className="text-sm font-bold text-white">Total:</span>
            <span className="text-sm font-bold text-white">${totalMes.toFixed(2)}</span>
          </div>
        </div>
        </>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteTarget(null)} />
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar gasto</h3>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro de que deseas eliminar este gasto? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-medium py-2.5 rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-300/50 transition-all text-sm"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpenseList;
