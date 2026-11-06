// COMPONENTE: editar ciclo — solo fechas y objetivo de ahorro.
// El presupuesto del ciclo se edita desde la matriz de la Plantilla
// (PresupuestoManager → MatrizPresupuesto), no acá.
import { useState } from 'react';
import type { Ciclo, CicloCreate } from '../types';
import { updateCiclo } from '../services/api';
import { isDateAtOrAfterTodayBA } from '../utils/buenosAiresDate';

interface EditCicloModalProps {
  ciclo: Ciclo;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditCicloModal({ ciclo, onClose, onSaved }: EditCicloModalProps) {
  const [fechaInicio, setFechaInicio] = useState<string>(ciclo.fecha_inicio.split('T')[0]);
  const [fechaFin, setFechaFin] = useState<string>(ciclo.fecha_fin.split('T')[0]);
  const [ahorro, setAhorro] = useState<string>(String(ciclo.ahorro_objetivo));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleSave = async () => {
    setError('');
    if (!isDateAtOrAfterTodayBA(fechaFin)) {
      setError('La fecha de fin debe ser posterior a hoy');
      return;
    }
    setLoading(true);
    try {
      await updateCiclo(ciclo.id, { fecha_inicio: `${fechaInicio}T00:00:00`, fecha_fin: `${fechaFin}T23:59:59`, ahorro_objetivo: parseFloat(ahorro) || 0 } as Partial<CicloCreate>);
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
      <div className="bg-slate-800/90 backdrop-blur-sm border border-slate-600/50 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Editar ciclo</h3>
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="space-y-1">
          <label className="text-slate-300 text-sm">Fecha de inicio del ciclo</label>
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full bg-slate-700 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>

        <div className="space-y-1">
          <label className="text-slate-300 text-sm">Fecha de fin del ciclo</label>
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
            className="w-full bg-slate-700 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>

        <div className="space-y-1">
          <label className="text-slate-300 text-sm">Objetivo de ahorro ($)</label>
          <input type="number" min="0" step="100" value={ahorro} onChange={(e) => setAhorro(e.target.value)}
            className="w-full bg-slate-700 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
        </div>

        <p className="text-slate-500 text-xs">
          El presupuesto del ciclo se edita desde la matriz de la pestaña Ciclo → Plantilla.
        </p>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={loading}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
