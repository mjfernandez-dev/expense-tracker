import { useState, useEffect, useMemo } from 'react';
import type { Ciclo, Movimiento } from '../types';
import { getCicloActivo, getMovimientos } from '../services/api';

// ── SVG Pie Chart ──────────────────────────────────────────────────────────────

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

interface PieSlice { label: string; value: number; color: string; textColor: string; }

function ClasificacionPie({ necesidad, deseo, sinClasificar, total }: {
  necesidad: number; deseo: number; sinClasificar: number; total: number;
}) {
  const slices: PieSlice[] = [
    { label: 'Necesidad', value: necesidad, color: '#3b82f6', textColor: 'text-blue-300' },
    { label: 'Deseo',     value: deseo,     color: '#a855f7', textColor: 'text-purple-300' },
    { label: 'Sin clas.', value: sinClasificar, color: '#475569', textColor: 'text-slate-400' },
  ].filter(s => s.value > 0);

  const cx = 80, cy = 80, r = 68;
  let currentAngle = 0;
  const arcs = slices.map((s) => {
    const angle = (s.value / total) * 360;
    const path = angle >= 359.9
      ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 -${r * 2} 0`
      : describeArc(cx, cy, r, currentAngle, currentAngle + angle);
    currentAngle += angle;
    return { ...s, path, angle };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160" className="flex-shrink-0">
        {arcs.map((arc) => (
          <path key={arc.label} d={arc.path} fill={arc.color} opacity={0.85} />
        ))}
        <circle cx={cx} cy={cy} r={38} fill="#0f172a" />
      </svg>
      <div className="flex flex-col gap-3 min-w-0">
        {arcs.map((arc) => {
          const pct = total > 0 ? (arc.value / total) * 100 : 0;
          return (
            <div key={arc.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: arc.color }} />
              <div className="min-w-0">
                <span className={`text-xs font-semibold ${arc.textColor}`}>{arc.label}</span>
                <span className="text-slate-400 text-xs ml-2 tabular-nums">{pct.toFixed(0)}%</span>
                <p className="text-slate-300 text-xs tabular-nums font-medium">{formatARS(arc.value)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

interface BalanceCicloProps {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function BalanceCiclo({ refreshKey }: BalanceCicloProps) {
  const [ciclo, setCiclo] = useState<Ciclo | null | undefined>(undefined);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const [c, movs] = await Promise.all([getCicloActivo(), getMovimientos()]);
        setCiclo(c);
        setMovimientos(movs as Movimiento[]);
      } catch {
        setError('No se pudo cargar el balance.');
        setCiclo(null);
        setMovimientos([]);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [refreshKey]);

  const gastosCiclo = useMemo(() => {
    if (!ciclo) return [];
    const desde = new Date(ciclo.fecha_inicio).getTime();
    return movimientos.filter((m) => m.tipo === 'gasto' && new Date(m.fecha).getTime() >= desde);
  }, [movimientos, ciclo]);

  const gastosPorCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    gastosCiclo.forEach((m) => {
      const cat = m.categoria?.nombre ?? m.user_category?.nombre ?? 'Sin categoría';
      map[cat] = (map[cat] ?? 0) + m.importe;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [gastosCiclo]);

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

  if (!ciclo || !ciclo.resumen) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-slate-300 text-base font-medium">Sin ciclo activo</p>
        <p className="text-slate-400 text-sm mt-2">Registrá un ingreso e iniciá un ciclo para ver el balance.</p>
      </div>
    );
  }

  const r = ciclo.resumen;
  const items = r.presupuesto_items.filter((i) => i.confirmado);
  const balanceNeto = r.total_ingresos - totalGastos;

  return (
    <div className="space-y-4 pb-4">

      {/* ── Resumen general del ciclo ───────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/80 border border-green-500/20 backdrop-blur-2xl rounded-xl p-3 text-center">
          <p className="text-xs font-mono text-green-400 uppercase tracking-widest mb-1">Ingresos</p>
          <p className="text-sm sm:text-base font-bold text-green-300 tabular-nums leading-tight">{formatARS(r.total_ingresos)}</p>
        </div>
        <div className="bg-slate-900/80 border border-red-500/20 backdrop-blur-2xl rounded-xl p-3 text-center">
          <p className="text-xs font-mono text-red-400 uppercase tracking-widest mb-1">Gastos</p>
          <p className="text-sm sm:text-base font-bold text-red-300 tabular-nums leading-tight">{formatARS(totalGastos)}</p>
        </div>
        <div className={`bg-slate-900/80 border backdrop-blur-2xl rounded-xl p-3 text-center ${balanceNeto >= 0 ? 'border-blue-500/20' : 'border-orange-500/20'}`}>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">Balance</p>
          <p className={`text-sm sm:text-base font-bold tabular-nums leading-tight ${balanceNeto >= 0 ? 'text-blue-300' : 'text-orange-300'}`}>
            {balanceNeto >= 0 ? '+' : ''}{formatARS(balanceNeto)}
          </p>
        </div>
      </div>

      {/* ── Desktop: 2 columnas / Mobile: 1 columna ──────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* Columna izquierda: Presupuesto */}
        <section>
          <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
            Presupuesto del ciclo
          </h2>
          <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden">
            {items.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">Sin ítems confirmados</p>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {items.map((item) => {
                  const pct = item.monto_estimado > 0
                    ? Math.min((item.monto_ejecutado / item.monto_estimado) * 100, 100) : 0;
                  const barColor =
                    item.estado === 'efectivado' ? 'bg-green-500' :
                    item.estado === 'parcial'    ? 'bg-blue-400'  : 'bg-slate-600';
                  const pctColor =
                    item.estado === 'efectivado' ? 'text-green-400' :
                    item.estado === 'parcial'    ? 'text-blue-300'  : 'text-slate-500';
                  return (
                    <div key={item.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-slate-200 text-xs font-medium truncate">
                          {item.descripcion ?? 'Sin descripción'}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-mono ${pctColor}`}>{Math.round(pct)}%</span>
                          <span className="text-slate-400 text-xs tabular-nums">
                            {formatARS(item.monto_ejecutado)}<span className="text-slate-600"> / </span>{formatARS(item.monto_estimado)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                        <div className={`[--bar-w:${pct}%] dyn-bar h-full rounded-full transition-all duration-500 ${barColor}`} />
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
              </div>
            )}
          </div>
        </section>

        {/* Columna derecha: Necesidad vs Deseo + Gastos por categoría */}
        <div className="space-y-4">

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

          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
                Gastos por categoría
              </h2>
              <span className="text-slate-500 text-xs tabular-nums">{formatARS(totalGastos)} total</span>
            </div>
            <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden">
              {gastosPorCategoria.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">Sin gastos en este ciclo</p>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {gastosPorCategoria.map(([cat, total]) => {
                    const pct = totalGastos > 0 ? (total / totalGastos) * 100 : 0;
                    return (
                      <div key={cat} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-slate-200 text-xs truncate">{cat}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-mono text-slate-500">{pct.toFixed(0)}%</span>
                            <span className="text-slate-300 text-xs tabular-nums font-medium">{formatARS(total)}</span>
                          </div>
                        </div>
                        <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                          <div
                            className={`[--bar-w:${pct}%] dyn-bar h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
