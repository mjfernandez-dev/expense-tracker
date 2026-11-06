// COMPONENTE: Gestión de presupuesto base (plantilla) + categorías personalizadas
// Reemplaza CategoryManager agregando monto_default, tiene_monto_fijo y ahorro_objetivo_default
import { useState, useEffect, useCallback, useRef, useMemo, type FormEvent } from 'react';
import type { UserCategory, Ciclo } from '../types';
import type { MovimientoAfectado } from '../services/api';
import {
  getCicloActivo,
  getUserCategories,
  createCategory,
  updateCategory,
  updateUserCategory,
  deleteCategory,
  getMovimientosAfectados,
  reasignarYEliminarCategoria,
  updateUserPreferences,
} from '../services/api';
import MatrizPresupuesto from './MatrizPresupuesto';
import { armarMatrizPresupuesto, type FilaMatrizPresupuesto } from '../utils/matrizPresupuesto';
import { useAuth } from '../context/useAuth';
import SaveIndicator from './SaveIndicator';
import type { SaveState } from './SaveIndicator';

interface CategoryRow extends UserCategory {
  saveState: SaveState;
}

interface PresupuestoManagerProps {
  refreshKey: number;
}

function PresupuestoManager({ refreshKey }: PresupuestoManagerProps) {
  const { user, setUser } = useAuth();

  // ── Porcentaje de ahorro objetivo ─────────────────────────────────
  const [porcentajeInput, setPorcentajeInput] = useState<string>(
    user?.porcentaje_ahorro_default != null ? String(user.porcentaje_ahorro_default) : '10'
  );
  const [ahorroSaveState, setAhorroSaveState] = useState<SaveState>('idle');
  const ahorroDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Categorías ────────────────────────────────────────────────────
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [cicloActivo, setCicloActivo] = useState<Ciclo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario nueva/editar categoría
  const [nombre, setNombre] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Errores inline de auto-save ───────────────────────────────────
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);

  // ── Confirmación eliminación ──────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [movimientosAfectados, setMovimientosAfectados] = useState<MovimientoAfectado[]>([]);
  const [loadingAfectados, setLoadingAfectados] = useState<boolean>(false);
  const [nuevaCategoriaId, setNuevaCategoriaId] = useState<number | null>(null);

  // ── Fetch categorías ──────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUserCategories();
      setCategories(data.map(cat => ({ ...cat, saveState: 'idle' as SaveState })));
    } catch {
      setError('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories, refreshKey]);

  // ── Ciclo activo: fuente de presupuestado/ejecutado de la matriz ──
  const fetchCicloActivo = useCallback(async () => {
    try {
      setCicloActivo(await getCicloActivo());
    } catch {
      // Sin ciclo activo la matriz solo muestra categorías; no es error bloqueante
      setCicloActivo(null);
    }
  }, []);

  // Re-carga ciclo activo + categorías tras cada mutación saliente de la matriz
  const recargarDatos = useCallback(async () => {
    await Promise.all([fetchCicloActivo(), fetchCategories()]);
  }, [fetchCicloActivo, fetchCategories]);

  useEffect(() => {
    fetchCicloActivo();
  }, [fetchCicloActivo]);

  // ── Filas unificadas de la matriz (memo: solo ciclo confirmados) ──
  const filasMatriz = useMemo(() => {
    const resumen = cicloActivo?.resumen;
    if (!resumen) return [];
    return armarMatrizPresupuesto(
      resumen.presupuesto_items.filter(item => item.confirmado),
      resumen.gastos_sin_presupuesto,
      categories,
    );
  }, [cicloActivo, categories]);

  // ── Ahorro: auto-save con debounce 600ms ──────────────────────────
  const handlePorcentajeChange = (value: string) => {
    setPorcentajeInput(value);
    setAhorroSaveState('idle');
    if (ahorroDebounceRef.current) clearTimeout(ahorroDebounceRef.current);
    ahorroDebounceRef.current = setTimeout(() => {
      savePorcentaje(value);
    }, 600);
  };

  const savePorcentaje = async (value: string) => {
    const parsed = parseFloat(value);
    const pct = isNaN(parsed) || parsed < 0 ? 0 : parsed > 100 ? 100 : parsed;
    setAhorroSaveState('saving');
    try {
      const updatedUser = await updateUserPreferences({ porcentaje_ahorro_default: pct });
      setUser(updatedUser);
      setAhorroSaveState('saved');
      setTimeout(() => setAhorroSaveState('idle'), 1500);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setAutoSaveError(e.response?.data?.detail ?? 'Error al guardar el porcentaje de ahorro');
      setAhorroSaveState('error');
    } finally {
      setAhorroSaveState(s => s === 'saving' ? 'idle' : s);
    }
  };

  // ── Categorías: toggle tiene_monto_fijo (on change) ──────────────
  const handleToggleMontoFijo = async (id: number, current: boolean) => {
    setCategories(prev =>
      prev.map(c => c.id === id ? { ...c, tiene_monto_fijo: !current, saveState: 'saving' } : c)
    );
    try {
      const updated = await updateUserCategory(id, { tiene_monto_fijo: !current });
      setCategories(prev =>
        prev.map(c => c.id === id ? { ...updated, saveState: 'saved' } : c)
      );
      setTimeout(() => {
        setCategories(prev =>
          prev.map(c => c.id === id ? { ...c, saveState: 'idle' } : c)
        );
      }, 1500);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setAutoSaveError(e.response?.data?.detail ?? 'Error al guardar el monto fijo');
      setCategories(prev =>
        prev.map(c => c.id === id ? { ...c, tiene_monto_fijo: current, saveState: 'error' } : c)
      );
    } finally {
      setCategories(prev =>
        prev.map(c => c.id === id && c.saveState === 'saving' ? { ...c, saveState: 'idle' } : c)
      );
    }
  };

  // ── Categorías: auto-save monto_default on blur ───────────────────
  const handleMontoBlur = async (id: number, value: string) => {
    const parsed = parseFloat(value);
    const monto = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setCategories(prev =>
      prev.map(c => c.id === id ? { ...c, monto_default: monto, saveState: 'saving' } : c)
    );
    try {
      const updated = await updateUserCategory(id, { monto_default: monto });
      setCategories(prev =>
        prev.map(c => c.id === id ? { ...updated, saveState: 'saved' } : c)
      );
      setTimeout(() => {
        setCategories(prev =>
          prev.map(c => c.id === id ? { ...c, saveState: 'idle' } : c)
        );
      }, 1500);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setAutoSaveError(e.response?.data?.detail ?? 'Error al guardar el monto');
      setCategories(prev =>
        prev.map(c => c.id === id ? { ...c, saveState: 'error' } : c)
      );
    } finally {
      setCategories(prev =>
        prev.map(c => c.id === id && c.saveState === 'saving' ? { ...c, saveState: 'idle' } : c)
      );
    }
  };

  // Input local para monto (sin esperar blur para mostrar)
  const handleMontoChange = (id: number, value: string) => {
    setCategories(prev =>
      prev.map(c => c.id === id ? { ...c, monto_default: value === '' ? null : parseFloat(value), saveState: 'idle' } : c)
    );
  };

  // ── Formulario crear/renombrar categoría ─────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }
    try {
      setFormLoading(true);
      setFormError(null);
      if (editingId) {
        await updateCategory(editingId, nombre);
      } else {
        await createCategory(nombre);
      }
      setNombre('');
      setEditingId(null);
      await fetchCategories();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setFormError(e.response?.data?.detail || 'Error al guardar la categoría');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (cat: UserCategory) => {
    setNombre(cat.nombre);
    setEditingId(cat.id);
    setFormError(null);
  };

  const handleCancelEdit = () => {
    setNombre('');
    setEditingId(null);
    setFormError(null);
  };

  // ── Matriz: adaptadores fila → handlers existentes ───────────────
  // Las filas de categoría del sistema (userCategoryId null) solo se
  // muestran; renombrar/eliminar/sugerencia no les aplican.
  const handleMatrizSugerenciaChange = (fila: FilaMatrizPresupuesto, valor: string) => {
    if (fila.userCategoryId !== null) handleMontoChange(fila.userCategoryId, valor);
  };

  const handleMatrizSugerenciaGuardada = (fila: FilaMatrizPresupuesto, valor: string) => {
    if (fila.userCategoryId !== null) handleMontoBlur(fila.userCategoryId, valor);
  };

  const handleMatrizToggleMontoFijo = (fila: FilaMatrizPresupuesto) => {
    if (fila.userCategoryId !== null) handleToggleMontoFijo(fila.userCategoryId, !!fila.tieneMontoFijo);
  };

  const handleMatrizRenombrar = (fila: FilaMatrizPresupuesto) => {
    const cat = categories.find(c => c.id === fila.userCategoryId);
    if (cat) handleEdit(cat);
  };

  const handleMatrizEliminar = (fila: FilaMatrizPresupuesto) => {
    if (fila.userCategoryId !== null) openDeleteModal(fila.userCategoryId);
  };

  // ── Eliminación ───────────────────────────────────────────────────
  const openDeleteModal = async (id: number) => {
    setDeleteTarget(id);
    setDeleteError(null);
    setNuevaCategoriaId(null);
    setMovimientosAfectados([]);
    setLoadingAfectados(true);
    try {
      const afectados = await getMovimientosAfectados(id);
      setMovimientosAfectados(afectados);
    } catch {
      setDeleteError('No se pudieron cargar los movimientos afectados.');
    } finally {
      setLoadingAfectados(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (movimientosAfectados.length > 0) {
        if (!nuevaCategoriaId) {
          setDeleteError('Seleccioná una categoría destino para los movimientos.');
          return;
        }
        await reasignarYEliminarCategoria(deleteTarget, nuevaCategoriaId);
      } else {
        await deleteCategory(deleteTarget);
      }
      await fetchCategories();
      setDeleteTarget(null);
      setMovimientosAfectados([]);
      setNuevaCategoriaId(null);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setDeleteError(e.response?.data?.detail || 'Error al eliminar la categoría');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  if (loading) {
    return <div className="text-center py-6 text-slate-300">Cargando...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Presupuesto</h2>
        <p className="text-slate-400 text-sm">
          La matriz une tus categorías con el ciclo activo: la sugerencia pre-carga próximos ciclos, el presupuestado es propio de este ciclo y nunca se escribe automáticamente.
        </p>
      </div>

      {autoSaveError && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{autoSaveError}</span>
          <button onClick={() => setAutoSaveError(null)} className="text-red-300 hover:text-red-100 ml-4">✕</button>
        </div>
      )}

      {/* ── Matriz de presupuesto (ciclo activo) ───────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Matriz de presupuesto</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Toca el nombre para renombrar · Presupuestado es editable con un solo ítem · Al sobre-gastar podés actualizar la sugerencia en dos pasos.
          </p>
        </div>
        {categories.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm bg-slate-900/60 border border-slate-700/40 rounded-2xl">
            Todavía no creaste categorías. Escribí un nombre abajo y dale Crear.
          </div>
        ) : (
          <MatrizPresupuesto
            filas={filasMatriz}
            cicloActivoId={cicloActivo?.id ?? null}
            onSugerenciaChange={handleMatrizSugerenciaChange}
            onSugerenciaGuardada={handleMatrizSugerenciaGuardada}
            onRenombrar={handleMatrizRenombrar}
            onEliminar={handleMatrizEliminar}
            onToggleMontoFijo={handleMatrizToggleMontoFijo}
            onCambios={recargarDatos}
            onError={setAutoSaveError}
          />
        )}
      </section>

      {/* ── Desktop: 2 columnas / Mobile: 1 columna ─────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        {/* Columna izquierda: Categorías */}
        <div className="space-y-3">
          {/* Nueva categoría — inline arriba de todo */}
          <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-semibold text-sm">Nueva categoría</h3>
            {formError && !editingId && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg text-sm">
                {formError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Nombre (ej: Alimentación)"
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-400 text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={formLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors flex-shrink-0"
              >
                {formLoading ? '...' : 'Crear'}
              </button>
            </form>
          </div>
        </div>

        {/* Columna derecha: Ahorro + Nueva categoría */}
        <div className="space-y-4">

          {/* Porcentaje de ahorro por defecto */}
          <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-sm">Ahorro por defecto para futuros ciclos</h3>
                <p className="text-slate-400 text-xs mt-0.5">Se aplica al iniciar un ciclo nuevo y no modifica el ciclo actual</p>
              </div>
              <SaveIndicator state={ahorroSaveState} />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={porcentajeInput}
                onChange={e => handlePorcentajeChange(e.target.value)}
                className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 text-right"
                placeholder="10"
              />
              <span className="text-slate-300 text-sm font-medium">%</span>
              {(parseFloat(porcentajeInput) || 0) < 10 && (
                <span className="text-amber-400 text-xs">Recomendado: mínimo 10%</span>
              )}
            </div>
            <div className="bg-slate-800/50 rounded-xl px-3 py-2 text-xs text-slate-400 space-y-0.5">
              <p>En un futuro ciclo, de un ingreso de <span className="text-slate-300 font-medium">$100,000</span> se apartarían <span className="text-emerald-400 font-medium">${(100000 * (parseFloat(porcentajeInput) || 0) / 100).toLocaleString('es-AR')}</span>.</p>
              <p className="text-slate-500">Ajustable en el Paso 2 del wizard al iniciar un ciclo.</p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Modal renombrar ─────────────────────────────────────── */}
      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancelEdit} />
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Renombrar categoría</h3>
            {formError && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg mb-3 text-sm">
                {formError}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                autoFocus
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  {formLoading ? 'Guardando...' : 'Renombrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal eliminación ───────────────────────────────────── */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isDeleting && setDeleteTarget(null)}
          />
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar categoría</h3>

            {loadingAfectados ? (
              <p className="text-slate-400 text-sm py-4 text-center">Verificando movimientos...</p>
            ) : movimientosAfectados.length > 0 ? (
              <>
                <p className="text-sm text-slate-300 mb-3">
                  Esta categoría tiene <span className="text-amber-300 font-semibold">{movimientosAfectados.length} movimiento{movimientosAfectados.length !== 1 ? 's' : ''}</span>. Reasignalos a otra categoría para continuar.
                </p>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl divide-y divide-slate-700/40 mb-4 max-h-40 overflow-y-auto">
                  {movimientosAfectados.map((m) => (
                    <div key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="text-slate-300 truncate flex-1 mr-2">{m.descripcion}</span>
                      <span className="text-slate-500 tabular-nums flex-shrink-0">
                        {new Date(m.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className={`ml-2 tabular-nums font-medium flex-shrink-0 ${m.tipo === 'gasto' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {m.tipo === 'gasto' ? '−' : '+'} ${Number(m.importe).toLocaleString('es-AR')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-1">Reasignar a</label>
                  <select
                    value={nuevaCategoriaId ?? ''}
                    onChange={(e) => setNuevaCategoriaId(Number(e.target.value) || null)}
                    className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccioná una categoría</option>
                    {categories
                      .filter((c) => c.id !== deleteTarget)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                  </select>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-300 mb-6">¿Estás seguro? Esta acción no se puede deshacer.</p>
            )}

            {deleteError && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg mb-4 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setMovimientosAfectados([]); setNuevaCategoriaId(null); }}
                disabled={isDeleting}
                className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting || loadingAfectados}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-medium py-2.5 rounded-lg transition-all text-sm"
              >
                {isDeleting
                  ? 'Procesando...'
                  : movimientosAfectados.length > 0
                  ? 'Reasignar y eliminar'
                  : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PresupuestoManager;
