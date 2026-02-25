import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { UserCategory, MovimientoCreate, Movimiento } from '../types';
import { getUserCategories, createMovimiento, updateMovimiento } from '../services/api';

interface MovimientoFormProps {
  onMovimientoCreated: () => void;
  onMovimientoUpdated: () => void;
  movimientoToEdit?: Movimiento | null;
  onCancelEdit?: () => void;
  categoriesVersion?: number;
}

function MovimientoForm({ onMovimientoCreated, onMovimientoUpdated, movimientoToEdit, onCancelEdit, categoriesVersion }: MovimientoFormProps) {
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [importe, setImporte] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [nota, setNota] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');

  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getUserCategories();
        setCategories(data);
        if (data.length > 0 && !movimientoToEdit) {
          setCategoriaId(data[0].id.toString());
        }
      } catch (err) {
        console.error('Error al cargar categorías:', err);
      }
    };

    fetchCategories();
  }, [movimientoToEdit, categoriesVersion]);

  useEffect(() => {
    if (movimientoToEdit) {
      setTipo(movimientoToEdit.tipo);
      setImporte(movimientoToEdit.importe.toString());
      setDescripcion(movimientoToEdit.descripcion);
      setNota(movimientoToEdit.nota || '');
      const catId = movimientoToEdit.categoria_id ?? movimientoToEdit.user_category_id;
      setCategoriaId(catId ? catId.toString() : '');
    } else {
      setTipo('gasto');
      setImporte('');
      setDescripcion('');
      setNota('');
      if (categories.length > 0) {
        setCategoriaId(categories[0].id.toString());
      }
    }
  }, [movimientoToEdit, categories]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!importe || !descripcion || !categoriaId) {
      setError('Por favor completa todos los campos obligatorios');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const movimientoData: MovimientoCreate = {
        importe: parseFloat(importe),
        fecha: movimientoToEdit ? movimientoToEdit.fecha : new Date().toISOString(),
        descripcion,
        nota: nota || null,
        tipo,
        categoria_id: null,
        user_category_id: parseInt(categoriaId) || null,
      };

      if (movimientoToEdit) {
        await updateMovimiento(movimientoToEdit.id, movimientoData);
        onMovimientoUpdated();
      } else {
        await createMovimiento(movimientoData);
        onMovimientoCreated();
      }

      setImporte('');
      setDescripcion('');
      setNota('');

    } catch (err) {
      setError(movimientoToEdit ? 'Error al actualizar el movimiento' : 'Error al registrar el movimiento');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isIngreso = tipo === 'ingreso';
  const accentColor = isIngreso ? 'green' : 'blue';

  return (
    <div className={`bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 ${isIngreso ? 'border-l-green-500' : 'border-l-blue-500'} p-6 mb-6`}>
      {/* Título */}
      <h2 className="text-2xl font-bold mb-4 text-white">
        {movimientoToEdit
          ? `✏️ Editar ${isIngreso ? 'Ingreso' : 'Gasto'}`
          : `➕ Registrar Movimiento`}
      </h2>

      {/* Toggle Gasto / Ingreso */}
      {!movimientoToEdit && (
        <div className="flex gap-2 mb-5 p-1 bg-slate-900/50 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setTipo('gasto')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tipo === 'gasto'
                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => setTipo('ingreso')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tipo === 'ingreso'
                ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ingreso
          </button>
        </div>
      )}

      {/* Mensaje de error */}
      {error && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Campo: Descripción */}
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-1">
            Descripción *
          </label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={isIngreso ? 'Ej: Sueldo de febrero' : 'Ej: Almuerzo con cliente'}
            className={`w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-${accentColor}-500 focus:border-transparent transition-all`}
          />
        </div>

        {/* Grid de 2 columnas para Importe y Categoría */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Campo: Importe */}
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1">
              Importe *
            </label>
            <input
              type="number"
              step="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0.00"
              className={`w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-${accentColor}-500 focus:border-transparent transition-all`}
            />
          </div>

          {/* Campo: Categoría */}
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1">
              Categoría *
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-${accentColor}-500 focus:border-transparent transition-all`}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Campo: Nota */}
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-1">
            Nota (opcional)
          </label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Información adicional"
            className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className={`${
              isIngreso
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-[0_0_25px_rgba(34,197,94,0.5)] border-green-300/70'
                : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 shadow-[0_0_25px_rgba(59,130,246,0.6)] border-blue-300/70'
            } disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full border tracking-wide uppercase text-sm transition-all duration-200`}
          >
            {loading ? 'Guardando...' : movimientoToEdit
              ? `Actualizar ${isIngreso ? 'Ingreso' : 'Gasto'}`
              : `Registrar ${isIngreso ? 'Ingreso' : 'Gasto'}`}
          </button>

          {movimientoToEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-6 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default MovimientoForm;
