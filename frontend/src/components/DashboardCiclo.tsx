import { useState, useEffect, useCallback } from 'react';
import type { Ciclo } from '../types';
import { getCicloActivo, cerrarCiclo } from '../services/api';
import EditCicloModal from './EditCicloModal';
import ConfirmModal from './ConfirmModal';

interface DashboardCicloProps {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const SEMAFORO_COLORS = {
  verde: {
    bar: 'bg-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-400',
  },
  amarillo: {
    bar: 'bg-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/30',
    text: 'text-amber-300',
  },
  rojo: {
    bar: 'bg-red-500',
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-400',
  },
} as const;

export default function DashboardCiclo({ refreshKey }: DashboardCicloProps) {
  const [ciclo, setCiclo] = useState<Ciclo | null | undefined>(undefined);
  const [loadingCiclo, setLoadingCiclo] = useState<boolean>(true);
  const [showEdit, setShowEdit] = useState<boolean>(false);
  const [showConfirmCerrar, setShowConfirmCerrar] = useState<boolean>(false);
  const [closingCiclo, setClosingCiclo] = useState<boolean>(false);
  const [errorCiclo, setErrorCiclo] = useState<string | null>(null);

  const fetchCiclo = useCallback(async () => {
    setLoadingCiclo(true);
    try {
      const data = await getCicloActivo();
      setCiclo(data);
    } catch {
      setCiclo(null);
      setErrorCiclo('No se pudo cargar el ciclo.');
    } finally {
      setLoadingCiclo(false);
    }
  }, []);

  useEffect(() => {
    fetchCiclo();
  }, [fetchCiclo, refreshKey]);

  const handleCerrarClick = () => {
    if (!ciclo) return;
    setShowConfirmCerrar(true);
  };

  const handleCerrarConfirm = async () => {
    if (!ciclo) return;
    setClosingCiclo(true);
    try {
      await cerrarCiclo(ciclo.id);
      setCiclo(null);
      setShowConfirmCerrar(false);
    } catch {
      setErrorCiclo('No se pudo cerrar el ciclo. Intentá de nuevo.');
    } finally {
      setClosingCiclo(false);
    }
  };

  if (loadingCiclo) {
    return <div className="bg-slate-700/50 border border-slate-600/60 rounded-2xl p-4 mb-6 animate-pulse h-28" />;
  }

  const hasCicloActivo = ciclo && ciclo.resumen;

  if (!hasCicloActivo || !ciclo?.resumen) {
    return (
      <>
        <div className="bg-slate-700/50 border border-slate-600/60 rounded-2xl p-4 mb-6">
          {errorCiclo && <p className="text-red-400 text-xs mb-2">{errorCiclo}</p>}
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
      </>
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

      {showConfirmCerrar && (
        <ConfirmModal
          title="Cerrar ciclo"
          confirmLabel="Cerrar ciclo"
          loadingLabel="Cerrando..."
          destructive
          loading={closingCiclo}
          onConfirm={handleCerrarConfirm}
          onCancel={() => setShowConfirmCerrar(false)}
        >
          <p>
            ¿Seguro que querés cerrar el ciclo actual? El seguimiento diario se detendrá
            hasta que registres un nuevo ingreso e inicies otro ciclo.
          </p>
        </ConfirmModal>
      )}

      <div className={`border rounded-2xl p-4 mb-6 ${colors.bg}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs font-medium uppercase tracking-wide">Ciclo financiero</span>
            <span className="bg-slate-600/60 text-slate-200 text-xs px-2 py-0.5 rounded-full">
              {r.dias_restantes} día{r.dias_restantes !== 1 ? 's' : ''} restante{r.dias_restantes !== 1 ? 's' : ''}
            </span>
            <span className="text-slate-500 text-xs">hasta {fechaFinLabel}</span>
          </div>
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setShowEdit(true)}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              Editar
            </button>
            <span className="w-px h-4 bg-slate-600/50 mx-1" />
            <button
              onClick={handleCerrarClick}
              disabled={closingCiclo}
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {closingCiclo ? '...' : 'Cerrar'}
            </button>
          </div>
        </div>

        {/* ── Card 1: SOLVENCIA DIARIA ── */}
        <div className="bg-slate-900/80 border border-slate-700/70 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-2xl mb-4">
          <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-b border-slate-600/30 px-5 py-3 flex items-center gap-2">
            <span className="text-blue-400 text-lg">⚡</span>
            <h3 className="text-slate-200 font-mono font-semibold text-sm tracking-wider">SOLVENCIA DIARIA</h3>
          </div>

          <div className="p-5 space-y-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs font-mono mb-2 tracking-widest uppercase">Podés gastar hoy</p>
              <p className={`text-5xl font-mono font-bold tracking-tight leading-none ${colors.text}`}>
                {formatARS(r.daily_cap)}
              </p>
            </div>

            {/* Disponible del ciclo — numerador del gasto diario */}
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono text-slate-400 uppercase tracking-widest font-semibold">Disponible del ciclo</p>
                <p className="text-xs text-slate-500 mt-0.5">Base del gasto diario</p>
              </div>
              <p className="text-xl font-bold text-emerald-300 tabular-nums whitespace-nowrap">{formatARS(r.saldo_disponible_actual)}</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">Gastaste hoy</span>
                <span className="text-slate-200 font-medium">{formatARS(r.gasto_hoy)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs font-mono text-slate-500">
                <span>$0</span>
                <span>{Math.round(pct)}% del límite</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 2: PRESUPUESTO DEL CICLO ── */}
        <div className="bg-slate-900/80 border border-slate-700/70 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-2xl mb-4">
          <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-b border-slate-600/30 px-5 py-3 flex items-center gap-2">
            <span className="text-blue-400 text-lg">📊</span>
            <h3 className="text-slate-200 font-mono font-semibold text-sm tracking-wider">PRESUPUESTO DEL CICLO</h3>
          </div>

          <div className="p-5 space-y-4">
            {/* ── Resumen ejecución del presupuesto ── */}
            {(() => {
              const items = r.presupuesto_items.filter(i => i.confirmado);
              if (items.length === 0) {
                return (
                  <p className="text-xs text-slate-400 text-center py-3">
                    Sin presupuesto confirmado. Presupuestá tus gastos desde la tab{' '}
                    <span className="text-blue-400 font-medium">Presupuesto</span>.
                  </p>
                );
              }
              const totalPresupuestado = items.reduce((s, i) => s + i.monto_estimado, 0);
              const totalEjecutado = items.reduce((s, i) => s + i.monto_ejecutado, 0);
              const pct = totalPresupuestado > 0 ? Math.round((totalEjecutado / totalPresupuestado) * 100) : 0;
              return (
                <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Ejecución</span>
                    <span className="text-xs font-mono text-slate-500">{pct}%</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-mono text-slate-200 font-semibold">{formatARS(totalEjecutado)}</span>
                    <span className="text-xs font-mono text-slate-500">
                      de <span className="text-slate-300">{formatARS(totalPresupuestado)}</span> presupuestados
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {totalPresupuestado - totalEjecutado > 0
                      ? `Restan ${formatARS(totalPresupuestado - totalEjecutado)} por ejecutar`
                      : 'Presupuesto completamente ejecutado'}
                  </p>
                  {/* Total líquido: disponible + lo que resta por ejecutar */}
                  <div className="border-t border-slate-700/40 pt-2 mt-1 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">
                      Disponible + restante
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-100 tabular-nums">
                      {formatARS(r.saldo_disponible_actual + totalPresupuestado - totalEjecutado)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {errorCiclo && <p className="text-red-400 text-xs mb-2">{errorCiclo}</p>}
    </>
  );
}
