import { useState, useEffect, useCallback } from 'react';
import type { Ciclo, CicloCreate, GastoFijo, CicloGastoFijoItemCreate } from '../types';
import { getCicloActivo, updateCiclo, cerrarCiclo, getGastosFijos, confirmarGastosFijos } from '../services/api';

interface Props {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatARSDecimal = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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

interface GastoFijoEdit {
  gasto_fijo_id: number | null;
  descripcion: string;
  monto: string;
  confirmado: boolean;
  esAdhoc: boolean;
}

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
  const [gastosFijos, setGastosFijos] = useState<GastoFijoEdit[]>([]);
  const [loadingGF, setLoadingGF] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nuevoAdHoc, setNuevoAdHoc] = useState('');
  const [nuevoAdHocMonto, setNuevoAdHocMonto] = useState('');

  // Cargar templates de gastos fijos y pre-poblar con los ya confirmados
  useEffect(() => {
    getGastosFijos()
      .then((templates: GastoFijo[]) => {
        const confirmados = ciclo.resumen?.gastos_fijos ?? [];
        const items: GastoFijoEdit[] = templates
          .filter(t => t.activo)
          .map(t => {
            const yaConfirmado = confirmados.find(c => c.gasto_fijo_id === t.id);
            return {
              gasto_fijo_id: t.id,
              descripcion: t.descripcion,
              monto: String(yaConfirmado?.monto_confirmado ?? t.ultimo_importe ?? t.max_importe ?? 0),
              confirmado: !!yaConfirmado,
              esAdhoc: false,
            };
          });
        // Agregar ad-hocs ya confirmados (gasto_fijo_id null)
        const adhocs: GastoFijoEdit[] = confirmados
          .filter(c => c.gasto_fijo_id === null)
          .map(c => ({
            gasto_fijo_id: null,
            descripcion: c.descripcion_override ?? 'Sin descripción',
            monto: String(c.monto_confirmado),
            confirmado: true,
            esAdhoc: true,
          }));
        setGastosFijos([...items, ...adhocs]);
      })
      .finally(() => setLoadingGF(false));
  }, [ciclo]);

  const handleAddAdHoc = () => {
    if (!nuevoAdHoc.trim() || !nuevoAdHocMonto) return;
    setGastosFijos(prev => [
      ...prev,
      { gasto_fijo_id: null, descripcion: nuevoAdHoc.trim(), monto: nuevoAdHocMonto, confirmado: true, esAdhoc: true },
    ]);
    setNuevoAdHoc('');
    setNuevoAdHocMonto('');
  };

  const handleSave = async () => {
    setError('');
    const fechaFinDt = new Date(fechaFin + 'T23:59:59');
    if (fechaFinDt <= new Date()) {
      setError('La fecha de fin debe ser posterior a hoy');
      return;
    }
    try {
      setLoading(true);
      await updateCiclo(ciclo.id, {
        fecha_fin: fechaFin + 'T23:59:59',
        ahorro_objetivo: parseFloat(ahorro) || 0,
      } as Partial<CicloCreate>);

      const items: CicloGastoFijoItemCreate[] = gastosFijos
        .filter(gf => gf.confirmado)
        .map(gf => ({
          gasto_fijo_id: gf.gasto_fijo_id,
          monto_confirmado: parseFloat(gf.monto) || 0,
          confirmado: true,
          descripcion_override: gf.esAdhoc ? gf.descripcion : undefined,
        }));
      await confirmarGastosFijos(ciclo.id, items);

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
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Editar ciclo</h3>
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="space-y-1">
          <label className="text-slate-300 text-sm">Fecha de fin del ciclo</label>
          <input
            type="date"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
            className="w-full bg-slate-700 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
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
            className="w-full bg-slate-700 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Gastos fijos */}
        <div className="space-y-2">
          <label className="text-slate-300 text-sm">Gastos fijos del ciclo</label>
          {loadingGF ? (
            <p className="text-slate-500 text-xs text-center py-2">Cargando...</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {gastosFijos.map((gf, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 bg-slate-800/60 rounded-lg px-2.5 py-2 border ${gf.confirmado ? 'border-blue-500/30' : 'border-slate-700/40 opacity-50'}`}
                >
                  <button
                    onClick={() => setGastosFijos(prev => prev.map((g, i) => i === idx ? { ...g, confirmado: !g.confirmado } : g))}
                    className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${gf.confirmado ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}
                  >
                    {gf.confirmado && <span className="text-white text-xs font-bold leading-none">✓</span>}
                  </button>
                  <span className="flex-1 text-slate-200 text-xs truncate">{gf.descripcion}</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={gf.monto}
                    onChange={e => setGastosFijos(prev => prev.map((g, i) => i === idx ? { ...g, monto: e.target.value } : g))}
                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
              {gastosFijos.length === 0 && (
                <p className="text-slate-500 text-xs text-center py-2">Sin gastos fijos configurados</p>
              )}
            </div>
          )}

          {/* Ad-hoc */}
          <div className="flex gap-1.5 pt-1">
            <input
              type="text"
              placeholder="Descripción"
              value={nuevoAdHoc}
              onChange={e => setNuevoAdHoc(e.target.value)}
              className="flex-1 bg-slate-700 border border-slate-500 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              min="0"
              placeholder="$"
              value={nuevoAdHocMonto}
              onChange={e => setNuevoAdHocMonto(e.target.value)}
              className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAddAdHoc}
              className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            >
              +
            </button>
          </div>
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
  const [showInfo, setShowInfo] = useState(false);

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
      <div className="bg-slate-700/50 border border-slate-600/60 rounded-2xl p-4 mb-6 animate-pulse h-28" />
    );
  }

  // Sin ciclo activo
  if (!ciclo || !ciclo.resumen) {
    return (
      <div className="bg-slate-700/50 border border-slate-600/60 rounded-2xl p-4 mb-6">
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
            <span className="bg-slate-600/60 text-slate-200 text-xs px-2 py-0.5 rounded-full">
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

        {/* Presupuesto diario prominente */}
        <div className="flex items-end gap-3 mb-3">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Podés gastar hoy</p>
            <p className="text-3xl font-bold text-white">{formatARSDecimal(r.daily_cap)}</p>
            <p className="text-slate-500 text-xs mt-0.5">
              = dinero disponible ÷ {r.dias_restantes} día{r.dias_restantes !== 1 ? 's' : ''} restante{r.dias_restantes !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="mb-5">
            <p className={`text-xs font-medium ${colors.text}`}>{colors.msg}</p>
          </div>
        </div>

        {/* Barra de progreso semáforo */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Gastaste hoy: {formatARS(r.gasto_hoy)}</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-600/60 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${colors.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Info secundaria colapsable */}
        <button
          onClick={() => setShowInfo(v => !v)}
          className="flex items-center gap-2 w-full text-left border-t border-slate-600/50 pt-3"
        >
          <span className="text-xs text-slate-400">
            Disponible: <span className="text-slate-200 font-medium">{formatARS(r.saldo_disponible_actual)}</span>
          </span>
          <span className="ml-auto text-slate-500 text-xs">{showInfo ? '▲' : '▼'}</span>
        </button>
        {showInfo && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 pb-1">
            <span>Ingresos: <span className="text-slate-300">{formatARS(r.total_ingresos)}</span></span>
            {r.ahorro_objetivo > 0 && (
              <span>Ahorro: <span className="text-emerald-400">−{formatARS(r.ahorro_objetivo)}</span></span>
            )}
            {r.gastos_fijos_confirmados > 0 && (
              <span>Gastos fijos: <span className="text-orange-400">−{formatARS(r.gastos_fijos_confirmados)}</span></span>
            )}
            {r.total_gastos > 0 && (
              <span>Gastos registrados: <span className="text-red-400">−{formatARS(r.total_gastos)}</span></span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
