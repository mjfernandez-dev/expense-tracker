import { useState, useEffect, useCallback } from 'react';
import type { InvestmentDetail as InvestmentDetailType } from '../types';
import { getInvestment, updateInvestment, deleteContribution } from '../services/api';
import ContributionForm from './ContributionForm';

interface InvestmentDetailProps {
  investmentId: number;
  onBack: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatUSD = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

function InvestmentDetail({ investmentId, onBack }: InvestmentDetailProps) {
  const [investment, setInvestment] = useState<InvestmentDetailType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Value update form state
  const [valorActualArs, setValorActualArs] = useState<string>('');
  const [cotizacionUsdActual, setCotizacionUsdActual] = useState<string>('');
  const [savingValue, setSavingValue] = useState<boolean>(false);

  // Contribution form & delete state
  const [showContributionForm, setShowContributionForm] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeletingContribution, setIsDeletingContribution] = useState<boolean>(false);

  const fetchInvestment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInvestment(investmentId);
      setInvestment(data);
      setValorActualArs(data.valor_actual_ars?.toString() ?? '');
      setCotizacionUsdActual(data.cotizacion_usd_actual?.toString() ?? '');
    } catch {
      setError('Error al cargar la inversión');
    } finally {
      setLoading(false);
    }
  }, [investmentId]);

  useEffect(() => {
    fetchInvestment();
  }, [fetchInvestment]);

  const handleSaveValue = async () => {
    setSavingValue(true);
    setError(null);
    try {
      const payload: { valor_actual_ars?: number; cotizacion_usd_actual?: number } = {};
      const parsedValor = parseFloat(valorActualArs);
      if (!isNaN(parsedValor) && parsedValor >= 0) {
        payload.valor_actual_ars = parsedValor;
      }
      const parsedCotizacion = parseFloat(cotizacionUsdActual);
      if (!isNaN(parsedCotizacion) && parsedCotizacion > 0) {
        payload.cotizacion_usd_actual = parsedCotizacion;
      }
      await updateInvestment(investmentId, payload);
      await fetchInvestment();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || msg);
    } finally {
      setSavingValue(false);
    }
  };

  const handleDeleteContribution = async () => {
    if (deleteTarget === null) return;
    setIsDeletingContribution(true);
    setError(null);
    try {
      await deleteContribution(investmentId, deleteTarget);
      await fetchInvestment();
      setDeleteTarget(null);
    } catch {
      setError('Error al eliminar el aporte');
    } finally {
      setIsDeletingContribution(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-6">
        <div className="text-center text-slate-300">Cargando inversión...</div>
      </div>
    );
  }

  if (error && !investment) {
    return (
      <div>
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
          ← Volver
        </button>
      </div>
    );
  }

  if (!investment) return null;

  const ganancia = investment.ganancia_perdida_ars;
  const rendimiento = investment.rendimiento_pct;
  const isPositive = ganancia !== null && ganancia >= 0;
  const isNegative = ganancia !== null && ganancia < 0;

  return (
    <>
      {/* Contribution form modal */}
      <ContributionForm
        investmentId={investmentId}
        isOpen={showContributionForm}
        onClose={() => setShowContributionForm(false)}
        onSaved={fetchInvestment}
      />

      {/* Delete contribution confirmation modal */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar aporte</h3>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeletingContribution}
                className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteContribution}
                disabled={isDeletingContribution}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-medium py-2.5 rounded-lg transition-all text-sm"
              >
                {isDeletingContribution ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-6">
        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-6">{investment.nombre}</h2>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total invertido</p>
            <p className="text-xl font-bold text-white">{formatARS(investment.total_invertido_ars)}</p>
            {investment.total_invertido_usd !== null && (
              <p className="text-xs text-slate-500 mt-1">
                ≈ USD {investment.total_invertido_usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Valor actual</p>
            {investment.valor_actual_ars !== null ? (
              <>
                <p className="text-xl font-bold text-white">{formatARS(investment.valor_actual_ars)}</p>
                {investment.valor_actual_usd !== null && (
                  <p className="text-xs text-slate-500 mt-1">
                    ≈ USD {investment.valor_actual_usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </>
            ) : (
              <p className="text-lg text-slate-400">Pendiente</p>
            )}
          </div>

          <div className={`bg-slate-900/60 border rounded-xl p-4 ${
            isPositive ? 'border-green-500/30' : isNegative ? 'border-red-500/30' : 'border-slate-700/50'
          }`}>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Ganancia / Pérdida</p>
            {ganancia !== null ? (
              <>
                <p className={`text-xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{formatARS(ganancia)}
                </p>
                {rendimiento !== null && (
                  <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    rendimiento >= 0
                      ? 'bg-green-500/20 text-green-300 border-green-400/30'
                      : 'bg-red-500/20 text-red-300 border-red-400/30'
                  }`}>
                    {rendimiento >= 0 ? '+' : ''}{rendimiento.toFixed(2)}%
                  </span>
                )}
              </>
            ) : (
              <p className="text-lg text-slate-400">Pendiente</p>
            )}
          </div>
        </div>

        {/* Value update section */}
        <div className="bg-slate-900/80 border border-slate-700/70 rounded-2xl p-5 mb-8">
          <h3 className="text-white font-semibold text-sm mb-4">Actualizar valor</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Valor actual (ARS)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={valorActualArs}
                onChange={(e) => setValorActualArs(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cotización USD</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cotizacionUsdActual}
                onChange={(e) => setCotizacionUsdActual(e.target.value)}
                placeholder="Ej: 1200"
                className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <button
            onClick={handleSaveValue}
            disabled={savingValue}
            className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm"
          >
            {savingValue ? 'Guardando...' : 'Guardar valor'}
          </button>
        </div>

        {/* Contributions section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Aportes</h3>
            <button
              onClick={() => setShowContributionForm(true)}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              + Agregar aporte
            </button>
          </div>

          {investment.aportes.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">Todavía no hay aportes registrados.</p>
              <button
                onClick={() => setShowContributionForm(true)}
                className="text-blue-400 hover:text-blue-300 text-sm mt-2 transition-colors"
              >
                Agregar el primer aporte
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {investment.aportes.map((aporte) => (
                <div
                  key={aporte.id}
                  className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">
                      {formatARS(aporte.monto_ars)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(aporte.fecha).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {aporte.cotizacion_usd !== null && (
                        <> · USD {aporte.cotizacion_usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(aporte.id)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 p-2 rounded-lg transition-all flex-shrink-0 ml-2"
                    aria-label="Eliminar aporte"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
    </>
  );
}

export default InvestmentDetail;
