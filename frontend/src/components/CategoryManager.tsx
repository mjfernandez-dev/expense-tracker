// COMPONENTE: Gestión de categorías con diseño moderno
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Category } from '../types';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/api';

interface CategoryManagerProps {
  onCategoriesChanged?: () => void;
}

function CategoryManager({ onCategoriesChanged }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [nombre, setNombre] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      setError('Error al cargar categorías');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

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
      onCategoriesChanged?.();

    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      setFormError(error.response?.data?.detail || 'Error al guardar la categoría');
      console.error(err);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (category: Category) => {
    setNombre(category.nombre);
    setEditingId(category.id);
    setFormError(null);
  };

  const handleCancelEdit = () => {
    setNombre('');
    setEditingId(null);
    setFormError(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta categoría?')) {
      return;
    }

    try {
      await deleteCategory(id);
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      alert(error.response?.data?.detail || 'Error al eliminar la categoría');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="text-center text-gray-600">Cargando categorías...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">🏷️ Gestión de Categorías</h2>
      
      {/* FORMULARIO */}
      <form onSubmit={handleSubmit} className="mb-6 pb-6 border-b border-gray-200">
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {formError}
          </div>
        )}
        
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de categoría (ej: Alimentación)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={formLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium px-6 py-2 rounded-lg transition-colors"
          >
            {formLoading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear')}
          </button>
          
          {editingId && (
            <button 
              type="button"
              onClick={handleCancelEdit}
              className="bg-gray-500 hover:bg-gray-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
      
      {/* LISTA DE CATEGORÍAS */}
      <h3 className="text-lg font-semibold mb-3 text-gray-700">Categorías existentes</h3>
      
      {categories.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          No hay categorías registradas.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {category.nombre}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      category.es_predeterminada 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {category.es_predeterminada ? 'Predeterminada' : 'Personalizada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => handleEdit(category)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDelete(category.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
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
    </div>
  );
}

export default CategoryManager;