import { useEffect, useState, useCallback } from 'react';
import type { WishlistItem } from '../types';
import { getWishlistItems } from '../services/api';
import WishlistItemCard from './WishlistItemCard';
import WishlistForm from './WishlistForm';

type GroupStatus = 'en-progreso' | 'draft' | 'completado' | 'cancelado';

const STATUS_GROUPS: { status: GroupStatus; label: string; icon: string }[] = [
  { status: 'en-progreso', label: 'En Progreso', icon: '🎯' },
  { status: 'draft', label: 'Borrador', icon: '💡' },
  { status: 'completado', label: 'Completado', icon: '✅' },
  { status: 'cancelado', label: 'Cancelado', icon: '✕' },
];

const COLLAPSED_BY_DEFAULT: Set<GroupStatus> = new Set(['completado', 'cancelado']);

function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupStatus>>(COLLAPSED_BY_DEFAULT);

  const toggleGroup = (status: GroupStatus) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

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

  // Agrupar items por status en el orden definido
  const grouped = STATUS_GROUPS.map((g) => ({
    ...g,
    groupItems: items.filter((i) => i.status === g.status),
  })).filter((g) => g.groupItems.length > 0);

  const subtitle = (() => {
    if (total === 0) return 'Tus metas de ahorro';
    const enProgreso = items.filter((i) => i.status === 'en-progreso').length;
    const borradores = items.filter((i) => i.status === 'draft').length;
    const partes: string[] = [];
    if (enProgreso > 0) partes.push(`${enProgreso} en progreso`);
    if (borradores > 0) partes.push(`${borradores} borrador${borradores !== 1 ? 'es' : ''}`);
    if (partes.length === 0) return `${total} ${total === 1 ? 'meta' : 'metas'}`;
    return partes.join(' · ');
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Metas</h2>
          <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>
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

      {/* Items agrupados por estado */}
      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(({ status, label, icon, groupItems }) => {
            const isCollapsed = collapsedGroups.has(status);
            return (
              <section key={status}>
                {/* Header del grupo */}
                <button
                  onClick={() => toggleGroup(status)}
                  className="flex items-center gap-2 w-full text-left group mb-2"
                >
                  <span className="text-sm">{icon}</span>
                  <h3 className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">
                    {label}
                  </h3>
                  <span className="text-xs text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded-full">
                    {groupItems.length}
                  </span>
                  {isCollapsed && (
                    <span className="text-xs text-slate-500 ml-auto">{groupItems.length} ocultos</span>
                  )}
                </button>

                {!isCollapsed && (
                  <div className="grid gap-2">
                    {groupItems.map((item) => (
                      <WishlistItemCard
                        key={item.id}
                        item={item}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
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
