import { useEffect } from 'react';
import type { ProgresoCategoria } from '../utils/progresoCategoria';

interface ProgresoCategoriaToastProps {
  categoriaNombre: string;
  progreso: ProgresoCategoria | null;
  onDismiss: () => void;
  duracionMs?: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

// Feedback efímero tras cargar un gasto: cómo viene la categoría en el ciclo,
// sin tener que ir al tab de Presupuesto. Se monta a nivel App para sobrevivir
// al cierre del modal y se autodescarta.
function ProgresoCategoriaToast({
  categoriaNombre,
  progreso,
  onDismiss,
  duracionMs = 6000,
}: ProgresoCategoriaToastProps) {
  useEffect(() => {
    if (!progreso) return;
    const timeout = setTimeout(onDismiss, duracionMs);
    return () => clearTimeout(timeout);
  }, [progreso, duracionMs, onDismiss]);

  // Sin ciclo activo no hay progreso que mostrar: el gasto queda sin
  // comprometer y el tab de Presupuesto ya lo explica.
  if (!progreso || progreso.tipo === 'sin_ciclo') return null;

  const cuerpo = () => {
    switch (progreso.tipo) {
      case 'fuera_de_ciclo':
        return (
          <>
            <p className="text-slate-200 font-semibold text-sm">Fuera del ciclo actual</p>
            <p className="text-slate-400 text-xs leading-relaxed mt-0.5">
              La fecha del gasto no entra en el ciclo, así que no descuenta presupuesto.
            </p>
          </>
        );

      case 'sin_presupuesto':
        return (
          <>
            <p className="text-slate-200 font-semibold text-sm">
              Llevás <span className="text-white tabular-nums">{formatARS(progreso.gastado)}</span> en {categoriaNombre}
            </p>
            <p className="text-slate-400 text-xs leading-relaxed mt-0.5">Sin presupuesto fijado para esta categoría.</p>
          </>
        );

      case 'con_presupuesto': {
        const excedido = progreso.excedido > 0;
        const completo = !excedido && progreso.gastado >= progreso.estimado;
        const colorBarra = excedido ? 'bg-red-500' : completo ? 'bg-green-500' : 'bg-blue-400';
        const colorPct = excedido ? 'text-red-400' : completo ? 'text-green-400' : 'text-blue-300';

        return (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-slate-200 font-semibold text-sm truncate">{categoriaNombre}</p>
              <span className={`text-xs font-mono flex-shrink-0 ${colorPct}`}>{progreso.porcentaje}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${colorBarra}`}
                style={{ width: `${progreso.porcentaje}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1.5">
              <span className="text-slate-400 text-xs tabular-nums whitespace-nowrap">
                {formatARS(progreso.gastado)}
                <span className="text-slate-600"> / </span>
                {formatARS(progreso.estimado)}
              </span>
              {excedido && (
                <span className="text-red-400 text-xs font-medium whitespace-nowrap">
                  +{formatARS(progreso.excedido)} excedido
                </span>
              )}
            </div>
          </>
        );
      }
    }
  };

  const borde =
    progreso.tipo === 'con_presupuesto' && progreso.excedido > 0
      ? 'border-l-red-500'
      : progreso.tipo === 'con_presupuesto'
        ? 'border-l-blue-500'
        : 'border-l-slate-500';

  return (
    <div className="fixed bottom-36 inset-x-0 z-40 px-3 sm:px-4 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`max-w-md mx-auto pointer-events-auto bg-slate-900/90 backdrop-blur-2xl border border-slate-700/70 border-l-4 ${borde} rounded-2xl shadow-2xl px-4 py-3`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">{cuerpo()}</div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar progreso"
            className="text-slate-500 hover:text-slate-200 leading-none text-sm flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProgresoCategoriaToast;
