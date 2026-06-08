import { useState } from 'react';
import { addHistorialPrecio } from '../services/api';

interface HistorialFormProps {
  inversionId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function HistorialForm({ inversionId, onClose, onSaved }: HistorialFormProps) {
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [valorCuota, setValorCuota] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valorCuota || parseFloat(valorCuota) <= 0) {
      setError('El valor cuota debe ser un número positivo.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await addHistorialPrecio(inversionId, {
        fecha: new Date(fecha).toISOString(),
        valor_cuota: parseFloat(valorCuota),
      });
      onSaved();
    } catch {
      setError('No se pudo guardar el precio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800/95 backdrop-blur-2xl border border-slate-700/70 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">Agregar precio</h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">&times;</button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1">Valor cuota ($)</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={valorCuota}
                onChange={e => setValorCuota(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                placeholder="105.50"
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-slate-600/70 text-slate-300 hover:bg-slate-700/50 rounded-lg py-2 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg py-2 text-sm font-medium transition-all disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
