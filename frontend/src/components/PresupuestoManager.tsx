// COMPONENTE: Gestión de presupuesto base (plantilla) + categorías personalizadas
// Reemplaza CategoryManager agregando monto_default, tiene_monto_fijo y ahorro_objetivo_default
import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import type { UserCategory, GastoFijo } from '../types';
import type { MovimientoAfectado } from '../services/api';
import { isPushSupported, subscribeToPush } from '../services/push';
import {
  getUserCategories,
  createCategory,
  updateCategory,
  updateUserCategory,
  deleteCategory,
  getMovimientosAfectados,
  reasignarYEliminarCategoria,
  updateUserPreferences,
  getGastosFijos,
  updateGastoFijo,
} from '../services/api';
import { useAuth } from '../context/useAuth';
import SaveIndicator from './SaveIndicator';
import ConfirmModal from './ConfirmModal';
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Formulario nueva/editar categoría
  const [nombre, setNombre] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Gastos Fijos ──────────────────────────────────────────────────
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([]);
  const [gastoFijoSaveErrors, setGastoFijoSaveErrors] = useState<Record<number, string>>({});
  const [gastosFijosLoading, setGastosFijosLoading] = useState<boolean>(false);
  const [gastosFijosError, setGastosFijosError] = useState<string | null>(null);

  // ── Confirmación in-app de notificaciones push ────────────────────
  const [showPushConfirm, setShowPushConfirm] = useState<boolean>(false);

  const fetchGastosFijos = useCallback(async () => {
    setGastosFijosLoading(true);
    setGastosFijosError(null);
    try {
      const data = await getGastosFijos();
      setGastosFijos(data);
    } catch {
      setGastosFijosError('No se pudieron cargar los gastos fijos.');
    } finally {
      setGastosFijosLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGastosFijos();
  }, [fetchGastosFijos, refreshKey]);

  const triggerPushOptIn = async (newDiaVencimiento: number | null) => {
    if (newDiaVencimiento === null) return;
    if (!isPushSupported()) return; // T3.3 handles UI for this case
    if (localStorage.getItem('push_denied') === 'true') return;
    if (Notification.permission === 'granted') {
      try {
        await subscribeToPush();
      } catch (err) {
        const e = err as { response?: { status?: number } };
        if (e.response?.status !== 409) {
          setAutoSaveError('No se pudo sincronizar la suscripción a notificaciones.');
        }
      }
      return;
    }
    if (Notification.permission === 'denied') return;

    // Show in-app confirmation before browser prompt (better UX)
    setShowPushConfirm(true);
  };

  const handlePushOptInConfirm = async () => {
    setShowPushConfirm(false);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        await subscribeToPush();
      } catch {
        setAutoSaveError('No se pudo activar las notificaciones. Intentá de nuevo.');
      }
    } else {
      localStorage.setItem('push_denied', 'true');
    }
  };

  const handleVencimientoBlur = async (gf: GastoFijo, field: 'dia_vencimiento' | 'dias_anticipacion', rawValue: string) => {
    const parsed = rawValue === '' ? null : parseInt(rawValue, 10);
    // Optimistic update
    setGastosFijos(prev => prev.map(g => g.id === gf.id ? { ...g, [field]: parsed } : g));
    setGastoFijoSaveErrors(prev => ({ ...prev, [gf.id]: '' }));
    try {
      const updated = await updateGastoFijo(gf.id, {
        activo: gf.activo,
        [field]: parsed,
      });
      setGastosFijos(prev => prev.map(g => g.id === gf.id ? { ...g, ...updated } : g));
      // T3.2: opt-in only when dia_vencimiento transitions from null → value
      if (field === 'dia_vencimiento' && gf.dia_vencimiento == null && parsed !== null) {
        await triggerPushOptIn(parsed);
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setGastoFijoSaveErrors(prev => ({
        ...prev,
        [gf.id]: e.response?.data?.detail ?? 'Error al guardar',
      }));
      // Revert
      setGastosFijos(prev => prev.map(g => g.id === gf.id ? gf : g));
    }
  };

  // Errores inline de auto-save
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);

  // Confirmación eliminación
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
          Estos valores se usan para iniciar tu próximo ciclo financiero.
        </p>
      </div>

      {autoSaveError && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{autoSaveError}</span>
          <button onClick={() => setAutoSaveError(null)} className="text-red-300 hover:text-red-100 ml-4">✕</button>
        </div>
      )}

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

          <div>
            <h3 className="text-white font-semibold text-sm">Categorías con monto fijo</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Al activar una categoría se pre-carga su monto en el Paso 3 del wizard.
            </p>
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">Todavía no creaste categorías. Escribí un nombre y dale Crear.</div>
          ) : (
            <div className="space-y-2">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2.5 border transition-colors ${
                    cat.tiene_monto_fijo ? 'border-blue-500/30' : 'border-slate-700/40'
                  }`}
                >
                  <button
                    onClick={() => handleToggleMontoFijo(cat.id, !!cat.tiene_monto_fijo)}
                    className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                      cat.tiene_monto_fijo ? 'bg-blue-600 border-blue-600' : 'border-slate-500'
                    }`}
                    title={cat.tiene_monto_fijo ? 'Desactivar monto fijo' : 'Activar monto fijo'}
                  >
                    {cat.tiene_monto_fijo && <span className="text-white text-xs font-bold">✓</span>}
                  </button>

                  <span
                    className={`flex-1 text-sm truncate cursor-pointer hover:text-white transition-colors ${
                      cat.tiene_monto_fijo ? 'text-slate-200' : 'text-slate-400'
                    }`}
                    onClick={() => handleEdit(cat)}
                    title="Renombrar"
                  >
                    {cat.nombre}
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={cat.monto_default != null ? cat.monto_default : ''}
                    onChange={e => handleMontoChange(cat.id, e.target.value)}
                    onBlur={e => handleMontoBlur(cat.id, e.target.value)}
                    placeholder="$0"
                    disabled={!cat.tiene_monto_fijo}
                    className={`w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-blue-500 transition-opacity ${
                      cat.tiene_monto_fijo ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
                    }`}
                  />
                  <button
                    onClick={() => openDeleteModal(cat.id)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-2 py-1 rounded text-xs font-medium transition-all flex-shrink-0"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Columna derecha: Ahorro + Nueva categoría */}
        <div className="space-y-4">

          {/* Porcentaje de ahorro objetivo */}
          <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-sm">Porcentaje de ahorro objetivo</h3>
                <p className="text-slate-400 text-xs mt-0.5">Se aparta de cada ingreso al iniciar un ciclo</p>
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
              <p>En tu próximo ingreso de <span className="text-slate-300 font-medium">$100,000</span> se apartarían <span className="text-emerald-400 font-medium">${(100000 * (parseFloat(porcentajeInput) || 0) / 100).toLocaleString('es-AR')}</span>.</p>
              <p className="text-slate-500">Ajustable en el Paso 2 del wizard al iniciar un ciclo.</p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Gastos Fijos: vencimientos ──────────────────────────── */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-600/40 to-transparent" />
        <div className="pt-6 text-center">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Vencimientos recurrentes</p>
        </div>
      </div>
      {gastosFijosError && (
        <p className="text-red-400 text-xs px-1">{gastosFijosError}</p>
      )}
      {gastosFijosLoading && (
        <p className="text-slate-500 text-xs px-1">Cargando gastos fijos...</p>
      )}
      {gastosFijos.length > 0 && (
        <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-5 space-y-3">
          <div>
            <h3 className="text-white font-semibold text-sm">Gastos fijos recurrentes</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Configurá recordatorios para no olvidar ningún vencimiento.
            </p>
          </div>
          <div className="space-y-2">
            {gastosFijos.map(gf => (
              <div
                key={gf.id}
                className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200 text-sm font-medium truncate flex-1">
                    {gf.descripcion}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${gf.activo ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/60 text-slate-400 border border-slate-600/30'}`}>
                    {gf.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {gastoFijoSaveErrors[gf.id] && (
                  <p className="text-red-400 text-xs">{gastoFijoSaveErrors[gf.id]}</p>
                )}

                <div className="flex flex-wrap gap-3">
                  {/* Día de vencimiento */}
                  <div className="flex flex-col gap-1 min-w-32">
                    <label className="text-slate-400 text-xs">Día de vencimiento</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="ej. 10"
                      defaultValue={gf.dia_vencimiento ?? ''}
                      onBlur={e => handleVencimientoBlur(gf, 'dia_vencimiento', e.target.value)}
                      className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500 text-right"
                    />
                    {/* T3.3: degradation hint for browsers without push support */}
                    {!isPushSupported() && gf.dia_vencimiento != null && (
                      <p className="text-xs text-slate-500 mt-1">
                        Instalá la app para recibir avisos de vencimiento
                      </p>
                    )}
                  </div>

                  {/* Días de anticipación — solo visible cuando dia_vencimiento tiene valor */}
                  {gf.dia_vencimiento != null && (
                    <div className="flex flex-col gap-1 min-w-36">
                      <label className="text-slate-400 text-xs">Días de anticipación</label>
                      <input
                        type="number"
                        min="0"
                        max="28"
                        defaultValue={gf.dias_anticipacion ?? 2}
                        onBlur={e => handleVencimientoBlur(gf, 'dias_anticipacion', e.target.value)}
                        className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500 text-right"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ── Confirmación in-app de notificaciones push ─────────────── */}
      {showPushConfirm && (
        <ConfirmModal
          title="Activar notificaciones"
          confirmLabel="Activar"
          onConfirm={handlePushOptInConfirm}
          onCancel={() => {
            setShowPushConfirm(false);
            localStorage.setItem('push_denied', 'true');
          }}
        >
          <p>¿Querés recibir avisos cuando se acerque el vencimiento de un gasto fijo?</p>
          <p className="text-slate-400 text-xs">Te notificaremos incluso con la app cerrada.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

export default PresupuestoManager;
