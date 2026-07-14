import { useState, useEffect } from 'react';
import type { WishlistItem, PresupuestoItem, GoalContributionSource } from '../types';
import { contributeToGoal, withdrawFromGoal, getCicloActivo } from '../services/api';

interface GoalContributeFormProps {
  item: WishlistItem;
  mode: 'contribute' | 'withdraw';
  onSuccess: () => void;
  onClose: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

interface SourceEntry {
  id: string;
  source_type: 'disponible' | 'presupuesto';
  presupuesto_item_id: number | null;
  amount: string;
  label: string;
  max_amount: number;
}

function GoalContributeForm({ item, mode, onSuccess, onClose }: GoalContributeFormProps) {
  const isContribute = mode === 'contribute';

  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [presupuestoItems, setPresupuestoItems] = useState<PresupuestoItem[]>([]);
  const [saldoDisponible, setSaldoDisponible] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState<boolean>(false);

  // Cargar ciclo activo con resumen para obtener presupuesto items y disponible
  useEffect(() => {
    getCicloActivo().then((ciclo) => {
      if (!ciclo) {
        setError('No hay un ciclo activo. Creá uno antes de aportar a una meta.');
        return;
      }
      if (ciclo.resumen) {
        setPresupuestoItems(ciclo.resumen.presupuesto_items || []);
        setSaldoDisponible(ciclo.resumen.saldo_disponible_actual);
      }
    }).catch(() => {
      // Silencio — el error se muestra al intentar submit
    });
  }, []);

  // Inicializar con disponible como fuente por defecto
  useEffect(() => {
    if (isContribute && sources.length === 0) {
      addSource('disponible');
    }
  }, [isContribute, sources.length]);

  const addSource = (type: 'disponible' | 'presupuesto', itemId?: number) => {
    const entry: SourceEntry = {
      id: `${type}-${itemId ?? 'disp'}-${Date.now()}`,
      source_type: type,
      presupuesto_item_id: itemId ?? null,
      amount: '',
      label: type === 'disponible'
        ? 'Del disponible'
        : (() => {
            const pi = presupuestoItems.find((p) => p.id === itemId);
            return pi?.descripcion ?? `Categoría #${itemId}`;
          })(),
      max_amount: type === 'disponible'
        ? Math.max(0, saldoDisponible - _sumDisponibleSources(sources))
        : (() => {
            const pi = presupuestoItems.find((p) => p.id === itemId);
            if (!pi) return 0;
            return Math.max(0, pi.monto_estimado - pi.monto_ejecutado);
          })(),
    };
    setSources((prev) => [...prev, entry]);
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSourceAmount = (id: string, value: string) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, amount: value } : s))
    );
  };

  const _sumDisponibleSources = (srcs: SourceEntry[]) =>
    srcs
      .filter((s) => s.source_type === 'disponible')
      .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isContribute) {
        const validSources = sources.filter((s) => {
          const amt = parseFloat(s.amount);
          return !isNaN(amt) && amt > 0;
        });

        if (validSources.length === 0) {
          throw new Error('Agregá al menos una fuente con un monto válido');
        }

        const payloadSources: GoalContributionSource[] = validSources.map((s) => ({
          source_type: s.source_type,
          presupuesto_item_id: s.presupuesto_item_id,
          amount: parseFloat(s.amount),
        }));

        await contributeToGoal(item.id, { sources: payloadSources });
      } else {
        const amt = parseFloat(withdrawAmount);
        if (isNaN(amt) || amt <= 0) {
          throw new Error('Ingresá un monto válido para retirar');
        }
        await withdrawFromGoal(item.id, { amount: amt });
      }

      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la operación';
      if (msg.includes('400') || msg.includes('detail')) {
        // Try to extract detail from axios error
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        setError(axiosErr.response?.data?.detail ?? msg);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Bloquear scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const totalAmount = isContribute
    ? sources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
    : (parseFloat(withdrawAmount) || 0);

  const currentSavings = item.monto_ahorrado ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/70 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">
              {isContribute ? 'Aportar a meta' : 'Retirar de meta'}
            </h3>
            <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[320px]">{item.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Savings info */}
        <div className="bg-slate-800/40 rounded-xl p-3 mb-4 flex justify-between items-center">
          <span className="text-slate-400 text-sm">Ahorrado actual</span>
          <span className="text-green-400 font-semibold">{formatARS(currentSavings)}</span>
        </div>

        {isContribute && (
          <div className="bg-slate-800/40 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span className="text-slate-400 text-sm">Disponible</span>
            <span className="text-blue-400 font-semibold">{formatARS(saldoDisponible)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isContribute ? (
            <>
              {/* Sources */}
              <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                {sources.map((source) => (
                  <div key={source.id} className="bg-slate-800/60 border border-slate-600/70 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-300 text-sm font-medium">{source.label}</span>
                      <button
                        type="button"
                        onClick={() => removeSource(source.id)}
                        className="text-slate-500 hover:text-red-400 text-xs"
                      >
                        Quitar
                      </button>
                    </div>
                    {source.source_type === 'presupuesto' && (
                      <div className="text-xs text-slate-500 mb-2">
                        Restante: {formatARS(source.max_amount)}
                      </div>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={source.max_amount}
                      value={source.amount}
                      onChange={(e) => updateSourceAmount(source.id, e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-700/40 border border-slate-600/60 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
                    />
                  </div>
                ))}
              </div>

              {/* Add source buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addSource('disponible')}
                  disabled={sources.some((s) => s.source_type === 'disponible')}
                  className="flex-1 border border-dashed border-slate-600/70 bg-transparent text-slate-400 hover:text-white hover:border-slate-500 text-xs font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + Del disponible
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryPicker(true)}
                  disabled={presupuestoItems.every((pi) =>
                    sources.some((s) => s.presupuesto_item_id === pi.id)
                  )}
                  className="flex-1 border border-dashed border-slate-600/70 bg-transparent text-slate-400 hover:text-white hover:border-slate-500 text-xs font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  + De una categoría
                </button>
              </div>
            </>
          ) : (
            /* Withdraw: simple amount input */
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1">Monto a retirar</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={currentSavings}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              <p className="text-xs text-slate-500 mt-1">
                Máximo: {formatARS(currentSavings)}
              </p>
            </div>
          )}

          {/* Category picker popup */}
          {showCategoryPicker && (
            <div className="bg-slate-800 border border-slate-600/70 rounded-xl overflow-hidden shadow-xl max-h-[200px] overflow-y-auto">
              {presupuestoItems
                .filter((pi) => !sources.some((s) => s.presupuesto_item_id === pi.id))
                .map((pi) => {
                  const remaining = Math.max(0, pi.monto_estimado - pi.monto_ejecutado);
                  return (
                    <button
                      key={pi.id}
                      type="button"
                      onClick={() => {
                        addSource('presupuesto', pi.id);
                        setShowCategoryPicker(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-700/60 transition-colors border-b border-slate-700/40 last:border-0"
                    >
                      <span className="block truncate">{pi.descripcion ?? `Categoría #${pi.id}`}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Restante: {formatARS(remaining)}
                      </span>
                    </button>
                  );
                })}
              {presupuestoItems.filter((pi) => !sources.some((s) => s.presupuesto_item_id === pi.id)).length === 0 && (
                <div className="px-3 py-2.5 text-sm text-slate-500">No hay más categorías disponibles</div>
              )}
            </div>
          )}

          {/* Total preview */}
          {totalAmount > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2 flex justify-between items-center">
              <span className="text-blue-300 text-sm">
                {isContribute ? 'Total a aportar' : 'Total a retirar'}
              </span>
              <span className="text-blue-200 font-semibold">{formatARS(totalAmount)}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-600/70 bg-transparent text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || (isContribute ? sources.length === 0 : !withdrawAmount)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Procesando...' : isContribute ? 'Aportar' : 'Retirar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GoalContributeForm;
