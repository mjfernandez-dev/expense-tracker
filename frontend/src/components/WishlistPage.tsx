import { useEffect, useState, useCallback } from 'react';
import type { WishlistItem } from '../types';
import { getWishlistItems } from '../services/api';
import WishlistItemCard from './WishlistItemCard';
import WishlistForm from './WishlistForm';

function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWishlistItems(100, 0);
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError('Error al cargar las metas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreate = () => {
    setEditingItem(null);
    setShowForm(true);
  };

  const handleEdit = (item: WishlistItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingItem(null);
    fetchItems();
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  const handleDelete = () => {
    fetchItems();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Metas</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            {total > 0
              ? `${total} ${total === 1 ? 'item' : 'items'} — hasta 3 en progreso`
              : 'Tus metas de ahorro'}
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          + Nuevo
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-xl text-sm">
          {error}
          <button onClick={fetchItems} className="ml-3 underline hover:text-white">Reintentar</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-8 text-center">
          <p className="text-slate-400 text-lg mb-2">Todavía no tenés metas</p>
          <p className="text-slate-500 text-sm mb-4">Agregá metas, viajes o compras que querés planificar</p>
          <button
            onClick={handleCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
          >
            Crear primer item
          </button>
        </div>
      )}

      {/* Items grid */}
      {!loading && !error && items.length > 0 && (
        <div className="grid gap-3">
          {items.map((item) => (
            <WishlistItemCard
              key={item.id}
              item={item}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <WishlistForm
          item={editingItem}
          onSuccess={handleFormSuccess}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}

export default WishlistPage;
