import { useState, useEffect, useCallback } from 'react';
import type { Ciclo } from '../types';
import { getCicloActivo, cerrarCiclo, getCiclos, exportarCiclo, reabrirCiclo } from '../services/api';
import EditCicloModal from './EditCicloModal';

interface DashboardCicloProps {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const SEMAFORO_COLORS = {
  verde: {
    bar: 'bg-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-400',
  },
  amarillo: {
    bar: 'bg-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/30',
    text: 'text-amber-300',
  },
  rojo: {
    bar: 'bg-red-500',
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-400',
  },
} as const;

export default function DashboardCiclo({ refreshKey }: DashboardCicloProps) {
  const [ciclo, setCiclo] = useState<Ciclo | null | undefined>(undefined);
  const [loadingCiclo, setLoadingCiclo] = useState<boolean>(true);
  const [showEdit, setShowEdit] = useState<boolean>(false);
  const [closingCiclo, setClosingCiclo] = useState<boolean>(false);
  const [reopeningId, setReopeningId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [ciclosAnteriores, setCiclosAnteriores] = useState<Ciclo[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [errorCiclo, setErrorCiclo] = useState<string | null>(null);

  const fetchCiclo = useCallback(async () => {
    setLoadingCiclo(true);
    try {
      const data = await getCicloActivo();
      setCiclo(data);
    } catch {
      setCiclo(null);
      setErrorCiclo('No se pudo cargar el ciclo.');
    } finally {
      setLoadingCiclo(false);
    }
  }, []);

  const fetchHistorial = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const todos = await getCiclos();
      setCiclosAnteriores(todos.filter((c) => !c.activo));
    } catch {
      setCiclosAnteriores([]);
      setErrorCiclo('No se pudieron cargar los ciclos anteriores.');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchCiclo();
  }, [fetchCiclo, refreshKey]);

  useEffect(() => {
    fetchHistorial();
  }, [fetchHistorial, refreshKey]);

  const handleCerrar = async () => {
    if (!ciclo || !confirm('¿Cerrar este ciclo?')) return;
    setClosingCiclo(true);
    try {
      await cerrarCiclo(ciclo.id);
      setCiclo(null);
      await fetchHistorial();
    } catch {
      setErrorCiclo('No se pudo cerrar el ciclo. Intentá de nuevo.');
    } finally {
      setClosingCiclo(false);
    }
  };

  const handleReabrir = async (id: number) => {
    setReopeningId(id);
    setErrorCiclo(null);
    try {
      await reabrirCiclo(id);
      await Promise.all([fetchCiclo(), fetchHistorial()]);
    } catch (err) {
      const detail =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setErrorCiclo(detail || 'No se pudo reabrir el ciclo.');
    } finally {
      setReopeningId(null);
    }
  };

  const handleExportar = async (id: number, fecha_inicio: string, setLoading: (v: boolean) => void) => {
    setLoading(true);
    try {
      await exportarCiclo(id, fecha_inicio);
    } catch {
      setErrorCiclo('No se pudo exportar el ciclo. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingCiclo) {
    return <div className="bg-slate-700/50 border border-slate-600/60 rounded-2xl p-4 mb-6 animate-pulse h-28" />;
  }

  const hasCicloActivo = ciclo && ciclo.resumen;

  const historialSection = (loadingHistory || ciclosAnteriores.length > 0) && (
    <div className="mt-2">
      <button
        onClick={() => setShowHistory((v) => !v)}
        disabled={loadingHistory}
        className="w-full flex items-center justify-between px-3 py-2 text-slate-500 hover:text-slate-300 text-xs font-mono uppercase tracking-widest transition-colors disabled:opacity-50"
      >
        <span>{loadingHistory ? 'Cargando historial...' : `Ciclos anteriores (${ciclosAnteriores.length})`}</span>
        <span>{showHistory ? '▲' : '▼'}</span>
      </button>

      {showHistory && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden divide-y divide-slate-700/40">
          {ciclosAnteriores.map((c) => {
            const fi = new Date(c.fecha_inicio).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
            const ff = new Date(c.fecha_fin).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
            return (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <span className="text-slate-400 text-xs tabular-nums">{fi} → {ff}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!hasCicloActivo && (
                    <button
                      onClick={() => handleReabrir(c.id)}
                      disabled={reopeningId === c.id}
                      className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 rounded hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                    >
                      {reopeningId === c.id ? '...' : 'Reabrir'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setExportingId(c.id);
                      exportarCiclo(c.id, c.fecha_inicio)
                        .catch(() => setErrorCiclo('No se pudo exportar. Intentá de nuevo.'))
                        .finally(() => setExportingId(null));
                    }}
                    disabled={exportingId === c.id}
                    className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                  >
                    {exportingId === c.id ? '...' : 'Exportar TXT'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!hasCicloActivo || !ciclo?.resumen) {
    return (
      <>
        <div className="bg-slate-700/50 border border-slate-600/60 rounded-2xl p-4 mb-6">
          {errorCiclo && <p className="text-red-400 text-xs mb-2">{errorCiclo}</p>}
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">💡</span>
            <div>
              <p className="text-slate-200 font-medium text-sm">Sin seguimiento diario activo</p>
              <p className="text-slate-400 text-xs mt-0.5">
                Cuando cobrés tu sueldo o ingreso, registralo y activá{' '}
                <span className="text-blue-400 font-medium">Inicio de Ciclo</span>.
                La app calcula cuánto podés gastar por día para llegar al próximo cobro sin quedarte corto.
              </p>
            </div>
          </div>
        </div>
        {historialSection}
      </>
    );
  }

  const r = ciclo.resumen;
  const colors = SEMAFORO_COLORS[r.semaforo];
  const pct = Math.min(r.daily_cap_porcentaje_usado, 100);
  const fechaFinLabel = new Date(ciclo.fecha_fin).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

  return (
    <>
      {showEdit && (
        <EditCicloModal
          ciclo={ciclo}
          onClose={() => setShowEdit(false)}
          onSaved={fetchCiclo}
        />
      )}

      <div className={`border rounded-2xl p-4 mb-6 ${colors.bg}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs font-medium uppercase tracking-wide">Ciclo financiero</span>
            <span className="bg-slate-600/60 text-slate-200 text-xs px-2 py-0.5 rounded-full">
              {r.dias_restantes} día{r.dias_restantes !== 1 ? 's' : ''} restante{r.dias_restantes !== 1 ? 's' : ''}
            </span>
            <span className="text-slate-500 text-xs">hasta {fechaFinLabel}</span>
          </div>
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setShowEdit(true)}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              Editar
            </button>
            <button
              onClick={() => handleExportar(ciclo.id, ciclo.fecha_inicio, setExporting)}
              disabled={exporting}
              className="text-slate-400 hover:text-blue-300 text-xs px-2 py-1 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
            >
              {exporting ? '...' : 'Exportar'}
            </button>
            <span className="w-px h-4 bg-slate-600/50 mx-1" />
            <button
              onClick={handleCerrar}
              disabled={closingCiclo}
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {closingCiclo ? '...' : 'Cerrar'}
            </button>
          </div>
        </div>

        {/* ── Card 1: SOLVENCIA DIARIA ── */}
        <div className="bg-slate-800/90 border border-slate-600/50 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm mb-4">
          <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-b border-slate-600/30 px-5 py-3 flex items-center gap-2">
            <span className="text-blue-400 text-lg">⚡</span>
            <h3 className="text-slate-200 font-mono font-semibold text-sm tracking-wider">SOLVENCIA DIARIA</h3>
          </div>

          <div className="p-5 space-y-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs font-mono mb-2 tracking-widest uppercase">Podés gastar hoy</p>
              <p className={`text-5xl font-mono font-bold tracking-tight leading-none ${colors.text}`}>
                {formatARS(r.daily_cap)}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">Gastaste hoy</span>
                <span className="text-slate-200 font-medium">{formatARS(r.gasto_hoy)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs font-mono text-slate-500">
                <span>$0</span>
                <span>Límite diario: {formatARS(r.daily_cap)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 2: PRESUPUESTO DEL CICLO ── */}
        {(() => {
          const total = r.total_gastos || 1;
          const pctFijos = Math.round((r.gastos_fijos_efectivizados / total) * 100);
          const pctVariables = Math.round((r.gastos_no_planificados / total) * 100);
          return (
            <div className="bg-slate-800/90 border border-slate-600/50 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm mb-4">
              <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-b border-slate-600/30 px-5 py-3 flex items-center gap-2">
                <span className="text-blue-400 text-lg">📊</span>
                <h3 className="text-slate-200 font-mono font-semibold text-sm tracking-wider">PRESUPUESTO DEL CICLO</h3>
              </div>

              <div className="p-5 space-y-4">
                {/* Disponible — destacado */}
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-emerald-400 uppercase tracking-widest font-semibold">Disponible</p>
                      <p className="text-xs text-slate-500 mt-0.5">Ingresos − gastos − ahorro</p>
                    </div>
                    <p className="text-xl font-bold text-emerald-300 tabular-nums">{formatARS(r.saldo_disponible_actual)}</p>
                  </div>
                </div>

                {/* ── Resumen ejecución del presupuesto ── */}
                {(() => {
                  const items = r.presupuesto_items.filter(i => i.confirmado);
                  if (items.length === 0) return null;
                  const totalPresupuestado = items.reduce((s, i) => s + i.monto_estimado, 0);
                  const totalEjecutado = items.reduce((s, i) => s + i.monto_ejecutado, 0);
                  const pct = totalPresupuestado > 0 ? Math.round((totalEjecutado / totalPresupuestado) * 100) : 0;
                  return (
                    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Ejecución</span>
                        <span className="text-xs font-mono text-slate-500">{pct}%</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-mono text-slate-200 font-semibold">{formatARS(totalEjecutado)}</span>
                        <span className="text-xs font-mono text-slate-500">
                          de <span className="text-slate-300">{formatARS(totalPresupuestado)}</span> presupuestados
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <p className="text-xs text-slate-500">
                        {totalPresupuestado - totalEjecutado > 0
                          ? `Restan ${formatARS(totalPresupuestado - totalEjecutado)} por ejecutar`
                          : 'Presupuesto completamente ejecutado'}
                      </p>
                      {/* Total líquido: disponible + lo que resta por ejecutar */}
                      <div className="border-t border-slate-700/40 pt-2 mt-1 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">
                          Disponible + restante
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-100 tabular-nums">
                          {formatARS(r.saldo_disponible_actual + totalPresupuestado - totalEjecutado)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Items del presupuesto */}
                <div className="space-y-0 text-xs font-mono">
                  <div className="flex items-center py-1.5">
                    <span className="w-5 text-center flex-shrink-0">💰</span>
                    <span className="text-slate-300 ml-1.5 flex-1">Ingresos</span>
                    <span className="text-slate-100 font-semibold tabular-nums">{formatARS(r.total_ingresos)}</span>
                  </div>

                  <div className="flex items-center py-1.5 pl-5 border-l-2 border-emerald-500/40 ml-2.5">
                    <span className="w-5 text-center flex-shrink-0">🎯</span>
                    <span className="text-slate-500 ml-1.5 flex-1">Ahorro objetivo</span>
                    <span className="text-emerald-400 tabular-nums">− {formatARS(ciclo.ahorro_objetivo)}</span>
                  </div>

                  <div className="flex items-center py-1.5 pl-5 border-l-2 border-orange-500/40 ml-2.5">
                    <span className="w-5 text-center flex-shrink-0">🔒</span>
                    <span className="text-slate-500 ml-1.5 flex-1">Comprometido</span>
                    <span className="text-orange-400 tabular-nums">− {formatARS(r.gastos_fijos_pendientes)}</span>
                  </div>

                  <div className="flex items-center py-1.5 pl-5 border-l-2 border-slate-500/40 ml-2.5">
                    <span className="w-5 text-center flex-shrink-0">📊</span>
                    <span className="text-slate-500 ml-1.5 flex-1">Gastos realizados</span>
                    <span className="text-slate-400 tabular-nums">− {formatARS(r.total_gastos)}</span>
                  </div>

                  {r.gastos_fijos_efectivizados > 0 && (
                    <div className="pl-10 ml-2.5 space-y-1 py-1">
                      <div className="flex items-center">
                        <span className="text-slate-600 mr-1.5 flex-shrink-0">↳</span>
                        <span className="w-4 text-center flex-shrink-0">✅</span>
                        <span className="text-slate-500 ml-1.5 flex-1">Fijos ya pagados</span>
                        <span className="text-blue-300 tabular-nums">{formatARS(r.gastos_fijos_efectivizados)}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-700/60 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400/70 rounded-full" style={{ width: `${pctFijos}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="pl-10 ml-2.5 space-y-1 py-1">
                    <div className="flex items-center">
                      <span className="text-slate-600 mr-1.5 flex-shrink-0">↳</span>
                      <span className="w-4 text-center flex-shrink-0">⚠️</span>
                      <span className="text-slate-500 ml-1.5 flex-1">Gastos variables</span>
                      <span className="text-red-400 tabular-nums">{formatARS(r.gastos_no_planificados)}</span>
                    </div>
                    <div className="w-full h-1 bg-slate-700/60 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400/70 rounded-full" style={{ width: `${pctVariables}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {errorCiclo && <p className="text-red-400 text-xs mb-2">{errorCiclo}</p>}
      {historialSection}
    </>
  );
}
