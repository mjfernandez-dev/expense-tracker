import { useState } from 'react';
import type { Ciclo } from '../types';
import {
  calcularMontoAhorro,
  calcularPorcentajeAhorro,
  guardarAhorroCiclo,
} from '../services/ahorroCiclo';

interface AhorroModalProps {
  ciclo: Ciclo;
  onClose: () => void;
  onSaved: (cicloActualizado: Ciclo) => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const redondear1 = (n: number) => Math.round(n * 10) / 10;

export default function AhorroModal({ ciclo, onClose, onSaved }: AhorroModalProps) {
  const importeReferencia = ciclo.resumen?.total_ingresos ?? 0;
  const [ahorro, setAhorro] = useState<string>(String(ciclo.ahorro_objetivo));
  const [ahorroPorcentaje, setAhorroPorcentaje] = useState<string>(
    String(importeReferencia > 0 ? redondear1((ciclo.ahorro_objetivo / importeReferencia) * 100) : 0)
  );
  const [fuenteEdicion, setFuenteEdicion] = useState<'monto' | 'porcentaje'>('monto');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const ahorroNum = parseFloat(ahorro) || 0;

  // ── Sincronización bidireccional importe ↔ porcentaje ──
  // "Último campo tocado manda": el campo editado es la fuente, el otro se deriva.
  const handleAhorroMontoChange = (value: string) => {
    setFuenteEdicion('monto');
    setAhorro(value);
    const monto = parseFloat(value);
    // Guard: ingreso 0 → % 0 (evita división por cero / NaN); tope 100 para la referencia visual.
    const pct = calcularPorcentajeAhorro(monto, importeReferencia);
    setAhorroPorcentaje(String(pct));
  };

  const handleAhorroPorcentajeChange = (value: string) => {
    setFuenteEdicion('porcentaje');
    setAhorroPorcentaje(value);
    const pct = parseFloat(value);
    // Importe redondeado a pesos
    const monto = calcularMontoAhorro(pct, importeReferencia);
    setAhorro(String(monto));
  };

  const handleSave = async () => {
    setError('');
    if (ahorroNum < 0) {
      setError('El ahorro no puede ser negativo');
      return;
    }
    setLoading(true);
    try {
      const updated = await guardarAhorroCiclo(ciclo.id, ahorroNum);
      onSaved(updated);
      onClose();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'No se pudo guardar el ahorro. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Editar ahorro del ciclo</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-200 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-slate-400 text-sm">
          Este monto se reserva en el ciclo actual y no cuenta como disponible. El porcentaje solo te ayuda a calcularlo.
        </p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-slate-300 text-sm">Ahorro ($)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={ahorro}
              onChange={(e) => handleAhorroMontoChange(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
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
              onChange={(e) => handleAhorroPorcentajeChange(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="0"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {fuenteEdicion === 'monto'
            ? `Editaste el importe: ${redondear1(ahorroNum / (importeReferencia || 1) * 100)}% de tu ingreso`
            : `Editaste el porcentaje: ${formatARS(ahorroNum)} de tu ingreso`}
        </p>
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between text-slate-300">
            <span>Ingresos</span>
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
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
