import type { Inversion } from '../types';

interface InversionCardProps {
  inversion: Inversion;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function rendimientoColor(pct: number | null): string {
  if (pct === null) return 'text-slate-400';
  if (pct >= 0) return 'text-green-400';
  return 'text-red-400';
}

function rendimientoBadge(pct: number | null): string {
  if (pct === null) return 'bg-slate-700/50 text-slate-400';
  if (pct >= 0) return 'bg-green-500/10 text-green-400 border border-green-500/20';
  return 'bg-red-500/10 text-red-400 border border-red-500/20';
}

export default function InversionCard({ inversion: inv, onClick, onEdit, onDelete }: InversionCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 cursor-pointer hover:bg-slate-700/60 hover:border-slate-600/50 transition-all duration-200"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-semibold text-base truncate">{inv.nombre}</h3>
          {inv.ticker && (
            <span className="text-slate-500 text-xs font-mono">{inv.ticker}</span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded hover:bg-slate-700/40 transition-colors"
          >
            Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-red-400/70 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-slate-500">Invertido: </span>
          <span className="text-slate-300 font-medium">
            {inv.monto_invertido ? formatARS(inv.monto_invertido) : '—'}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Actual: </span>
          <span className="text-slate-300 font-medium">
            {inv.valor_actual ? formatARS(inv.valor_actual) : '—'}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Cuotapartes: </span>
          <span className="text-slate-300 font-medium">
            {inv.cuotapartes ?? '—'}
          </span>
        </div>
        <div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${rendimientoBadge(inv.rendimiento_pct)}`}>
            {inv.rendimiento_pct !== null ? (
              <>
                <span>{inv.rendimiento_pct >= 0 ? '▲' : '▼'}</span>
                <span className={rendimientoColor(inv.rendimiento_pct)}>
                  {inv.rendimiento_pct >= 0 ? '+' : ''}{inv.rendimiento_pct.toFixed(1)}%
                </span>
              </>
            ) : (
              <span className="text-slate-500">Sin datos</span>
            )}
          </span>
        </div>
      </div>

      {inv.ultima_actualizacion && (
        <p className="text-slate-600 text-xs mt-2">
          Última actualización: {new Date(inv.ultima_actualizacion).toLocaleDateString('es-AR')}
        </p>
      )}
    </div>
  );
}
