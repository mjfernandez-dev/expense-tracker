import { useState, useEffect, useCallback } from 'react';
import type { Ciclo, CicloCreate } from '../types';
import { getCicloActivo, updateCiclo, cerrarCiclo } from '../services/api';

interface Props {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const SEMAFORO_COLORS = {
  verde: {
    bar: 'bg-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-400',
    msg: 'Estás dentro del presupuesto de hoy',
  },
  amarillo: {
    bar: 'bg-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/30',
    text: 'text-amber-300',
    msg: 'Cerca del límite diario',
  },
  rojo: {
    bar: 'bg-red-500',
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-400',
    msg: 'Estás consumiendo presupuesto de días futuros',
  },
} as const;

function EditCicloModal({
  ciclo,
  onClose,
  onSaved,
}: {
  ciclo: Ciclo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fechaFin, setFechaFin] = useState(ciclo.fecha_fin.split('T')[0]);
  const [ahorro, setAhorro] = useState(String(ciclo.ahorro_objetivo));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const fechaFinDt = new Date(fechaFin + 'T23:59:59');
    if (fechaFinDt <= new Date()) {
      setError('La fecha de fin debe ser posterior a hoy');
      return;
    }
    try {
      setLoading(true);
      const data: Partial<CicloCreate> = {
        fecha_fin: fechaFin + 'T23:59:59',
        ahorro_objetivo: parseFloat(ahorro) || 0,
      };
      await updateCiclo(ciclo.id, data);
      onSaved();
      onClose();
    } catch {
      setError('No se pudo guardar. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Editar ciclo</h3>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="space-y-1">
          <label className="text-slate-300 text-sm">Fecha de fin del ciclo</label>
          <input
            type="date"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-slate-300 text-sm">Objetivo de ahorro ($)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={ahorro}
            onChange={e => setAhorro(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardCiclo({ refreshKey }: Props) {
  const [ciclo, setCiclo] = useState<Ciclo | null | undefined>(undefined); // undefined = cargando
  const [showEdit, setShowEdit] = useState(false);
  const [closingCiclo, setClosingCiclo] = useState(false);

  const fetchCiclo = useCallback(async () => {
    try {
      const data = await getCicloActivo();
      setCiclo(data);
    } catch {
      setCiclo(null);
    }
  }, []);

  useEffect(() => {
    fetchCiclo();
  }, [fetchCiclo, refreshKey]);

  const handleCerrar = async () => {
    if (!ciclo || !confirm('¿Cerrar este ciclo?')) return;
    setClosingCiclo(true);
    try {
      await cerrarCiclo(ciclo.id);
      setCiclo(null);
    } finally {
      setClosingCiclo(false);
    }
  };

  // Cargando
  if (ciclo === undefined) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 mb-6 animate-pulse h-28" />
    );
  }

  // Sin ciclo activo
  if (!ciclo || !ciclo.resumen) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">💡</span>
          <div>
            <p className="text-slate-200 font-medium text-sm">Sin ciclo financiero activo</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Registrá tu próximo cobro como <span className="text-blue-400 font-medium">Inicio de Ciclo</span> para activar el seguimiento de Daily Cap y solvencia diaria.
            </p>
          </div>
        </div>
      </div>
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
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs font-medium uppercase tracking-wide">Ciclo financiero</span>
            <span className="bg-slate-700/60 text-slate-300 text-xs px-2 py-0.5 rounded-full">
              {r.dias_restantes} día{r.dias_restantes !== 1 ? 's' : ''} restante{r.dias_restantes !== 1 ? 's' : ''}
            </span>
            <span className="text-slate-500 text-xs">hasta {fechaFinLabel}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowEdit(true)}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              Editar
            </button>
            <button
              onClick={handleCerrar}
              disabled={closingCiclo}
              className="text-slate-500 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Daily Cap prominente */}
        <div className="flex items-end gap-3 mb-3">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Daily Cap — podés gastar hoy</p>
            <p className="text-3xl font-bold text-white">{formatARS(r.daily_cap)}</p>
          </div>
          <div className="mb-1">
            <p className={`text-xs font-medium ${colors.text}`}>{colors.msg}</p>
          </div>
        </div>

        {/* Barra de progreso semáforo */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Gastaste hoy: {formatARS(r.gasto_hoy)}</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Info secundaria */}
        <div className="flex gap-4 text-xs text-slate-400 border-t border-slate-700/40 pt-3">
          <span>Disponible: <span className="text-slate-200 font-medium">{formatARS(r.saldo_disponible_actual)}</span></span>
          <span>Ingresos ciclo: <span className="text-slate-300">{formatARS(r.total_ingresos)}</span></span>
          {r.ahorro_objetivo > 0 && (
            <span>Ahorro: <span className="text-emerald-400">{formatARS(r.ahorro_objetivo)}</span></span>
          )}
        </div>
      </div>
    </>
  );
}
