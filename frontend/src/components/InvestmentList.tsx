import { useEffect, useState, useCallback } from 'react';
import type { Investment } from '../types';
import { getInvestments } from '../services/api';

interface InvestmentListProps {
  onEdit: (investment: Investment) => void;
  onCreate: () => void;
  refreshKey?: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function InvestmentList({ onEdit, onCreate, refreshKey }: InvestmentListProps) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvestments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInvestments();
      setInvestments(data);
    } catch {
      setError('Error al cargar las inversiones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestments();
  }, [fetchInvestments, refreshKey]);

  if (loading) {
    return (
      <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-6">
        <div className="text-center text-slate-300">Cargando inversiones...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-6">
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
        <button
          onClick={fetchInvestments}
          className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Inversiones</h2>

      {investments.length === 0 ? (
        <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-8 text-center">
          <p className="text-slate-300 text-lg mb-2">Todavía no tenés inversiones registradas</p>
          <p className="text-slate-400 text-sm mb-6">
            Comenzá registrando tu primera inversión para hacerle seguimiento.
          </p>
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-6 py-3 rounded-full transition-all active:scale-95"
          >
            <span className="text-lg leading-none font-light">+</span>
            Nueva inversión
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {investments.map((inv) => {
            const ganancia = inv.ganancia_perdida_ars;
            const isPositive = ganancia !== null && ganancia >= 0;
            return (
              <button
                key={inv.id}
                onClick={() => onEdit(inv)}
                className="text-left bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 hover:border-blue-500/50 transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.15)] active:scale-[0.98]"
              >
                <h3 className="text-lg font-semibold text-white mb-3 truncate">
                  {inv.nombre}
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Total invertido</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {formatARS(inv.total_invertido_ars)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Valor actual</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {inv.valor_actual_ars !== null ? formatARS(inv.valor_actual_ars) : 'Pendiente'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                    <span className="text-xs text-slate-400">Ganancia / Pérdida</span>
                    {ganancia !== null ? (
                      <span className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{formatARS(ganancia)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-500">—</span>
                    )}
                  </div>

                  {inv.rendimiento_pct !== null && (
                    <div className="flex justify-end">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        inv.rendimiento_pct >= 0
                          ? 'bg-green-500/20 text-green-300 border-green-400/30'
                          : 'bg-red-500/20 text-red-300 border-red-400/30'
                      }`}>
                        {inv.rendimiento_pct >= 0 ? '+' : ''}{inv.rendimiento_pct.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating action button */}
      <button
        onClick={onCreate}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-300/30 active:scale-95 transition-all duration-150 flex items-center justify-center"
        aria-label="Nueva inversión"
      >
        <span className="text-2xl leading-none font-light -mt-0.5">+</span>
      </button>
    </div>
  );
}

export default InvestmentList;
