import { useState, useEffect } from 'react';
import type { CicloGastoFijoItemCreate } from '../types';
import { getGastosFijos, createCiclo, confirmarGastosFijos } from '../services/api';

interface Props {
  movimientoOrigenId: number | null;
  importeReferencia: number;
  onComplete: () => void;
  onClose: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function getUltimoDiaMes(): string {
  const hoy = new Date();
  const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return ultimoDia.toISOString().split('T')[0];
}

interface GastoFijoWizard {
  gasto_fijo_id: number | null;
  descripcion: string;
  monto: string;
  confirmado: boolean;
  esAdhoc: boolean;
}

const STEPS = ['Duración', 'Ahorro', 'Gastos fijos'] as const;

export default function CicloWizard({ movimientoOrigenId, importeReferencia, onComplete, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [fechaFin, setFechaFin] = useState(getUltimoDiaMes());
  const [ahorro, setAhorro] = useState('0');
  const [gastosFijosWizard, setGastosFijosWizard] = useState<GastoFijoWizard[]>([]);
  const [loadingGF, setLoadingGF] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nuevoAdHoc, setNuevoAdHoc] = useState('');
  const [nuevoAdHocMonto, setNuevoAdHocMonto] = useState('');

  useEffect(() => {
    if (step === 2) {
      setLoadingGF(true);
      getGastosFijos()
        .then(gfs => {
          setGastosFijosWizard(
            gfs.filter(gf => gf.activo).map(gf => ({
              gasto_fijo_id: gf.id,
              descripcion: gf.descripcion,
              monto: String(gf.ultimo_importe ?? gf.max_importe ?? 0),
              confirmado: true,
              esAdhoc: false,
            }))
          );
        })
        .finally(() => setLoadingGF(false));
    }
  }, [step]);

  // Preview del daily cap en el paso 2
  const ahorroNum = parseFloat(ahorro) || 0;
  const diasRestantes = Math.max(1, Math.round((new Date(fechaFin).getTime() - Date.now()) / 86400000) + 1);
  const saldoPreview = importeReferencia - ahorroNum;
  const dailyCapPreview = saldoPreview > 0 ? saldoPreview / diasRestantes : 0;

  const handleNextStep1 = () => {
    setError('');
    const fechaFinDt = new Date(fechaFin + 'T23:59:59');
    if (fechaFinDt <= new Date()) {
      setError('La fecha de fin debe ser posterior a hoy');
      return;
    }
    setStep(1);
  };

  const handleNextStep2 = () => {
    setError('');
    const a = parseFloat(ahorro) || 0;
    if (a < 0) {
      setError('El ahorro no puede ser negativo');
      return;
    }
    setStep(2);
  };

  const handleAddAdHoc = () => {
    if (!nuevoAdHoc.trim() || !nuevoAdHocMonto) return;
    setGastosFijosWizard(prev => [
      ...prev,
      {
        gasto_fijo_id: null,
        descripcion: nuevoAdHoc.trim(),
        monto: nuevoAdHocMonto,
        confirmado: true,
        esAdhoc: true,
      },
    ]);
    setNuevoAdHoc('');
    setNuevoAdHocMonto('');
  };

  const handleFinish = async () => {
    setError('');
    setLoading(true);
    try {
      // 1. Crear el ciclo
      const cicloData = {
        movimiento_origen_id: movimientoOrigenId ?? undefined,
        fecha_fin: fechaFin + 'T23:59:59',
        ahorro_objetivo: parseFloat(ahorro) || 0,
      };
      const ciclo = await createCiclo(cicloData);

      // 2. Confirmar gastos fijos si hay alguno marcado
      const itemsConfirmados: CicloGastoFijoItemCreate[] = gastosFijosWizard
        .filter(gf => gf.confirmado)
        .map(gf => ({
          gasto_fijo_id: gf.gasto_fijo_id,
          monto_confirmado: parseFloat(gf.monto) || 0,
          confirmado: true,
          descripcion_override: gf.esAdhoc ? gf.descripcion : undefined,
        }));

      if (itemsConfirmados.length > 0) {
        await confirmarGastosFijos(ciclo.id, itemsConfirmados);
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
          {/* Step indicators */}
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
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-sm"
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
              {/* Preview */}
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
                  <span className="text-slate-200">Para gastar</span>
                  <span className="text-white">{formatARS(Math.max(0, saldoPreview))}</span>
                </div>
                <div className="flex justify-between text-blue-300 font-semibold">
                  <span>Daily Cap estimado ({diasRestantes} días)</span>
                  <span>{formatARS(dailyCapPreview)}/día</span>
                </div>
              </div>
            </div>
          )}

          {/* PASO 3: Gastos fijos */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <p className="text-slate-200 font-medium mb-1">Confirmá tus gastos fijos</p>
                <p className="text-slate-400 text-sm">Estos se reservan del saldo disponible. Podés editar el monto o desmarcar los que no apliquen este mes.</p>
              </div>

              {loadingGF && <p className="text-slate-400 text-sm text-center py-4">Cargando...</p>}

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {gastosFijosWizard.map((gf, idx) => (
                  <div key={idx} className={`flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2.5 border ${gf.confirmado ? 'border-blue-500/30' : 'border-slate-700/40 opacity-50'}`}>
                    <button
                      onClick={() => setGastosFijosWizard(prev => prev.map((g, i) => i === idx ? { ...g, confirmado: !g.confirmado } : g))}
                      className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${gf.confirmado ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}
                    >
                      {gf.confirmado && <span className="text-white text-xs font-bold">✓</span>}
                    </button>
                    <span className="flex-1 text-slate-200 text-sm truncate">{gf.descripcion}</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={gf.monto}
                      onChange={e => setGastosFijosWizard(prev => prev.map((g, i) => i === idx ? { ...g, monto: e.target.value } : g))}
                      className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
                {gastosFijosWizard.length === 0 && !loadingGF && (
                  <p className="text-slate-500 text-sm text-center py-2">Sin gastos fijos configurados</p>
                )}
              </div>

              {/* Agregar ad-hoc */}
              <div className="border-t border-slate-700/40 pt-3">
                <p className="text-slate-400 text-xs mb-2">Agregar gasto fijo para este ciclo</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Descripción"
                    value={nuevoAdHoc}
                    onChange={e => setNuevoAdHoc(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="$"
                    value={nuevoAdHocMonto}
                    onChange={e => setNuevoAdHocMonto(e.target.value)}
                    className="w-20 bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleAddAdHoc}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                  >
                    +
                  </button>
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
