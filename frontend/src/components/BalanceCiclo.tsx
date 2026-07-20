import { useState, useEffect, useMemo } from 'react';
import type { Ciclo, Movimiento } from '../types';
import { getCiclo, getCiclos, getMovimientos } from '../services/api';
import ClasificacionPie from './ClasificacionPie';

interface BalanceCicloProps {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const formatFechaLargo = (s: string) =>
  new Date(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function BalanceCiclo({ refreshKey }: BalanceCicloProps) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [selectedCiclo, setSelectedCiclo] = useState<Ciclo | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const [todos, movs] = await Promise.all([getCiclos(), getMovimientos()]);
        setCiclos(todos);
        setMovimientos(movs);

        const defaultId = todos.find(c => c.activo)?.id ?? todos[0]?.id;
        if (defaultId) {
          const full = await getCiclo(defaultId);
          setSelectedCiclo(full);
        } else {
          setSelectedCiclo(null);
        }
      } catch {
        setError('No se pudo cargar el balance.');
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [refreshKey]);

  const seleccionarCiclo = async (id: number) => {
    if (selectedCiclo?.id === id) return;
    setError(null);
    try {
      const full = await getCiclo(id);
      setSelectedCiclo(full);
    } catch {
      setError('No se pudo cargar el ciclo seleccionado.');
    }
  };

  const gastosCiclo = useMemo(() => {
    if (!selectedCiclo) return [];
    const desde = new Date(selectedCiclo.fecha_inicio).getTime();
    const hasta = new Date(selectedCiclo.fecha_fin).getTime();
    return movimientos.filter(
      (m) => m.tipo === 'gasto' && new Date(m.fecha).getTime() >= desde && new Date(m.fecha).getTime() <= hasta
    );
  }, [movimientos, selectedCiclo]);

  const gastosSinPresupuesto = useMemo(() => {
    if (!selectedCiclo?.resumen) return [];
    const confirmedIds = new Set(
      selectedCiclo.resumen.presupuesto_items.filter(i => i.confirmado).map(i => i.id)
    );
    const map: Record<string, number> = {};
    gastosCiclo
      .filter(m => m.presupuesto_item_id === null || !confirmedIds.has(m.presupuesto_item_id))
      .forEach(m => {
        const cat = m.categoria?.nombre ?? m.user_category?.nombre ?? 'Sin categoría';
        map[cat] = (map[cat] ?? 0) + m.importe;
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [gastosCiclo, selectedCiclo]);

  const clasificacionData = useMemo(() => {
    let necesidad = 0;
    let deseo = 0;
    let sinClasificar = 0;
    gastosCiclo.forEach((m) => {
      if (m.clasificacion === 'necesidad') necesidad += m.importe;
      else if (m.clasificacion === 'deseo') deseo += m.importe;
      else sinClasificar += m.importe;
    });
    return { necesidad, deseo, sinClasificar };
  }, [gastosCiclo]);

  const totalGastos = gastosCiclo.reduce((s, m) => s + m.importe, 0);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-20 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-40 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-40 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/80 border border-red-500/20 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (ciclos.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-slate-300 text-base font-medium">Sin ciclos</p>
        <p className="text-slate-400 text-sm mt-2">Registrá un ingreso e iniciá un ciclo para ver el balance.</p>
      </div>
    );
  }

  if (!selectedCiclo || !selectedCiclo.resumen) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-slate-300 text-base font-medium">Seleccioná un ciclo</p>
      </div>
    );
  }

  const r = selectedCiclo.resumen;
  const items = r.presupuesto_items.filter((i) => i.confirmado);
  const realEnCuenta = r.total_ingresos - totalGastos - selectedCiclo.ahorro_objetivo;

  return (
    <div className="space-y-4 pb-4">

      {/* ── Selector de ciclos ──────────────────────── */}
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {ciclos.map((c) => {
            const isSelected = c.id === selectedCiclo.id;
            return (
              <button
                key={c.id}
                onClick={() => seleccionarCiclo(c.id)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-mono transition-all duration-200 whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600/30 border border-blue-500/50 text-blue-200 shadow-lg'
                    : 'bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`}
              >
                {formatFecha(c.fecha_inicio)} → {formatFecha(c.fecha_fin)}
                {c.activo && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 align-middle" title="Activo" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Encabezado del ciclo seleccionado ──────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
            {formatFechaLargo(selectedCiclo.fecha_inicio)} → {formatFechaLargo(selectedCiclo.fecha_fin)}
          </h2>
          {selectedCiclo.activo && (
            <span className="text-xs font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
              Activo
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs tabular-nums">
          {selectedCiclo.activo
            ? `${r.dias_restantes} día${r.dias_restantes !== 1 ? 's' : ''} restante${r.dias_restantes !== 1 ? 's' : ''}`
            : 'Ciclo cerrado'}
        </span>
      </div>

      {/* ── Real en cuenta ──────────────── */}
      <div className={`bg-slate-900/80 border backdrop-blur-2xl rounded-xl px-5 py-3 flex items-center justify-between ${realEnCuenta >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
        <div>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Real en cuenta</p>
          <p className="text-xs text-slate-500 mt-0.5">Ingresos − gastos − ahorro objetivo</p>
        </div>
        <p className={`text-lg font-bold tabular-nums ${realEnCuenta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
          {realEnCuenta >= 0 ? '+' : ''}{formatARS(realEnCuenta)}
        </p>
      </div>

      {/* ── Desktop: 2 columnas / Mobile: 1 columna ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* ── Gastos por categoría ──────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
              Gastos por categoría
            </h2>
            <span className="text-slate-500 text-xs tabular-nums">{formatARS(totalGastos)} total</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden">
            {items.length === 0 && gastosSinPresupuesto.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">Sin gastos en este ciclo</p>
            ) : (
              <div className="divide-y divide-slate-700/50">

                {items.map((item) => {
                  const pct = item.monto_estimado > 0
                    ? Math.min((item.monto_ejecutado / item.monto_estimado) * 100, 100) : 0;
                  const barColor =
                    item.estado === 'efectivizado' ? 'bg-green-500' :
                    item.estado === 'parcial'      ? 'bg-blue-400'  : 'bg-slate-600';
                  const pctColor =
                    item.estado === 'efectivizado' ? 'text-green-400' :
                    item.estado === 'parcial'      ? 'text-blue-300'  : 'text-slate-500';
                  return (
                    <div key={item.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-200 text-xs font-medium truncate">
                            {item.descripcion ?? 'Sin descripción'}
                          </span>
                          <span className="text-xs font-mono text-blue-400/80 bg-blue-500/10 border border-blue-500/20 px-1.5 py-px rounded flex-shrink-0">
                            presup.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-mono ${pctColor}`}>{Math.round(pct)}%</span>
                          <span className="text-slate-400 text-xs tabular-nums">
                            {formatARS(item.monto_ejecutado)}<span className="text-slate-600"> / </span>{formatARS(item.monto_estimado)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {item.monto_pendiente > 0 ? (
                        <p className={`text-right text-xs font-mono mt-1 ${pctColor}`}>
                          Restante: {formatARS(item.monto_pendiente)}
                        </p>
                      ) : (
                        <p className="text-right text-xs font-mono mt-1 text-green-400">Completado</p>
                      )}
                    </div>
                  );
                })}

                {items.length > 0 && gastosSinPresupuesto.length > 0 && (
                  <div className="px-4 py-1.5 bg-slate-800/50">
                    <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Sin presupuesto</span>
                  </div>
                )}

                {gastosSinPresupuesto.map(([cat, monto]) => {
                  const pct = totalGastos > 0 ? (monto / totalGastos) * 100 : 0;
                  return (
                    <div key={cat} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-slate-300 text-xs truncate">{cat}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-mono text-slate-500">{pct.toFixed(0)}%</span>
                          <span className="text-slate-300 text-xs tabular-nums font-medium">{formatARS(monto)}</span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

              </div>
            )}
          </div>
        </section>

        {/* ── Necesidad vs Deseo ──────────── */}
        <section>
          <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
            Necesidad vs Deseo
          </h2>
          <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl p-4">
            {clasificacionData.necesidad === 0 && clasificacionData.deseo === 0 ? (
              <p className="text-slate-400 text-sm text-center py-2">
                Clasificá tus gastos como Necesidad o Deseo al registrarlos.
              </p>
            ) : (
              <ClasificacionPie
                necesidad={clasificacionData.necesidad}
                deseo={clasificacionData.deseo}
                sinClasificar={clasificacionData.sinClasificar}
                total={totalGastos}
              />
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
