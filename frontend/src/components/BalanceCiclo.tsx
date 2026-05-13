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
    return <div className="animate-pulse space-y-4 p-4">
      <div className="h-8 bg-slate-700/50 rounded-xl w-1/2" />
      <div className="h-32 bg-slate-700/50 rounded-xl" />
      <div className="h-32 bg-slate-700/50 rounded-xl" />
    </div>;
  }

  if (!ciclo || !ciclo.resumen) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm mt-12">
        No hay ciclo activo. Registrá un ingreso e iniciá un ciclo para ver el balance.
      </div>
    );
  }

  const items = ciclo.resumen.presupuesto_items.filter((i) => i.confirmado);

  return (
    <div className="space-y-6 pb-24">

      {/* ── Presupuesto por ítem ────────────────────────── */}
      <section>
        <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">
          Presupuesto del ciclo
        </h2>

        {items.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">Sin ítems de presupuesto confirmados</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const pct = item.monto_estimado > 0
                ? Math.min((item.monto_ejecutado / item.monto_estimado) * 100, 100)
                : 0;
              const barColor =
                item.estado === 'efectivado' ? 'bg-emerald-500' :
                item.estado === 'parcial' ? 'bg-blue-400' :
                'bg-slate-500';
              const label = item.descripcion ?? 'Sin descripción';

              return (
                <div
                  key={item.id}
                  className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200 text-sm font-medium truncate">{label}</span>
                    <span className="text-slate-400 text-xs whitespace-nowrap tabular-nums flex-shrink-0">
                      {formatARS(item.monto_ejecutado)} / {formatARS(item.monto_estimado)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span className={
                      item.estado === 'efectivado' ? 'text-emerald-400' :
                      item.estado === 'parcial' ? 'text-blue-300' : ''
                    }>
                      {item.estado === 'efectivado' ? 'Efectivado' :
                       item.estado === 'parcial' ? `Pendiente ${formatARS(item.monto_pendiente)}` :
                       'Sin ejecutar'}
                    </span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Gastos por categoría ────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
            Gastos por categoría
          </h2>
          <span className="text-slate-500 text-xs tabular-nums">{formatARS(totalGastadoCiclo)}</span>
        </div>

        {gastosPorCategoria.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">Sin gastos en este ciclo</p>
        ) : (
          <div className="space-y-1.5">
            {gastosPorCategoria.map(([cat, total]) => {
              const pct = totalGastadoCiclo > 0 ? (total / totalGastadoCiclo) * 100 : 0;
              return (
                <div key={cat} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 text-sm">{cat}</span>
                    <span className="text-slate-300 text-sm tabular-nums font-medium">{formatARS(total)}</span>
                  </div>
                  <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400/70 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
