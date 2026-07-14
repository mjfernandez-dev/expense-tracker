import type { WishlistItem } from '../types';
import { deleteWishlistItem } from '../services/api';

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const PRIORITY_CONFIG: Record<string, { label: string; classes: string }> = {
  alta: { label: 'Alta', classes: 'bg-red-500/20 text-red-300 border-red-500/40' },
  media: { label: 'Media', classes: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  baja: { label: 'Baja', classes: 'bg-green-500/20 text-green-300 border-green-500/40' },
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Borrador', classes: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  'en-progreso': { label: 'En Progreso', classes: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  completado: { label: 'Completado', classes: 'bg-green-500/20 text-green-300 border-green-500/40' },
  cancelado: { label: 'Cancelado', classes: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
};

interface WishlistItemCardProps {
  item: WishlistItem;
  onEdit: (item: WishlistItem) => void;
  onDelete: () => void;
  onContribute?: (item: WishlistItem) => void;
  onWithdraw?: (item: WishlistItem) => void;
}

function WishlistItemCard({ item, onEdit, onDelete, onContribute, onWithdraw }: WishlistItemCardProps) {
  const priorityCfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.baja;
  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft;

  const handleDelete = async () => {
    try {
      await deleteWishlistItem(item.id);
      onDelete();
    } catch {
      // error will be handled at page level
    }
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-4 flex flex-col gap-3">
      {/* Header: name + actions */}
      <div className="flex justify-between items-start gap-2">
        <h3 className="text-white font-semibold text-base truncate flex-1">{item.name}</h3>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(item)}
            className="text-slate-400 hover:text-blue-400 text-xs px-2 py-1 rounded-lg hover:bg-slate-800/40 transition-colors"
          >
            Editar
          </button>
          <button
            onClick={handleDelete}
            className="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-slate-800/40 transition-colors"
          >
            Eliminar
          </button>
        </div>
      </div>

      {/* Badge row: priority + status + category */}
      <div className="flex flex-wrap gap-2">
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${priorityCfg.classes}`}>
          {priorityCfg.label}
        </span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusCfg.classes}`}>
          {statusCfg.label}
        </span>
        {item.category && (
          <span
            className="text-xs font-medium px-2.5 py-0.5 rounded-full border bg-slate-600/20 text-slate-300 border-slate-600/40"
          >
            {item.category.nombre}
          </span>
        )}
      </div>

      {/* Cost + savings row */}
      <div className="flex justify-between items-end text-sm">
        <div>
          <span className="text-slate-400 text-xs">Costo estimado</span>
          <p className="text-white font-semibold">{formatARS(item.estimated_cost)}</p>
        </div>
        <div className="text-right">
          <span className="text-slate-400 text-xs">Ahorrado</span>
          <p className="text-green-400 font-medium">{formatARS(item.monto_ahorrado)}</p>
        </div>
      </div>

      {/* Progress bar */}
      {item.estimated_cost > 0 && (
        <div className="space-y-1">
          <div className="w-full bg-slate-700/50 rounded-full h-2">
            <div
              className="bg-blue-500 rounded-full h-2 transition-all duration-300"
              style={{ width: `${Math.min(100, (item.monto_ahorrado / item.estimated_cost) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>{Math.min(100, Math.round((item.monto_ahorrado / item.estimated_cost) * 100))}%</span>
            <span>Meta: {formatARS(item.estimated_cost)}</span>
          </div>
        </div>
      )}

      {/* Contribute / Withdraw buttons */}
      <div className="flex gap-2">
        {onContribute && (
          <button
            onClick={() => onContribute(item)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Aportar
          </button>
        )}
        {onWithdraw && item.monto_ahorrado > 0 && (
          <button
            onClick={() => onWithdraw(item)}
            className="flex-1 bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Retirar
          </button>
        )}
      </div>

      {/* Notes */}
      {item.notes && (
        <p className="text-slate-400 text-xs italic border-t border-slate-700/50 pt-2 mt-1">{item.notes}</p>
      )}
    </div>
  );
}

export default WishlistItemCard;
