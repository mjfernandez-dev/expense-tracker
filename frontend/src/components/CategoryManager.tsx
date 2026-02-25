// COMPONENTE: Gestión de categorías con diseño moderno
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { UserCategory } from '../types';
import { getUserCategories, createCategory, updateCategory, deleteCategory } from '../services/api';

interface CategoryManagerProps {
  onCategoriesChanged?: () => void;
}

function CategoryManager({ onCategoriesChanged }: CategoryManagerProps) {
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [nombre, setNombre] = useState<string>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await getUserCategories();
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

  const handleEdit = (category: UserCategory) => {
    setNombre(category.nombre);
    setEditingId(category.id);
    setFormError(null);
  };

  const handleCancelEdit = () => {
    setNombre('');
    setEditingId(null);
    setFormError(null);
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
      await deleteCategory(deleteTarget);
      await fetchCategories();
      onCategoriesChanged?.();
      setDeleteTarget(null);
    } catch (err) {
      const error = err as { response?: { data?: { detail?: string } } };
      setDeleteError(error.response?.data?.detail || 'Error al eliminar la categoría');
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-6 text-slate-300">Cargando categorías...</div>
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
      <h2 className="text-2xl font-bold mb-4 text-white">Categorías</h2>

      {/* FORMULARIO */}
      <form onSubmit={handleSubmit} className="mb-6 pb-6 border-b border-slate-700/70">
        {formError && (
          <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
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
              className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={formLoading}
            className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
          >
            {formLoading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear')}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-6 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* LISTA DE CATEGORÍAS */}
      <h3 className="text-lg font-semibold mb-3 text-slate-300">Categorías existentes</h3>

      {categories.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          No hay categorías registradas.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700/70">
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-100">
                    {category.nombre}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-400/30">
                      Personalizada
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteRequest(category.id)}
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
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar categoría</h3>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro de que deseas eliminar esta categoría? Esta acción no se puede deshacer.
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

export default CategoryManager;