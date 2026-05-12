import { useState, useEffect } from 'react';
import type { PresupuestoItemCreate, UserCategory } from '../types';
import { getUserCategories, getCicloActivo, createCiclo, confirmarPresupuesto } from '../services/api';
import {
  getDaysRemainingInclusiveBA,
  getLastDayOfCurrentMonthBA,
  isDateAtOrAfterTodayBA,
} from '../utils/buenosAiresDate';

interface Props {
  movimientoOrigenId: number | null;
  importeReferencia: number;
  onComplete: () => void;
  onClose: () => void;
}

interface CategoriaPresupuesto {
  user_category_id: number;
  nombre: string;
  monto: string;
  activa: boolean;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const STEPS = ['Duración', 'Ahorro', 'Presupuesto'] as const;

export default function CicloWizard({ movimientoOrigenId, importeReferencia, onComplete, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [fechaFin, setFechaFin] = useState(getLastDayOfCurrentMonthBA());
  const [ahorro, setAhorro] = useState('0');
  const [categorias, setCategorias] = useState<CategoriaPresupuesto[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step !== 2) return;
    setLoadingCats(true);

    Promise.all([getUserCategories(), getCicloActivo()])
      .then(([cats, cicloActivo]) => {
        const sugerencias: Record<number, number> = {};
        if (cicloActivo?.resumen?.presupuesto_items) {
          for (const item of cicloActivo.resumen.presupuesto_items) {
            if (item.user_category_id) {
              sugerencias[item.user_category_id] = Math.max(
                Number(item.monto_estimado),
                Number(item.monto_ejecutado ?? 0),
              );
            }
          }
        }

        setCategorias(
          cats.map((cat: UserCategory) => ({
            user_category_id: cat.id,
            nombre: cat.nombre,
            monto: sugerencias[cat.id] ? String(sugerencias[cat.id]) : '',
            activa: !!sugerencias[cat.id],
          }))
        );
      })
      .finally(() => setLoadingCats(false));
  }, [step]);

  const ahorroNum = parseFloat(ahorro) || 0;
  const diasRestantes = getDaysRemainingInclusiveBA(fechaFin);
  const totalPresupuestado = categorias
    .filter(c => c.activa && parseFloat(c.monto) > 0)
    .reduce((sum, c) => sum + (parseFloat(c.monto) || 0), 0);
  const disponible = Math.max(0, importeReferencia - ahorroNum - totalPresupuestado);
  const dailyCapPreview = diasRestantes > 0 ? disponible / diasRestantes : 0;

  const handleNextStep1 = () => {
    setError('');
    if (!isDateAtOrAfterTodayBA(fechaFin)) {
      setError('La fecha de fin debe ser posterior a hoy');
      return;
    }
    setStep(1);
  };

  const handleNextStep2 = () => {
    setError('');
    if (ahorroNum < 0) {
      setError('El ahorro no puede ser negativo');
      return;
    }
    setStep(2);
  };

  const toggleCategoria = (idx: number) => {
    setCategorias(prev => prev.map((c, i) => i === idx ? { ...c, activa: !c.activa } : c));
  };

  const setMonto = (idx: number, value: string) => {
    setCategorias(prev => prev.map((c, i) => i === idx ? { ...c, monto: value } : c));
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);
    try {
      const ciclo = await createCiclo({
        movimiento_origen_id: movimientoOrigenId ?? undefined,
        fecha_fin: fechaFin + 'T23:59:59',
        ahorro_objetivo: ahorroNum,
      });

      const items: PresupuestoItemCreate[] = categorias
        .filter(c => c.activa && parseFloat(c.monto) > 0)
        .map(c => ({
          categoria_id: null,
          user_category_id: c.user_category_id,
          monto_estimado: parseFloat(c.monto),
          confirmado: true,
          descripcion: null,
        }));

      if (items.length > 0) {
        await confirmarPresupuesto(ciclo.id, items);
      }

      onComplete();
    } catch {
      setError('No se pudo crear el ciclo. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-lg">Nuevo ciclo financiero</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition-colors">×</button>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 ${i === step ? 'opacity-100' : i < step ? 'opacity-70' : 'opacity-30'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? 'bg-blue-500 text-white' : i === step ? 'bg-white text-slate-900' : 'bg-slate-600 text-slate-400'}`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs font-medium ${i === step ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`w-6 h-px ${i < step ? 'bg-blue-500' : 'bg-slate-600'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* PASO 1: Fecha fin */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <p className="text-slate-200 font-medium mb-1">¿Hasta cuándo debe durar el dinero?</p>
                <p className="text-slate-400 text-sm">Esta es la fecha en que esperás tu próximo cobro.</p>
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 text-sm">Fecha de fin del ciclo</label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm [color-scheme:dark]"
                />
              </div>
              <div className="bg-slate-800/60 rounded-xl px-4 py-3 text-sm text-slate-300">
                Sueldo registrado: <span className="text-white font-semibold">{formatARS(importeReferencia)}</span>
                {' · '}
                <span className="text-blue-300">{diasRestantes} días de ciclo</span>
              </div>
            </div>
          )}

          {/* PASO 2: Ahorro */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-slate-200 font-medium mb-1">¿Cuánto querés ahorrar este mes?</p>
                <p className="text-slate-400 text-sm">Este monto se reserva de inmediato y no cuenta como disponible.</p>
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 text-sm">Objetivo de ahorro ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={ahorro}
                  onChange={e => setAhorro(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="0"
                />
              </div>
              <div className="bg-slate-800/60 rounded-xl px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>Sueldo</span>
                  <span className="text-white">{formatARS(importeReferencia)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>− Ahorro</span>
                  <span className="text-red-400">−{formatARS(ahorroNum)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1 font-medium">
                  <span className="text-slate-200">Para presupuestar</span>
                  <span className="text-white">{formatARS(Math.max(0, importeReferencia - ahorroNum))}</span>
                </div>
              </div>
            </div>
          )}

          {/* PASO 3: Presupuesto por categoría */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-slate-200 font-medium mb-1">¿A qué categorías vas a destinar dinero?</p>
                <p className="text-slate-400 text-sm">Marcá las categorías que tienen un monto fijo este ciclo. Los gastos en esas categorías no afectarán tu Daily Cap.</p>
              </div>

              {loadingCats && <p className="text-slate-400 text-sm text-center py-4">Cargando categorías...</p>}

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {categorias.map((cat, idx) => (
                  <div
                    key={cat.user_category_id}
                    className={`flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2.5 border transition-colors ${cat.activa ? 'border-blue-500/30' : 'border-slate-700/40 opacity-50'}`}
                  >
                    <button
                      onClick={() => toggleCategoria(idx)}
                      className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${cat.activa ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}
                    >
                      {cat.activa && <span className="text-white text-xs font-bold">✓</span>}
                    </button>
                    <span className="flex-1 text-slate-200 text-sm truncate">{cat.nombre}</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={cat.monto}
                      onChange={e => { setMonto(idx, e.target.value); if (!cat.activa && e.target.value) toggleCategoria(idx); }}
                      placeholder="$0"
                      className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div className="bg-slate-800/60 rounded-xl px-4 py-3 space-y-1 text-sm border-t border-slate-700/40">
                <div className="flex justify-between text-slate-300">
                  <span>Sueldo</span>
                  <span className="text-white">{formatARS(importeReferencia)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>− Ahorro</span>
                  <span className="text-red-400">−{formatARS(ahorroNum)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>− Presupuestado</span>
                  <span className="text-amber-400">−{formatARS(totalPresupuestado)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1 font-semibold">
                  <span className="text-slate-200">Daily Cap ({diasRestantes} días)</span>
                  <span className="text-blue-300">{formatARS(dailyCapPreview)}/día</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Anterior
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={step === 0 ? handleNextStep1 : handleNextStep2}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
            >
              {loading ? 'Creando ciclo...' : '¡Activar ciclo!'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
