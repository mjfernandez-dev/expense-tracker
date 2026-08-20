// COMPONENTE: Modal para programar un gasto futuro (importe, vencimiento y opcionales).
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { UserCategory, GastoProgramadoCreate } from '../types';
import { getUserCategories, createGastoProgramado } from '../services/api';
import { getCurrentBADateInputValue } from '../utils/buenosAiresDate';

interface GastoProgramadoFormProps {
  onClose: () => void;
  onCreated: () => void;
}

const MEDIOS_PAGO = ['efectivo', 'debito', 'credito', 'transferencia', 'otro'];

export default function GastoProgramadoForm({ onClose, onCreated }: GastoProgramadoFormProps) {
  const [importe, setImporte] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [vencimiento, setVencimiento] = useState<string>(getCurrentBADateInputValue());
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [medioPago, setMedioPago] = useState<string>('');
  const [clasificacion, setClasificacion] = useState<string>('');
  const [diasAnticipacion, setDiasAnticipacion] = useState<string>('2');
  const [cuotaActual, setCuotaActual] = useState<string>('');
  const [cuotaTotal, setCuotaTotal] = useState<string>('');

  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const data = await getUserCategories();
        setCategories(data);
        if (data.length > 0) {
          setCategoriaId(data[0].id.toString());
        }
      } catch {
        setError('Error al cargar las categorías.');
      } finally {
        setLoading(false);
      }
    };
    cargarCategorias();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const monto = parseFloat(importe);
    if (isNaN(monto) || monto <= 0) {
      setError('Ingresá un importe válido mayor a cero.');
      return;
    }
    if (!descripcion.trim()) {
      setError('Ingresá una descripción.');
      return;
    }
    if (!categoriaId) {
      setError('Seleccioná una categoría.');
      return;
    }
    if (vencimiento < getCurrentBADateInputValue()) {
      setError('La fecha de vencimiento no puede ser anterior a hoy.');
      return;
    }

    const cuotaAct = cuotaActual !== '' ? parseFloat(cuotaActual) : null;
    const cuotaTot = cuotaTotal !== '' ? parseFloat(cuotaTotal) : null;

    const payload: GastoProgramadoCreate = {
      importe: monto,
      vencimiento,
      descripcion: descripcion.trim(),
      nota: null,
      categoria_id: null,
      user_category_id: parseInt(categoriaId, 10) || null,
      medio_pago: medioPago || null,
      clasificacion: (clasificacion || null) as 'necesidad' | 'deseo' | null,
      dias_anticipacion: diasAnticipacion !== '' ? Math.max(0, Math.min(28, parseInt(diasAnticipacion, 10) || 2)) : 2,
      cuota_actual: cuotaAct != null && !isNaN(cuotaAct) && cuotaAct > 0 ? cuotaAct : null,
      cuota_total: cuotaTot != null && !isNaN(cuotaTot) && cuotaTot > 0 ? cuotaTot : null,
    };

    setSaving(true);
    setError(null);
    try {
      await createGastoProgramado(payload);
      onCreated();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'No se pudo programar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all';
  const labelClass = 'block text-sm font-medium text-slate-100 mb-1';
  const optionLabelClass = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">Programar gasto</h3>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-lg mb-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Importe *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0"
                autoFocus
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Vencimiento *</label>
              <input
                type="date"
                min={getCurrentBADateInputValue()}
                value={vencimiento}
                onChange={(e) => setVencimiento(e.target.value)}
                className={`${inputClass} scheme-dark`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Descripción *</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Seguro del auto"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Categoría *</label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              disabled={loading}
              className={inputClass}
            >
              {categories.length === 0 && <option value="">Cargando categorías...</option>}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={optionLabelClass}>Medio de pago</label>
              <select
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value)}
                className={inputClass}
              >
                <option value="">Sin especificar</option>
                {MEDIOS_PAGO.map((medio) => (
                  <option key={medio} value={medio}>
                    {medio.charAt(0).toUpperCase() + medio.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={optionLabelClass}>Clasificación</label>
              <select
                value={clasificacion}
                onChange={(e) => setClasificacion(e.target.value)}
                className={inputClass}
              >
                <option value="">— Sin clasificar</option>
                <option value="necesidad">Necesidad</option>
                <option value="deseo">Deseo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={optionLabelClass}>Días anticipación</label>
              <input
                type="number"
                min="0"
                max="28"
                value={diasAnticipacion}
                onChange={(e) => setDiasAnticipacion(e.target.value)}
                className={`${inputClass} text-right`}
              />
            </div>
            <div>
              <label className={optionLabelClass}>Cuota actual</label>
              <input
                type="number"
                min="1"
                value={cuotaActual}
                onChange={(e) => setCuotaActual(e.target.value)}
                placeholder="—"
                className={`${inputClass} text-right`}
              />
            </div>
            <div>
              <label className={optionLabelClass}>Cuota total</label>
              <input
                type="number"
                min="1"
                value={cuotaTotal}
                onChange={(e) => setCuotaTotal(e.target.value)}
                placeholder="—"
                className={`${inputClass} text-right`}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {saving ? 'Programando...' : 'Programar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}