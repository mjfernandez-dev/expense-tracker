// COMPONENTE: Formulario con diseño moderno usando Tailwind
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Category, ExpenseCreate, Expense } from '../types';
import { getCategories, createExpense, updateExpense } from '../services/api';

interface ExpenseFormProps {
  onExpenseCreated: () => void;
  onExpenseUpdated: () => void;
  expenseToEdit?: Expense | null;
  onCancelEdit?: () => void;
  categoriesVersion?: number;
}

function ExpenseForm({ onExpenseCreated, onExpenseUpdated, expenseToEdit, onCancelEdit, categoriesVersion }: ExpenseFormProps) {
  const [importe, setImporte] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [nota, setNota] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getCategories();
        setCategories(data);
        if (data.length > 0 && !expenseToEdit) {
          setCategoriaId(data[0].id.toString());
        }
      } catch (err) {
        console.error('Error al cargar categorías:', err);
      }
    };

    fetchCategories();
  }, [expenseToEdit, categoriesVersion]);

  useEffect(() => {
    if (expenseToEdit) {
      setImporte(expenseToEdit.importe.toString());
      setDescripcion(expenseToEdit.descripcion);
      setNota(expenseToEdit.nota || '');
      setCategoriaId(expenseToEdit.categoria_id.toString());
    } else {
      setImporte('');
      setDescripcion('');
      setNota('');
      if (categories.length > 0) {
        setCategoriaId(categories[0].id.toString());
      }
    }
  }, [expenseToEdit, categories]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!importe || !descripcion || !categoriaId) {
      setError('Por favor completa todos los campos obligatorios');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const expenseData: ExpenseCreate = {
        importe: parseFloat(importe),
        fecha: expenseToEdit ? expenseToEdit.fecha : new Date().toISOString(),
        descripcion: descripcion,
        nota: nota || null,
        categoria_id: parseInt(categoriaId),
      };
      
      if (expenseToEdit) {
        await updateExpense(expenseToEdit.id, expenseData);
        onExpenseUpdated();
      } else {
        await createExpense(expenseData);
        onExpenseCreated();
      }
      
      setImporte('');
      setDescripcion('');
      setNota('');
      
    } catch (err) {
      setError(expenseToEdit ? 'Error al actualizar el gasto' : 'Error al crear el gasto');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (onCancelEdit) {
      onCancelEdit();
    }
  };

  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 border-l-blue-500 p-6 mb-6">
      {/* TÍTULO con icono y color condicional */}
      <h2 className="text-2xl font-bold mb-4 text-white">
        {expenseToEdit ? '✏️ Editar Gasto' : '➕ Registrar Nuevo Gasto'}
      </h2>

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
            placeholder="Ej: Almuerzo con cliente"
            className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
              className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
              className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
            className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
          >
            {loading ? 'Guardando...' : (expenseToEdit ? 'Actualizar Gasto' : 'Registrar Gasto')}
          </button>

          {expenseToEdit && (
            <button
              type="button"
              onClick={handleCancel}
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

export default ExpenseForm;