// COMPONENTE: Matriz de presupuesto por categoría (opción B).
// Filas unificadas: categoría | sugerencia (default) | presupuestado (del ciclo
// activo, editable) | ejecutado + acciones (comprometer sin-presupuesto,
// actualizar sugerencia al sobre-gastar, renombrar, eliminar).
// Solo edita el ciclo ACTIVO; la sugerencia NUNCA se escribe automáticamente.
import { useState } from 'react';
import type { FilaMatrizPresupuesto } from '../utils/matrizPresupuesto';
import {
  actualizarMontoPresupuestoItem,
  crearItemPresupuesto,
  updateUserCategory,
} from '../services/api';

interface MatrizPresupuestoProps {
  filas: FilaMatrizPresupuesto[];
  /** id del ciclo activo; null → sin acciones de ciclo (solo sugerencia) */
  cicloActivoId: number | null;
  onSugerenciaChange: (fila: FilaMatrizPresupuesto, valor: string) => void;
  onSugerenciaGuardada: (fila: FilaMatrizPresupuesto, valor: string) => void;
  onRenombrar: (fila: FilaMatrizPresupuesto) => void;
  onEliminar: (fila: FilaMatrizPresupuesto) => void;
  /** Toggle monto fijo de la categoría (el padre guarda via updateUserCategory) */
  onToggleMontoFijo: (fila: FilaMatrizPresupuesto) => void;
  /** El padre re-carga ciclo activo y categorías tras cada mutación exitosa */
  onCambios: () => void;
  onError: (mensaje: string | null) => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const parseMonto = (valor: string): number | null => {
  const parsed = parseFloat(valor);
  return isNaN(parsed) || parsed < 0 ? null : parsed;
};

export default function MatrizPresupuesto({
  filas,
  cicloActivoId,
  onSugerenciaChange,
  onSugerenciaGuardada,
  onRenombrar,
  onEliminar,
  onToggleMontoFijo,
  onCambios,
  onError,
}: MatrizPresupuestoProps) {
  // ── Edición inline del monto presupuestado del ciclo ──────────────
  const [editandoClave, setEditandoClave] = useState<string | null>(null);
  const [editandoValor, setEditandoValor] = useState<string>('');
  const [guardandoPresupuestado, setGuardandoPresupuestado] = useState<boolean>(false);

  // ── Comprometer un gasto sin presupuesto (crea item del ciclo) ────
  const [comprometiendoClave, setComprometiendoClave] = useState<string | null>(null);
  const [compromisoValor, setCompromisoValor] = useState<string>('');
  const [comprometiendo, setComprometiendo] = useState<boolean>(false);

  // ── Confirmación en dos pasos para actualizar la sugerencia ───────
  const [sugerenciaPendienteClave, setSugerenciaPendienteClave] = useState<string | null>(null);
  const [actualizandoSugerencia, setActualizandoSugerencia] = useState<boolean>(false);

  if (filas.length === 0) return null;

  const iniciarEdicionPresupuestado = (fila: FilaMatrizPresupuesto) => {
    setEditandoClave(fila.clave);
    setEditandoValor(String(fila.presupuestado ?? ''));
  };

  const guardarPresupuestado = async (fila: FilaMatrizPresupuesto) => {
    const monto = parseMonto(editandoValor);
    if (monto === null || cicloActivoId === null) {
      setEditandoClave(null);
      return;
    }
    setGuardandoPresupuestado(true);
    try {
      // Las filas editables tienen un único item (si hay varios, la edición no se ofrece)
      await actualizarMontoPresupuestoItem(cicloActivoId, fila.itemIds[0], monto);
      setEditandoClave(null);
      onCambios();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      onError(e.response?.data?.detail ?? 'No se pudo actualizar el monto presupuestado.');
    } finally {
      setGuardandoPresupuestado(false);
    }
  };

  const iniciarComprometer = (fila: FilaMatrizPresupuesto) => {
    setComprometiendoClave(fila.clave);
    setCompromisoValor(String(fila.sinComprometer));
  };

  const confirmarComprometer = async (fila: FilaMatrizPresupuesto) => {
    const monto = parseMonto(compromisoValor);
    if (monto === null || cicloActivoId === null) return;
    setComprometiendo(true);
    try {
      await crearItemPresupuesto(cicloActivoId, {
        user_category_id: fila.userCategoryId,
        categoria_id: fila.categoriaId,
        monto_estimado: monto,
        confirmado: true,
        descripcion: fila.nombre,
      });
      setComprometiendoClave(null);
      onCambios();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      onError(e.response?.data?.detail ?? 'No se pudo comprometer el presupuesto.');
    } finally {
      setComprometiendo(false);
    }
  };

  const confirmarSugerencia = async (fila: FilaMatrizPresupuesto) => {
    if (fila.userCategoryId === null) return;
    setActualizandoSugerencia(true);
    try {
      await updateUserCategory(fila.userCategoryId, { monto_default: fila.ejecutado });
      setSugerenciaPendienteClave(null);
      onCambios();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      onError(e.response?.data?.detail ?? 'No se pudo actualizar la sugerencia.');
    } finally {
      setActualizandoSugerencia(false);
    }
  };

  const renderAcciones = (fila: FilaMatrizPresupuesto) => {
    if (fila.excede && fila.userCategoryId !== null) {
      const pendiente = sugerenciaPendienteClave === fila.clave;
      return (
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-mono text-red-400/80 bg-red-500/10 border border-red-500/20 px-1.5 py-px rounded">
            excedido
          </span>
          <button
            onClick={() => (pendiente ? confirmarSugerencia(fila) : setSugerenciaPendienteClave(fila.clave))}
            disabled={actualizandoSugerencia}
            className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            title={`Actualiza la sugerencia a lo ejecutado (${formatARS(fila.ejecutado)}) para próximos ciclos`}
          >
            {actualizandoSugerencia ? '...' : pendiente ? `Confirmar ${formatARS(fila.ejecutado)}` : 'Sugerir'}
          </button>
        </span>
      );
    }
    if (fila.presupuestado === null && fila.sinComprometer > 0 && cicloActivoId !== null) {
      if (comprometiendoClave === fila.clave) {
        return (
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <input
              type="number"
              min="0"
              value={compromisoValor}
              onChange={e => setCompromisoValor(e.target.value)}
              className="w-24 bg-slate-800 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none tabular-nums"
            />
            <button
              onClick={() => confirmarComprometer(fila)}
              disabled={comprometiendo}
              className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {comprometiendo ? '...' : 'Confirmar'}
            </button>
            <button
              onClick={() => setComprometiendoClave(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </span>
        );
      }
      return (
        <button
          onClick={() => iniciarComprometer(fila)}
          className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-blue-700"
        >
          Comprometer
        </button>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-4 space-y-3">
      {/* Encabezado de columnas (solo desktop) */}
      <div className="hidden md:flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-slate-500 px-3">
        <span className="flex-1 min-w-0">Categoría</span>
        <span className="w-24 text-right flex-shrink-0">Sugerencia</span>
        <span className="w-24 text-right flex-shrink-0">Presupuestado</span>
        <span className="w-24 text-right flex-shrink-0">Ejecutado</span>
        <span className="w-20 flex-shrink-0" aria-hidden="true"></span>
      </div>

      {filas.map(fila => {
        const puedeEditarPresupuestado =
          fila.itemIds.length === 1 && cicloActivoId !== null;
        return (
          <div
            key={fila.clave}
            className={`flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-3 bg-slate-800/60 rounded-xl px-3 py-2.5 border transition-colors ${
              fila.tieneMontoFijo ? 'border-blue-500/30' : 'border-slate-700/40'
            }`}
          >
            <button
              onClick={() => onToggleMontoFijo(fila)}
              className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                fila.tieneMontoFijo ? 'bg-blue-600 border-blue-600' : 'border-slate-500'
              }`}
              title={fila.tieneMontoFijo ? 'Desactivar monto fijo' : 'Activar monto fijo'}
              aria-label={`Monto fijo de ${fila.nombre}`}
            >
              {fila.tieneMontoFijo && <span className="text-white text-xs font-bold">✓</span>}
            </button>

            <span
              role="button"
              tabIndex={0}
              onClick={() => onRenombrar(fila)}
              onKeyDown={e => { if (e.key === 'Enter') onRenombrar(fila); }}
              className="flex-1 min-w-0 text-sm truncate cursor-pointer hover:text-white transition-colors text-slate-300"
              title="Renombrar"
            >
              {fila.nombre}
            </span>

            {/* Sugerencia = monto_default de la categoría (auto-save al blur) */}
            <input
              type="number"
              min="0"
              step="100"
              value={fila.sugerencia === null ? '' : fila.sugerencia}
              onChange={e => onSugerenciaChange(fila, e.target.value)}
              onBlur={e => onSugerenciaGuardada(fila, e.target.value)}
              placeholder="$0"
              disabled={!fila.tieneMontoFijo}
              className={`w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-blue-500 transition-opacity flex-shrink-0 ${
                fila.tieneMontoFijo ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
              }`}
            />

            {/* Presupuestado (del ciclo activo, editable si 1 item) */}
            {editandoClave === fila.clave ? (
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  type="number"
                  min="0"
                  value={editandoValor}
                  onChange={e => setEditandoValor(e.target.value)}
                  className="w-20 bg-slate-800 border border-blue-500/50 rounded-lg px-2 py-1 text-sm text-white focus:outline-none tabular-nums"
                />
                <button
                  onClick={() => guardarPresupuestado(fila)}
                  disabled={guardandoPresupuestado}
                  className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {guardandoPresupuestado ? '...' : 'OK'}
                </button>
                <button
                  onClick={() => setEditandoClave(null)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              </span>
            ) : (
              <button
                onClick={() => puedeEditarPresupuestado && iniciarEdicionPresupuestado(fila)}
                disabled={!puedeEditarPresupuestado}
                className={`w-24 text-right text-sm tabular-nums flex-shrink-0 px-1 rounded-lg ${
                  puedeEditarPresupuestado ? 'hover:text-white cursor-pointer text-slate-200' : 'text-slate-400'
                }`}
                title={puedeEditarPresupuestado ? 'Editar presupuesto del ciclo' : fila.itemIds.length > 1 ? 'Varios items: editá en el ciclo actual' : 'Sin presupuesto en el ciclo'}
              >
                {fila.presupuestado === null ? '—' : formatARS(fila.presupuestado)}
              </button>
            )}

            {/* Ejecutado: gasto vinculado del ciclo; sin item muestra sin comprometer */}
            <span className="w-24 text-right text-sm tabular-nums flex-shrink-0">
              {fila.ejecutado > 0 ? (
                <span className="text-slate-300">{formatARS(fila.ejecutado)}</span>
              ) : fila.sinComprometer > 0 ? (
                <span className="text-xs font-mono text-slate-500">{formatARS(fila.sinComprometer)}</span>
              ) : (
                <span className="text-slate-600">—</span>
              )}
            </span>

            <span className="flex items-center gap-2 flex-shrink-0 w-20 justify-end">
              {renderAcciones(fila)}
              {fila.itemIds.length > 1 && (
                <span
                  className="text-xs font-mono text-slate-500"
                  title={`${fila.itemIds.length} items de presupuesto para esta categoría`}
                >
                  x{fila.itemIds.length}
                </span>
              )}
            </span>

            <button
              onClick={() => onEliminar(fila)}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-2 py-1 rounded text-xs font-medium transition-all flex-shrink-0"
              title="Eliminar"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
