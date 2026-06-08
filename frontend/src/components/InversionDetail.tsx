import { useState, useEffect } from 'react';
import type { InversionDetail as InversionDetailType, HistorialPrecio } from '../types';
import { getInversion, addHistorialPrecio, actualizarPrecio } from '../services/api';
import HistorialForm from './HistorialForm';

interface InversionDetailProps {
  inversionId: number;
  onBack: () => void;
  onUpdated: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);

export default function InversionDetail({ inversionId, onBack, onUpdated }: InversionDetailProps) {
  const [detail, setDetail] = useState<InversionDetailType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showHistorialForm, setShowHistorialForm] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInversion(inversionId);
      setDetail(data);
    } catch {
      setError('No se pudo cargar el detalle de la inversión.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [inversionId]);

  const handleHistorialAdded = () => {
    setShowHistorialForm(false);
    cargar();
    onUpdated();
  };

  const handleActualizar = async () => {
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const result = await actualizarPrecio(inversionId);
      setUpdateMsg(result.message);
      cargar();
      onUpdated();
    } catch {
      setUpdateMsg('Error al actualizar precio.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Cargando detalle...</div>;
  }

  if (error || !detail) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-3">{error ?? 'Inversión no encontrada'}</p>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300 text-sm">Volver</button>
      </div>
    );
  }

  const historial = detail.historial ?? [];
  const sortedHistorial = [...historial].sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  );

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-slate-400 hover:text-slate-200 text-sm mb-3 flex items-center gap-1 transition-colors"
      >
        ← Volver a inversiones
      </button>

      {/* Header card */}
      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 mb-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-xl font-bold text-white">{detail.nombre}</h2>
            {detail.ticker && (
              <span className="text-slate-500 text-xs font-mono">{detail.ticker}</span>
            )}
          </div>
          <button
            onClick={handleActualizar}
            disabled={updating || !detail.ticker}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {updating ? 'Actualizando...' : 'Actualizar precio'}
          </button>
        </div>

        {updateMsg && (
          <div className="bg-blue-500/10 border border-blue-400/30 text-blue-100 px-3 py-2 rounded-lg text-sm mb-3">
            {updateMsg}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs">Invertido</p>
            <p className="text-white font-semibold">{detail.monto_invertido ? formatARS(detail.monto_invertido) : '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Valor actual</p>
            <p className="text-white font-semibold">{detail.valor_actual ? formatARS(detail.valor_actual) : '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Ganancia/Pérdida</p>
            <p className={`font-semibold ${(detail.ganancia_perdida ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {detail.ganancia_perdida != null
                ? `${detail.ganancia_perdida >= 0 ? '+' : ''}${formatARS(detail.ganancia_perdida)}`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Rendimiento</p>
            <p className={`font-semibold ${(detail.rendimiento_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {detail.rendimiento_pct != null
                ? `${detail.rendimiento_pct >= 0 ? '+' : ''}${detail.rendimiento_pct.toFixed(2)}%`
                : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-700/50 text-sm">
          <div>
            <p className="text-slate-500 text-xs">Cuotapartes</p>
            <p className="text-slate-300">{detail.cuotapartes ?? '—'}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Último valor cuota</p>
            <p className="text-slate-300">{detail.ultimo_valor_cuota ? formatARS(detail.ultimo_valor_cuota) : '—'}</p>
          </div>
        </div>
      </div>

      {/* Price chart (simple evolution) */}
      {sortedHistorial.length > 1 && (
        <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 mb-4">
          <h3 className="text-white font-semibold text-sm mb-3">Evolución valor cuota</h3>
          <div className="h-48 flex items-end gap-1">
            {sortedHistorial.map((h, i) => {
              const maxVal = Math.max(...sortedHistorial.map(x => x.valor_cuota));
              const minVal = Math.min(...sortedHistorial.map(x => x.valor_cuota));
              const range = maxVal - minVal || 1;
              const pct = ((h.valor_cuota - minVal) / range) * 100;
              return (
                <div
                  key={h.id}
                  className="flex-1 bg-blue-500/60 hover:bg-blue-400/80 rounded-t transition-all relative group"
                  style={{ height: `${Math.max(pct, 5)}%` }}
                  title={`${new Date(h.fecha).toLocaleDateString('es-AR')}: $${h.valor_cuota.toFixed(2)}`}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-xs px-2 py-1 rounded hidden group-hover:block whitespace-nowrap shadow-lg z-10">
                    {new Date(h.fecha).toLocaleDateString('es-AR')}: ${h.valor_cuota.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Price history table */}
      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-semibold text-sm">Historial de precios</h3>
          <button
            onClick={() => setShowHistorialForm(true)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + Agregar precio
          </button>
        </div>

        {historial.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">
            Sin historial de precios todavía. Agregá el primer valor cuota.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide border-b border-slate-700/50">
                  <th className="text-left py-2 pr-3">Fecha</th>
                  <th className="text-right py-2 pr-3">Valor cuota</th>
                  <th className="text-right py-2">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {[...historial]
                  .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                  .map((h) => (
                    <tr key={h.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 pr-3 text-slate-300">
                        {new Date(h.fecha).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 pr-3 text-right text-white font-mono">
                        {formatARS(h.valor_cuota)}
                      </td>
                      <td className="py-2 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          h.fuente === 'scraping'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-slate-700/50 text-slate-400'
                        }`}>
                          {h.fuente}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes */}
      {detail.notas && (
        <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 mb-4">
          <h3 className="text-white font-semibold text-sm mb-2">Notas</h3>
          <p className="text-slate-300 text-sm whitespace-pre-wrap">{detail.notas}</p>
        </div>
      )}

      {/* Historial create form modal */}
      {showHistorialForm && (
        <HistorialForm
          inversionId={inversionId}
          onClose={() => setShowHistorialForm(false)}
          onSaved={handleHistorialAdded}
        />
      )}
    </div>
  );
}
