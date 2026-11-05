// COMPONENTE: Card de comparación del gasto acumulado con el ciclo anterior.
// Presenta los valores que calcula el backend (comparacion_anterior del resumen);
// el toggle alterna entre gasto total y gasto libre sin nuevas llamadas.
import { useState } from 'react';
import type { ComparacionCicloAnterior } from '../types';

interface ComparacionCicloAnteriorCardProps {
  comparacion: ComparacionCicloAnterior;
}

type Metrica = 'total' | 'libre';

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const METRICAS: { key: Metrica; label: string }[] = [
  { key: 'total', label: 'Gasto total' },
  { key: 'libre', label: 'Gasto libre' },
];

const renderMetricaSelector = (metrica: Metrica, onSelect: (m: Metrica) => void) => (
  <div className="flex gap-1 p-0.5 bg-slate-700/50 rounded-lg w-fit">
    {METRICAS.map(({ key, label }) => (
      <button
        key={key}
        onClick={() => onSelect(key)}
        className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors ${
          metrica === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);

export default function ComparacionCicloAnteriorCard({ comparacion }: ComparacionCicloAnteriorCardProps) {
  const [metrica, setMetrica] = useState<Metrica>('total');

  const esFallback = comparacion.ancla === 'dia_transcurrido';
  const etiquetaPunto = esFallback
    ? `Día ${comparacion.dias_comparados} transcurrido de ambos ciclos`
    : `Al punto donde faltaban ${comparacion.dias_comparados} días`;

  const anterior = metrica === 'total' ? comparacion.total_anterior : comparacion.libre_anterior;
  const actual = metrica === 'total' ? comparacion.total_actual : comparacion.libre_actual;
  const delta = actual - anterior;
  const deltaColor =
    delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-400';

  return (
    <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Vs ciclo anterior</p>
          <p className="text-xs text-slate-500 mt-0.5">{etiquetaPunto}</p>
        </div>
        {renderMetricaSelector(metrica, setMetrica)}
      </div>
      <div className="grid grid-cols-3 gap-x-4 text-xs tabular-nums border-t border-slate-700/40 pt-2">
        <span className="flex flex-col min-w-0">
          <span className="text-slate-500 font-mono">Anterior</span>
          <span className="text-slate-300">{formatARS(anterior)}</span>
        </span>
        <span className="flex flex-col min-w-0">
          <span className="text-slate-500 font-mono">Este ciclo</span>
          <span className="text-slate-200">{formatARS(actual)}</span>
        </span>
        <span className="flex flex-col items-end min-w-0">
          <span className="text-slate-500 font-mono">Delta</span>
          <span className={deltaColor}>
            {delta > 0 ? '+' : ''}{formatARS(delta)}
          </span>
        </span>
      </div>
    </div>
  );
}
