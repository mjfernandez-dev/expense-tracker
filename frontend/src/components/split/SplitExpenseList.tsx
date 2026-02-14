import { useState } from 'react';
import type { SplitExpense } from '../../types';

interface SplitExpenseListProps {
  expenses: SplitExpense[];
  onEdit?: (expense: SplitExpense) => void;
  onDelete?: (expenseId: number) => Promise<void>;
}

function SplitExpenseList({ expenses, onEdit, onDelete }: SplitExpenseListProps) {
  const [deleteTarget, setDeleteTarget] = useState<SplitExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await onDelete?.(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const total = expenses.reduce((sum, e) => sum + e.importe, 0);

  if (expenses.length === 0) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Gastos del Grupo</h2>
        <div className="text-center py-8">
          <p className="text-slate-400 text-lg">No hay gastos registrados</p>
          <p className="text-slate-400 text-sm mt-1">Agrega un gasto con el formulario de arriba</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Gastos del Grupo</h2>

        {/* Desktop: Tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/60">
                <th className="text-left text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Fecha</th>
                <th className="text-left text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Descripcion</th>
                <th className="text-left text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Pagado por</th>
                <th className="text-right text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Importe</th>
                {(onEdit || onDelete) && (
                  <th className="text-right text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {expenses.map(expense => (
                <tr key={expense.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-300 text-sm">
                    {new Date(expense.fecha).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 text-slate-100">
                    <div>{expense.descripcion}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Dividido entre {expense.participants.length} personas (${(expense.importe / expense.participants.length).toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u)
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{expense.paid_by.display_name}</td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    ${expense.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  {(onEdit || onDelete) && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(expense)}
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                          >
                            Editar
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => setDeleteTarget(expense)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800/40 border-t-2 border-slate-600">
                <td colSpan={3} className="px-4 py-3 text-white font-semibold">Total</td>
                <td className="px-4 py-3 text-right text-white font-semibold">
                  ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile: Accordion Cards */}
        <div className="sm:hidden space-y-3">
          {expenses.map(expense => (
            <div key={expense.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === expense.id ? null : expense.id)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium">{expense.descripcion}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Pago {expense.paid_by.display_name} - {new Date(expense.fecha).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                  <span className="text-white font-semibold">
                    ${expense.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {expandedId === expense.id && (
                <div className="px-4 pb-4 border-t border-slate-700/50 pt-3">
                  <p className="text-sm text-slate-400 mb-2">
                    Dividido entre {expense.participants.length} personas: ${(expense.importe / expense.participants.length).toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {expense.participants.map(p => (
                      <span key={p.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                        {p.member.display_name}
                      </span>
                    ))}
                  </div>
                  {(onEdit || onDelete) && (
                  <div className="flex gap-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(expense)}
                        className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                      >
                        Editar
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => setDeleteTarget(expense)}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Total mobile */}
          <div className="bg-slate-800/40 border-t-2 border-slate-600 rounded-xl p-4 flex justify-between">
            <span className="text-white font-semibold">Total</span>
            <span className="text-white font-semibold">
              ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Modal eliminacion */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-3">Eliminar gasto</h3>
            <p className="text-slate-300 text-sm mb-4">
              ¿Eliminar "<span className="text-white font-medium">{deleteTarget.descripcion}</span>" por ${deleteTarget.importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-4 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 text-white font-semibold px-4 py-2 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)] border border-red-300/70 transition-all duration-200"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SplitExpenseList;
