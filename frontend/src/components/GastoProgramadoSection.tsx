// COMPONENTE: Gastos programados del ciclo actual — pendientes con acciones
// (registrar pago / cancelar) y un historial compacto de pagados/cancelados.
import { useState, useEffect, useCallback } from 'react';
import type { GastoProgramado } from '../types';
import { getGastosProgramados, pagarGastoProgramado, cancelarGastoProgramado } from '../services/api';
import ConfirmModal from './ConfirmModal';

interface GastoProgramadoSectionProps {
  refreshKey: number;
  onChanged: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

type AccionConfirmar = { tipo: 'pagar' | 'cancelar'; gasto: GastoProgramado } | null;

export default function GastoProgramadoSection({ refreshKey, onChanged }: GastoProgramadoSectionProps) {
  const [gastos, setGastos] = useState<GastoProgramado[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<AccionConfirmar>(null);
  const [confirmLoading, setConfirmLoading] = useState<boolean>(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGastosProgramados();
      setGastos(data);
    } catch {
      setError('No se pudieron cargar los gastos programados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, refreshKey]);

  const pendientes = gastos
    .filter((g) => g.estado === 'pendiente')
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  const historial = gastos
    .filter((g) => g.estado !== 'pendiente')
    .sort((a, b) => b.vencimiento.localeCompare(a.vencimiento));

  const nombreCategoria = (g: GastoProgramado) => g.categoria?.nombre ?? g.user_category?.nombre ?? null;

  const confirmarAccion = async () => {
    if (!confirmacion) return;
    const { tipo, gasto } = confirmacion;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      if (tipo === 'pagar') {
        await pagarGastoProgramado(gasto.id);
      } else {
        await cancelarGastoProgramado(gasto.id);
      }
      setConfirmacion(null);
      onChanged();
      await cargar();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setConfirmError(
        e.response?.data?.detail ??
          (tipo === 'pagar' ? 'No se pudo registrar el pago.' : 'No se pudo cancelar el gasto programado.')
      );
    } finally {
      setConfirmLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-32 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-16 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/80 border border-red-500/20 backdrop-blur-2xl rounded-2xl p-6 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Pendientes ─────────────────────────────────────── */}
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-700/40">
          <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
            Pendientes
          </span>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {pendientes.length} {pendientes.length === 1 ? 'gasto' : 'gastos'}
          </span>
        </div>
        {pendientes.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-5">Sin gastos programados pendientes.</p>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {pendientes.map((g) => (
              <div key={g.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-slate-200 text-sm font-medium truncate">
                      {g.descripcion || 'Sin descripción'}
                    </span>
                    {g.cuota_actual != null && (
                      <span className="text-xs font-mono text-slate-300 bg-slate-700/60 border border-slate-600/50 px-1.5 py-px rounded flex-shrink-0">
                        cuota {g.cuota_actual}
                        {g.cuota_total != null ? `/${g.cuota_total}` : ''}
                      </span>
                    )}
                    {g.clasificacion && (
                      <span
                        className={`text-xs font-mono px-1.5 py-px rounded flex-shrink-0 ${
                          g.clasificacion === 'necesidad'
                            ? 'text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20'
                            : 'text-amber-400/80 bg-amber-500/10 border border-amber-500/20'
                        }`}
                      >
                        {g.clasificacion}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-200 text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatARS(g.importe)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex items-center gap-2 min-w-0 text-xs text-slate-400">
                    {nombreCategoria(g) && <span className="truncate">{nombreCategoria(g)}</span>}
                    <span className="text-slate-500">·</span>
                    <span className="tabular-nums whitespace-nowrap">vence {formatFecha(g.vencimiento)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setConfirmError(null); setConfirmacion({ tipo: 'pagar', gasto: g }); }}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
                    >
                      Registrar pago
                    </button>
                    <button
                      onClick={() => { setConfirmError(null); setConfirmacion({ tipo: 'cancelar', gasto: g }); }}
                      className="rounded-md border border-slate-600 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700/60 hover:text-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Historial (pagados / cancelados) ───────────────── */}
      {historial.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/50 backdrop-blur-2xl rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-700/40">
            <span className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-widest">
              Historial
            </span>
          </div>
          <div className="divide-y divide-slate-700/40">
            {historial.map((g) => (
              <div key={g.id} className="px-4 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-slate-500 bg-slate-700/40 border border-slate-600/40 px-1.5 py-px rounded flex-shrink-0">
                    {g.estado === 'pagado' ? 'pagado' : 'cancelado'}
                  </span>
                  <span className="text-slate-400 text-xs truncate">{g.descripcion || 'Sin descripción'}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                  <span className="text-slate-500 tabular-nums whitespace-nowrap">{formatFecha(g.vencimiento)}</span>
                  <span className="text-slate-400 tabular-nums whitespace-nowrap">{formatARS(g.importe)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirmación de pago / cancelación ─────────────── */}
      {confirmacion && (
        <ConfirmModal
          title={confirmacion.tipo === 'pagar' ? 'Registrar pago' : 'Cancelar gasto programado'}
          confirmLabel={confirmacion.tipo === 'pagar' ? 'Registrar pago' : 'Cancelar gasto'}
          loadingLabel="Procesando..."
          destructive={confirmacion.tipo === 'cancelar'}
          loading={confirmLoading}
          onConfirm={confirmarAccion}
          onCancel={() => setConfirmacion(null)}
        >
          {confirmacion.tipo === 'pagar' ? (
            <p>
              ¿Registrar el pago de <span className="font-semibold text-slate-100">{confirmacion.gasto.descripcion}</span> por{' '}
              <span className="font-semibold text-slate-100">{formatARS(confirmacion.gasto.importe)}</span>?
            </p>
          ) : (
            <p>
              ¿Cancelar <span className="font-semibold text-slate-100">{confirmacion.gasto.descripcion}</span>? Esta acción no se puede deshacer.
            </p>
          )}
          {confirmError && (
            <div role="alert" className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg text-sm">
              {confirmError}
            </div>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}