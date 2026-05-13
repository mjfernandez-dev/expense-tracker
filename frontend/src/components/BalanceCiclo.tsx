import { useState, useEffect, useMemo } from 'react';
import type { Ciclo, Movimiento } from '../types';
import { getCicloActivo, getMovimientos } from '../services/api';

interface Props {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function BalanceCiclo({ refreshKey }: Props) {
  const [ciclo, setCiclo] = useState<Ciclo | null | undefined>(undefined);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getCicloActivo().catch(() => null), getMovimientos().catch(() => [])])
      .then(([c, movs]) => {
        setCiclo(c);
        setMovimientos(movs);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const gastosCiclo = useMemo(() => {
    if (!ciclo) return [];
    const desde = new Date(ciclo.fecha_inicio).getTime();
    return movimientos.filter(
      (m) => m.tipo === 'gasto' && new Date(m.fecha).getTime() >= desde,
    );
  }, [movimientos, ciclo]);

  const gastosPorCategoria = useMemo(() => {
    const map: Record<string, number> = {};
    gastosCiclo.forEach((m) => {
      const cat = m.categoria?.nombre ?? m.user_category?.nombre ?? 'Sin categoría';
      map[cat] = (map[cat] ?? 0) + m.importe;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [gastosCiclo]);

  const totalGastadoCiclo = gastosCiclo.reduce((s, m) => s + m.importe, 0);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 bg-slate-800/60 rounded-lg w-1/3" />
        <div className="h-40 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-6 bg-slate-800/60 rounded-lg w-1/3" />
        <div className="h-40 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
      </div>
    );
  }

  if (!ciclo || !ciclo.resumen) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-slate-300 text-base font-medium">Sin ciclo activo</p>
        <p className="text-slate-400 text-sm mt-2">
          Registrá un ingreso e iniciá un ciclo para ver el balance.
        </p>
      </div>
    );
  }

  const items = ciclo.resumen.presupuesto_items.filter((i) => i.confirmado);

  return (
    <div className="space-y-6 pb-4">

      {/* ── Presupuesto por ítem ────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-300 mb-3">Presupuesto del ciclo</h2>

        <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-4 shadow-2xl">
          {items.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">Sin ítems de presupuesto confirmados</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((item) => {
                const pct = item.monto_estimado > 0
                  ? Math.min((item.monto_ejecutado / item.monto_estimado) * 100, 100)
                  : 0;
                const barColor =
                  item.estado === 'efectivado' ? 'bg-green-500' :
                  item.estado === 'parcial'    ? 'bg-blue-400'  :
                  'bg-slate-600';
                const estadoLabel =
                  item.estado === 'efectivado' ? 'Efectivado' :
                  item.estado === 'parcial'    ? `Pendiente ${formatARS(item.monto_pendiente)}` :
                  'Sin ejecutar';
                const estadoColor =
                  item.estado === 'efectivado' ? 'text-green-400' :
                  item.estado === 'parcial'    ? 'text-blue-300'  :
                  'text-slate-500';

                return (
                  <div key={item.id} className="bg-slate-800/50 border border-slate-700/50 backdrop-blur-xl rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-slate-100 text-sm font-medium truncate">
                        {item.descripcion ?? 'Sin descripción'}
                      </span>
                      <span className="text-slate-400 text-xs whitespace-nowrap tabular-nums flex-shrink-0">
                        {formatARS(item.monto_ejecutado)} / {formatARS(item.monto_estimado)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden mb-1.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className={estadoColor}>{estadoLabel}</span>
                      <span className="text-slate-500">{Math.round(pct)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Gastos por categoría ────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-300">Gastos por categoría</h2>
          <span className="text-slate-400 text-xs tabular-nums">{formatARS(totalGastadoCiclo)} total</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-4 shadow-2xl">
          {gastosPorCategoria.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">Sin gastos en este ciclo</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gastosPorCategoria.map(([cat, total]) => {
                const pct = totalGastadoCiclo > 0 ? (total / totalGastadoCiclo) * 100 : 0;
                return (
                  <div key={cat} className="bg-slate-800/50 border border-slate-700/50 backdrop-blur-xl rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-slate-200 text-sm">{cat}</span>
                      <span className="text-slate-300 text-sm tabular-nums font-medium">{formatARS(total)}</span>
                    </div>
                    <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-right mt-1">
                      <span className="text-[10px] font-mono text-slate-500">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
