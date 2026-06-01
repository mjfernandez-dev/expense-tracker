import { useState, useEffect } from 'react';
import type { Ciclo, CicloCreate, PresupuestoItemCreate, UserCategory } from '../types';
import { updateCiclo, confirmarPresupuesto, getUserCategories, updateUserCategory } from '../services/api';
import { isDateAtOrAfterTodayBA } from '../utils/buenosAiresDate';

interface EditCicloModalProps {
  ciclo: Ciclo;
  onClose: () => void;
  onSaved: () => void;
}

interface PresupuestoEdit {
  categoria_id: number | null;
  user_category_id: number | null;
  descripcion: string;
  monto: string;
  confirmado: boolean;
  monto_default: number | null;
}

export default function EditCicloModal({ ciclo, onClose, onSaved }: EditCicloModalProps) {
  const [fechaInicio, setFechaInicio] = useState<string>(ciclo.fecha_inicio.split('T')[0]);
  const [fechaFin, setFechaFin] = useState<string>(ciclo.fecha_fin.split('T')[0]);
  const [ahorro, setAhorro] = useState<string>(String(ciclo.ahorro_objetivo));
  const [gastosFijos, setGastosFijos] = useState<PresupuestoEdit[]>([]);
  const [loadingCats, setLoadingCats] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [syncDefaults, setSyncDefaults] = useState<boolean>(false);
  const [nuevoAdHoc, setNuevoAdHoc] = useState<string>('');
  const [nuevoAdHocMonto, setNuevoAdHocMonto] = useState<string>('');

  useEffect(() => {
    const cargarCategorias = async () => {
      setLoadingCats(true);
      const existingItems = ciclo.resumen?.presupuesto_items ?? [];
      try {
        const cats: UserCategory[] = await getUserCategories();
        const catRows: PresupuestoEdit[] = cats.map((cat) => {
          const match = existingItems.find(
            (item) =>
              item.user_category_id === cat.id ||
              item.descripcion?.toLowerCase() === cat.nombre.toLowerCase(),
          );
          return {
            categoria_id: null,
            user_category_id: cat.id,
            descripcion: cat.nombre,
            monto: match ? String(match.monto_estimado) : '',
            confirmado: match ? match.confirmado : false,
            monto_default: cat.monto_default ?? null,
          };
        });
        const adHocRows: PresupuestoEdit[] = existingItems
          .filter(
            (item) =>
              item.user_category_id === null &&
              item.categoria_id === null &&
              !cats.some((cat) => cat.nombre.toLowerCase() === item.descripcion?.toLowerCase()),
          )
          .map((item) => ({
            categoria_id: null,
            user_category_id: null,
            descripcion: item.descripcion ?? 'Sin descripción',
            monto: String(item.monto_estimado),
            confirmado: item.confirmado,
            monto_default: null,
          }));
        setGastosFijos([...catRows, ...adHocRows]);
      } catch {
        setGastosFijos(
          existingItems.map((c) => ({
            categoria_id: c.categoria_id,
            user_category_id: c.user_category_id,
            descripcion: c.descripcion ?? 'Sin descripción',
            monto: String(c.monto_estimado),
            confirmado: c.confirmado,
            monto_default: null,
          })),
        );
        setError('No se pudieron cargar las categorías. Mostrando datos existentes.');
      } finally {
        setLoadingCats(false);
      }
    };
    cargarCategorias();
  }, [ciclo]);

  const handleAddAdHoc = () => {
    if (!nuevoAdHoc.trim() || !nuevoAdHocMonto) return;
    setGastosFijos((prev) => [
      ...prev,
      { categoria_id: null, user_category_id: null, descripcion: nuevoAdHoc.trim(), monto: nuevoAdHocMonto, confirmado: true, monto_default: null },
    ]);
    setNuevoAdHoc('');
    setNuevoAdHocMonto('');
  };

  const itemsConCambio = gastosFijos.filter(
    (gf): gf is PresupuestoEdit & { user_category_id: number; monto_default: number } =>
      gf.user_category_id !== null &&
      gf.confirmado &&
      gf.monto !== '' &&
      gf.monto_default !== null &&
      parseFloat(gf.monto) !== gf.monto_default,
  );

  const handleSave = async () => {
    setError('');
    if (!isDateAtOrAfterTodayBA(fechaFin)) {
      setError('La fecha de fin debe ser posterior a hoy');
      return;
    }
    setLoading(true);
    try {
      await updateCiclo(ciclo.id, { fecha_inicio: `${fechaInicio}T00:00:00`, fecha_fin: `${fechaFin}T23:59:59`, ahorro_objetivo: parseFloat(ahorro) || 0 } as Partial<CicloCreate>);
      const todosLosItems: PresupuestoItemCreate[] = gastosFijos
        .filter((gf) => gf.confirmado)
        .map((gf) => ({ categoria_id: gf.categoria_id, user_category_id: gf.user_category_id, monto_estimado: parseFloat(gf.monto) || 0, confirmado: true, descripcion: gf.descripcion }));
      if (todosLosItems.length > 0) await confirmarPresupuesto(ciclo.id, todosLosItems);
      if (syncDefaults && itemsConCambio.length > 0) {
        await Promise.all(
          itemsConCambio.map((gf) =>
            updateUserCategory(gf.user_category_id, { monto_default: parseFloat(gf.monto) }),
          ),
        );
      }
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

        <div className="space-y-2">
          <label className="text-slate-300 text-sm">Presupuesto del ciclo</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {loadingCats ? (
              <p className="text-slate-500 text-xs text-center py-2">Cargando categorías...</p>
            ) : gastosFijos.map((gf, idx) => (
              <div key={`${gf.user_category_id ?? 'adhoc'}-${idx}`}
                className={`flex items-center gap-2 bg-slate-800/60 rounded-lg px-2.5 py-2 border ${gf.confirmado ? 'border-blue-500/30' : 'border-slate-700/40 opacity-50'}`}>
                <button type="button"
                  onClick={() => setGastosFijos((prev) => prev.map((g, i) => (i === idx ? { ...g, confirmado: !g.confirmado } : g)))}
                  className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${gf.confirmado ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>
                  {gf.confirmado && <span className="text-white text-xs font-bold leading-none">✓</span>}
                </button>
                <span className="flex-1 text-slate-200 text-xs truncate">{gf.descripcion}</span>
                <input type="number" min="0" step="100" value={gf.monto}
                  onChange={(e) => setGastosFijos((prev) => prev.map((g, i) => (i === idx ? { ...g, monto: e.target.value } : g)))}
                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-blue-500" />
              </div>
            ))}
            {!loadingCats && gastosFijos.length === 0 && (
              <p className="text-slate-500 text-xs text-center py-2">Sin ítems de presupuesto</p>
            )}
          </div>

          <div className="flex gap-1.5 pt-1">
            <input type="text" placeholder="Descripción" value={nuevoAdHoc} onChange={(e) => setNuevoAdHoc(e.target.value)}
              className="flex-1 bg-slate-700 border border-slate-500 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500" />
            <input type="number" min="0" placeholder="$" value={nuevoAdHocMonto} onChange={(e) => setNuevoAdHocMonto(e.target.value)}
              className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500" />
            <button type="button" onClick={handleAddAdHoc}
              className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">+</button>
          </div>
        </div>

        {itemsConCambio.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 space-y-2">
            <button
              type="button"
              onClick={() => setSyncDefaults((v) => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${syncDefaults ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>
                {syncDefaults && <span className="text-white text-xs font-bold leading-none">✓</span>}
              </span>
              <span className="text-slate-300 text-xs">Actualizar valores por defecto para próximos ciclos</span>
            </button>
            {syncDefaults && (
              <ul className="pl-6 space-y-1">
                {itemsConCambio.map((gf, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                    <span className="flex-1 truncate">{gf.descripcion}</span>
                    <span className="text-slate-600">{gf.monto_default?.toLocaleString('es-AR')}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-blue-400">{parseFloat(gf.monto).toLocaleString('es-AR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

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
