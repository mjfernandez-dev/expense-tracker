import { useState } from 'react';
import type { Inversion, InversionCreate, InversionUpdate } from '../types';
import { createInversion, updateInversion } from '../services/api';

interface InversionModalProps {
  inversion?: Inversion; // if provided, we're editing
  onClose: () => void;
  onSaved: () => void;
}

export default function InversionModal({ inversion, onClose, onSaved }: InversionModalProps) {
  const isEdit = !!inversion;
  const [nombre, setNombre] = useState<string>(inversion?.nombre ?? '');
  const [ticker, setTicker] = useState<string>(inversion?.ticker ?? '');
  const [cuotapartes, setCuotapartes] = useState<string>(inversion?.cuotapartes?.toString() ?? '');
  const [montoInvertido, setMontoInvertido] = useState<string>(inversion?.monto_invertido?.toString() ?? '');
  const [fechaInversion, setFechaInversion] = useState<string>(
    inversion?.fecha_inversion ? inversion.fecha_inversion.split('T')[0] : ''
  );
  const [notas, setNotas] = useState<string>(inversion?.notas ?? '');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: InversionCreate | InversionUpdate = {
        nombre: nombre.trim(),
        ticker: ticker.trim() || null,
        cuotapartes: cuotapartes ? parseFloat(cuotapartes) : null,
        monto_invertido: montoInvertido ? parseFloat(montoInvertido) : null,
        fecha_inversion: fechaInversion ? new Date(fechaInversion).toISOString() : null,
        notas: notas.trim() || null,
      };

      if (isEdit) {
        await updateInversion(inversion!.id, payload as InversionUpdate);
      } else {
        await createInversion(payload as InversionCreate);
      }
      onSaved();
    } catch {
      setError(isEdit ? 'No se pudo actualizar la inversión.' : 'No se pudo crear la inversión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800/95 backdrop-blur-2xl border border-slate-700/70 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">
              {isEdit ? 'Editar inversión' : 'Nueva inversión'}
            </h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">&times;</button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1">Nombre *</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                placeholder="SBS Renta Pesos"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5">
                Ticker (opcional)
                <span className="group relative">
                  <svg className="w-3.5 h-3.5 text-slate-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
                  </svg>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-slate-700 text-xs text-slate-200 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Es el código que identifica al fondo de inversión. Lo encontrás en el resumen que te da tu banco o app de inversiones.
                    <br /><br />
                    Ejemplos: <span className="font-mono">SBSRPEA</span> (Renta Plus), <span className="font-mono">SBSRF</span> (Renta Fija)
                    <br /><br />
                    Si no sabés cuál es, dejamelo vacío y lo completás después.
                  </span>
                </span>
              </label>
              <input
                type="text"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 font-mono uppercase"
                placeholder="SBSRPEA"
              />
              <p className="text-slate-500 text-xs mt-1">
                {ticker
                  ? '💡 Marcá "Actualizar precio" para traer el valor de la cuota automáticamente.'
                  : '💡 Sin ticker no podrás actualizar el precio automáticamente. Podés editarlo después.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5">
                  Cuotapartes
                  <span className="group relative">
                    <svg className="w-3.5 h-3.5 text-slate-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
                    </svg>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-slate-700 text-xs text-slate-200 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      Si no sabés cuántas tenés, dejamelo vacío. Cuando apretés "Actualizar precio" lo calculamos solos dividiendo tu monto invertido por el valor de la cuota.
                    </span>
                  </span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={cuotapartes}
                  onChange={e => setCuotapartes(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  placeholder="Auto"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1">Monto invertido ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={montoInvertido}
                  onChange={e => setMontoInvertido(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
                  placeholder="10000"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1">Fecha de inversión</label>
              <input
                type="date"
                value={fechaInversion}
                onChange={e => setFechaInversion(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1">Notas</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={3}
                className="w-full bg-slate-700/50 border border-slate-600/70 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none"
                placeholder="Notas opcionales..."
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
                {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear inversión'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
