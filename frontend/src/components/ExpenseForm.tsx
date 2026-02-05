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
}

function ExpenseForm({ onExpenseCreated, onExpenseUpdated, expenseToEdit, onCancelEdit }: ExpenseFormProps) {
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
  }, [expenseToEdit]);

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
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      {/* TÍTULO con icono y color condicional */}
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        {expenseToEdit ? '✏️ Editar Gasto' : '➕ Registrar Nuevo Gasto'}
      </h2>
      
      {/* Mensaje de error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Campo: Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción *
          </label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Almuerzo con cliente"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        {/* Grid de 2 columnas para Importe y Categoría */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Campo: Importe */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Importe *
            </label>
            <input
              type="number"
              step="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* Campo: Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría *
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nota (opcional)
          </label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Información adicional"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button 
            type="submit" 
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-lg transition-colors duration-200"
          >
            {loading ? 'Guardando...' : (expenseToEdit ? 'Actualizar Gasto' : 'Registrar Gasto')}
          </button>
          
          {expenseToEdit && (
            <button 
              type="button"
              onClick={handleCancel}
              className="bg-gray-500 hover:bg-gray-600 text-white font-medium px-6 py-2 rounded-lg transition-colors duration-200"
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