import { useState, useEffect, useCallback } from 'react';
import type { Inversion } from '../types';
import { getInversiones, deleteInversion } from '../services/api';
import InversionCard from './InversionCard';
import InversionModal from './InversionModal';
import InversionDetail from './InversionDetail';

interface InversionesDashboardProps {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function InversionesDashboard({ refreshKey }: InversionesDashboardProps) {
  const [inversiones, setInversiones] = useState<Inversion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedInversionId, setSelectedInversionId] = useState<number | null>(null);
  const [editInversion, setEditInversion] = useState<Inversion | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInversiones();
      setInversiones(data);
    } catch {
      setError('No se pudieron cargar las inversiones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [refreshKey, cargar]);

  const handleCreated = () => {
    setShowCreateModal(false);
    cargar();
  };

  const handleUpdated = () => {
    setEditInversion(null);
    cargar();
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteInversion(id);
      cargar();
    } catch {
      setError('No se pudo eliminar la inversión.');
    }
  };

  const totalInvertido = inversiones.reduce((sum, inv) => sum + (inv.monto_invertido ?? 0), 0);
  const totalActual = inversiones.reduce((sum, inv) => sum + (inv.valor_actual ?? 0), 0);
  const gananciaTotal = totalActual - totalInvertido;
  const rendimientoTotal = totalInvertido > 0 ? ((gananciaTotal / totalInvertido) * 100) : 0;

  if (selectedInversionId) {
    return (
      <InversionDetail
        inversionId={selectedInversionId}
        onBack={() => setSelectedInversionId(null)}
        onUpdated={cargar}
        onEdit={() => {
          const inv = inversiones.find(i => i.id === selectedInversionId);
          if (inv) setEditInversion(inv);
          setSelectedInversionId(null);
        }}
      />
    );
  }

  return (
    <div>
      {/* Resumen global */}
      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 mb-4">
        <h2 className="text-lg font-bold text-white mb-3">Inversiones</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Invertido</p>
            <p className="text-white text-xl font-bold">{formatARS(totalInvertido)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Valor Actual</p>
            <p className="text-white text-xl font-bold">{formatARS(totalActual)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Ganancia/Pérdida</p>
            <p className={`text-xl font-bold ${gananciaTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {gananciaTotal >= 0 ? '+' : ''}{formatARS(gananciaTotal)}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wide">Rendimiento</p>
            <p className={`text-xl font-bold ${rendimientoTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {rendimientoTotal >= 0 ? '+' : ''}{rendimientoTotal.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 text-slate-400">Cargando inversiones...</div>
      )}

      {/* Lista de inversiones */}
      {!loading && !error && inversiones.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-lg font-medium mb-1">Sin inversiones todavía</p>
          <p className="text-sm">Agregá tu primer FCI o inversión para empezar a trackear.</p>
        </div>
      )}

      <div className="space-y-3">
        {inversiones.map((inv) => (
          <InversionCard
            key={inv.id}
            inversion={inv}
            onClick={() => setSelectedInversionId(inv.id)}
            onEdit={() => setEditInversion(inv)}
            onDelete={() => handleDelete(inv.id)}
          />
        ))}
      </div>

      {/* Botón crear */}
      {!loading && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-8 py-3 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200 active:scale-95"
          >
            <span className="text-lg leading-none font-light">+</span>
            Nueva inversión
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <InversionModal
          onClose={() => setShowCreateModal(false)}
          onSaved={handleCreated}
        />
      )}

      {/* Edit Modal */}
      {editInversion && (
        <InversionModal
          inversion={editInversion}
          onClose={() => setEditInversion(null)}
          onSaved={handleUpdated}
        />
      )}
    </div>
  );
}
