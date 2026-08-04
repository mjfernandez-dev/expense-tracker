import { useState, useEffect } from 'react';
import type { PresupuestoItemCreate, UserCategory } from '../types';
import { getUserCategories, getCicloActivo, getUltimoCiclo, getMaximosHistoricos, createCiclo, confirmarPresupuesto, cerrarCiclo, updateUserPreferences } from '../services/api';
import {
  getDaysRemainingInclusiveBA,
  getLastDayOfCurrentMonthBA,
  isDateAtOrAfterTodayBA,
} from '../utils/buenosAiresDate';

interface CicloWizardProps {
  movimientoOrigenId: number | null;
  importeReferencia: number;
  onComplete: () => void;
  onClose: () => void;
  porcentajeAhorro?: number;
}

interface CategoriaPresupuesto {
  user_category_id: number;
  nombre: string;
  monto: string;
  activa: boolean;
}

interface CicloActivoInfo {
  id: number;
  fecha_fin: string;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

const STEPS = ['Duración', 'Ahorro', 'Presupuesto'] as const;

export default function CicloWizard({ movimientoOrigenId, importeReferencia, onComplete, onClose, porcentajeAhorro = 10 }: CicloWizardProps) {
  const [step, setStep] = useState<number>(0);
  const [fechaFin, setFechaFin] = useState<string>(getLastDayOfCurrentMonthBA());
  const ahorroCalculado = Math.round(importeReferencia * porcentajeAhorro / 100);
  // Paso Ahorro bidireccional: el último campo tocado manda y el otro se deriva.
  const [ahorro, setAhorro] = useState<string>(String(ahorroCalculado));
  const [ahorroPorcentaje, setAhorroPorcentaje] = useState<string>(String(porcentajeAhorro));
  const [fuenteEdicion, setFuenteEdicion] = useState<'monto' | 'porcentaje'>('monto');
  const [categorias, setCategorias] = useState<CategoriaPresupuesto[]>([]);
  const [loadingCats, setLoadingCats] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // undefined = verificando, null = no hay ciclo activo, objeto = hay ciclo activo a cerrar
  const [cicloActivo, setCicloActivo] = useState<CicloActivoInfo | null | undefined>(undefined);

  useEffect(() => {
    const verificar = async () => {
      try {
        const c = await getCicloActivo();
        setCicloActivo(c ? { id: c.id, fecha_fin: c.fecha_fin } : null);
      } catch {
        setError('No se pudo verificar el ciclo activo.');
        setCicloActivo(null);
      }
    };
    verificar();
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    const cargar = async () => {
      setLoadingCats(true);
      try {
        const [cicloConDatos, cats, maximosHistoricos] = await Promise.all([
          (await getCicloActivo()) ?? (await getUltimoCiclo()),
          getUserCategories(),
          getMaximosHistoricos(),
        ]);
        const sugerenciasCiclo: Record<number, number> = {};

        // Sugerencias del último ciclo, combinadas con el máximo histórico
        if (cicloConDatos?.resumen?.presupuesto_items) {
          for (const item of cicloConDatos.resumen.presupuesto_items) {
            if (item.user_category_id) {
              const ultimoCiclo = Math.max(
                Number(item.monto_estimado),
                Number(item.monto_ejecutado ?? 0),
              );
              const historico = maximosHistoricos[item.user_category_id] ?? 0;
              sugerenciasCiclo[item.user_category_id] = Math.max(ultimoCiclo, historico);
            }
          }
        }

        // Categorías con gasto histórico que no estuvieron en el último ciclo
        for (const [catId, maximo] of Object.entries(maximosHistoricos)) {
          const id = Number(catId);
          if (!sugerenciasCiclo[id]) {
            sugerenciasCiclo[id] = maximo;
          }
        }

        setCategorias(
          cats.map((cat: UserCategory) => {
            if (sugerenciasCiclo[cat.id]) {
              return { user_category_id: cat.id, nombre: cat.nombre, monto: String(sugerenciasCiclo[cat.id]), activa: true };
            }
            if (cat.tiene_monto_fijo && cat.monto_default && cat.monto_default > 0) {
              return { user_category_id: cat.id, nombre: cat.nombre, monto: String(cat.monto_default), activa: true };
            }
            return { user_category_id: cat.id, nombre: cat.nombre, monto: '', activa: false };
          })
        );
      } catch {
        setError('No se pudieron cargar las sugerencias de presupuesto.');
      } finally {
        setLoadingCats(false);
      }
    };
    cargar();
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

  // ── Paso Ahorro: sincronización bidireccional importe ↔ porcentaje ──
  // "Último campo tocado manda": el campo editado es la fuente, el otro se deriva.
  const redondear1 = (n: number) => Math.round(n * 10) / 10;

  const handleAhorroMontoChange = (value: string) => {
    setFuenteEdicion('monto');
    setAhorro(value);
    const monto = parseFloat(value);
    // Guard: ingreso 0 → % 0 (evita división por cero / NaN)
    const pct = importeReferencia > 0 && !isNaN(monto) ? redondear1((monto / importeReferencia) * 100) : 0;
    setAhorroPorcentaje(String(pct));
  };

  const handleAhorroPorcentajeChange = (value: string) => {
    setFuenteEdicion('porcentaje');
    setAhorroPorcentaje(value);
    const pct = parseFloat(value);
    // Importe redondeado a pesos
    const monto = !isNaN(pct) ? Math.round((importeReferencia * pct) / 100) : 0;
    setAhorro(String(monto));
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);
    try {
      if (cicloActivo) {
        await cerrarCiclo(cicloActivo.id);
      }
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

      // Persistir el % vigente como default (no bloqueante: no impide crear el ciclo)
      const pctAhorro = parseFloat(ahorroPorcentaje);
      if (!isNaN(pctAhorro)) {
        updateUserPreferences({ porcentaje_ahorro_default: pctAhorro }).catch((err) => {
          const e = err as { response?: { data?: { detail?: string } } };
          setError(e.response?.data?.detail ?? 'El ciclo se creó, pero no se pudo guardar tu preferencia de ahorro.');
        });
      }

      onComplete();
    } catch {
      setError('No se pudo crear el ciclo. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (cicloActivo === undefined) {
      return <p className="text-slate-400 text-sm text-center py-6">Verificando ciclo activo...</p>;
    }

    if (cicloActivo !== null) {
      return (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-4 space-y-2">
            <p className="text-amber-300 font-semibold text-sm">Tenés un ciclo activo</p>
            <p className="text-slate-300 text-sm">
              Tu ciclo actual vence el{' '}
              <span className="text-white font-medium">{formatFecha(cicloActivo.fecha_fin)}</span>.
              Para iniciar uno nuevo, primero hay que cerrarlo.
            </p>
            <p className="text-slate-400 text-xs">
              Los movimientos ya registrados y el historial quedan intactos.
            </p>
          </div>
          <p className="text-slate-400 text-sm text-center">¿Querés cerrar el ciclo actual y empezar uno nuevo?</p>
        </div>
      );
    }

    return (
      <>
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

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-slate-200 font-medium mb-1">¿Cuánto querés ahorrar este mes?</p>
              <p className="text-slate-400 text-sm">Este monto se reserva de inmediato y no cuenta como disponible. El % se sincroniza con el importe y se guarda como tu default.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 text-sm">Ahorro ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={ahorro}
                  onChange={e => handleAhorroMontoChange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 text-sm">Porcentaje (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={ahorroPorcentaje}
                  onChange={e => handleAhorroPorcentajeChange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {fuenteEdicion === 'monto'
                ? `Editaste el importe: ${redondear1(ahorroNum / (importeReferencia || 1) * 100)}% de tu ingreso`
                : `Editaste el porcentaje: ${formatARS(ahorroNum)} de tu ingreso`}
            </p>
            {ahorroNum < ahorroCalculado && ahorroCalculado > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
                Estás ahorrando menos del {porcentajeAhorro}% recomendado ({formatARS(ahorroCalculado)}). Podés continuar, pero tené en cuenta que lo recomendado es ahorrar al menos el {porcentajeAhorro}% de tus ingresos.
              </div>
            )}
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

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <p className="text-slate-200 font-medium mb-1">¿A qué categorías vas a destinar dinero?</p>
              <p className="text-slate-400 text-sm">Marcá las que tienen monto fijo este ciclo. Los gastos en esas categorías no afectarán tu Daily Cap.</p>
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

            <div className="bg-slate-800/60 rounded-xl px-4 py-3 space-y-1 text-sm">
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
      </>
    );
  };

  const renderFooter = () => {
    if (cicloActivo === undefined) return null;

    if (cicloActivo !== null) {
      return (
        <>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => setCicloActivo(null)}
            className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors"
          >
            Sí, cerrar y continuar
          </button>
        </>
      );
    }

    return (
      <>
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
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {loading ? 'Creando ciclo...' : '¡Activar ciclo!'}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-lg">Nuevo ciclo financiero</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition-colors">×</button>
          </div>
          {cicloActivo === null && (
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
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </div>
          )}
          {renderContent()}
        </div>

        <div className="px-6 pb-5 flex gap-3">
          {renderFooter()}
        </div>

      </div>
    </div>
  );
}
