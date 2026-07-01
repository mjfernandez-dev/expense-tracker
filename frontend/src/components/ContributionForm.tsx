import { useState, useEffect } from 'react';
import { addContribution } from '../services/api';

interface ContributionFormProps {
  investmentId: number;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ContributionForm({ investmentId, isOpen, onClose, onSaved }: ContributionFormProps) {
  const today = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState<string>(today);
  const [montoArs, setMontoArs] = useState<string>('');
  const [cotizacionUsd, setCotizacionUsd] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setFecha(today);
      setMontoArs('');
      setCotizacionUsd('');
      setError(null);
    }
  }, [isOpen]);

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = parseFloat(montoArs);
    if (!monto || monto <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: { fecha: string; monto_ars: number; cotizacion_usd?: number } = {
        fecha: fecha + 'T00:00:00',
        monto_ars: monto,
      };
      const cotizacion = parseFloat(cotizacionUsd);
      if (!isNaN(cotizacion) && cotizacion > 0) {
        payload.cotizacion_usd = cotizacion;
      }
      await addContribution(investmentId, payload);
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg p-1.5 transition-colors leading-none"
          aria-label="Cerrar"
        >
          ✕
        </button>

        <h3 className="text-lg font-semibold text-white mb-4">Agregar aporte</h3>

        {error && (
          <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Monto en ARS *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={montoArs}
              onChange={(e) => setMontoArs(e.target.value)}
              placeholder="1000"
              autoFocus
              className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Cotización USD <span className="text-slate-500">(opcional)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={cotizacionUsd}
              onChange={(e) => setCotizacionUsd(e.target.value)}
              placeholder="Ej: 1200"
              className="w-full bg-slate-800/50 border border-slate-600/50 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !montoArs || parseFloat(montoArs) <= 0}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-2.5 rounded-lg transition-all text-sm"
            >
              {loading ? 'Guardando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ContributionForm;
