// COMPONENTE: Gestión de gastos fijos recurrentes
import { useState, useEffect } from 'react';
import type { GastoFijo } from '../types';
import { getGastosFijos, toggleGastoFijo, deleteGastoFijo } from '../services/api';

function GastoFijoManager() {
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchGastosFijos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getGastosFijos();
      setGastosFijos(data);
    } catch (err) {
      setError('Error al cargar gastos fijos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGastosFijos();
  }, []);

  const handleToggle = async (gf: GastoFijo) => {
    setToggleLoading(gf.id);
    try {
      await toggleGastoFijo(gf.id, !gf.activo);
      await fetchGastosFijos();
    } catch (err) {
      console.error(err);
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDeleteRequest = (id: number) => {
    setDeleteTarget(id);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteGastoFijo(deleteTarget);
      await fetchGastosFijos();
      setDeleteTarget(null);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      setDeleteError(error.response?.data?.detail || 'Error al eliminar el gasto fijo');
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const getNombreCategoria = (gf: GastoFijo): string => {
    if (gf.user_category) return gf.user_category.nombre;
    if (gf.categoria) return gf.categoria.nombre;
    return '-';
  };

  const formatImporte = (importe: number | null): string => {
    if (importe === null) return '-';
    return `$${importe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="text-center py-6 text-slate-300">Cargando gastos fijos...</div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Gastos Fijos</h2>
        <span className="text-xs text-slate-400">
          Se generan automáticamente el 1° de cada mes
        </span>
      </div>

      {gastosFijos.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <p className="text-base mb-1">No hay gastos fijos configurados.</p>
          <p className="text-sm">Al registrar un movimiento, marcalo como <span className="text-blue-400">gasto fijo</span> para que aparezca acá.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700/70">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Descripción</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Categoría</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300 uppercase tracking-wider">Máx. histórico</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300 uppercase tracking-wider">Último mes</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Meses</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {gastosFijos.map((gf) => (
                <tr key={gf.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-100">
                    {gf.descripcion}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {getNombreCategoria(gf)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-slate-100">
                    {formatImporte(gf.max_importe)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-slate-300">
                    {formatImporte(gf.ultimo_importe)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-slate-400">
                    {gf.total_meses}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {gf.activo ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-400/30">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-600/30">
                        Pausado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleToggle(gf)}
                        disabled={toggleLoading === gf.id}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all border disabled:opacity-50 ${
                          gf.activo
                            ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-400/30'
                            : 'bg-green-500/20 hover:bg-green-500/30 text-green-300 border-green-400/30'
                        }`}
                      >
                        {toggleLoading === gf.id ? '...' : (gf.activo ? 'Pausar' : 'Activar')}
                      </button>
                      <button
                        onClick={() => handleDeleteRequest(gf.id)}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteTarget(null)} />
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar gasto fijo</h3>
            <p className="text-sm text-slate-300 mb-2">
              ¿Eliminar este gasto fijo? Los movimientos ya registrados quedan intactos.
            </p>
            <p className="text-xs text-slate-400 mb-6">
              El mes siguiente ya no se generará automáticamente.
            </p>
            {deleteError && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-medium py-2.5 rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-300/50 transition-all text-sm"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GastoFijoManager;
