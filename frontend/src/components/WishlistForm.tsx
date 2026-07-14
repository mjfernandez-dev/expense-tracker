import { useState, useEffect } from 'react';
import type { WishlistItem, WishlistItemCreate, WishlistItemUpdate, UserCategory } from '../types';
import { createWishlistItem, updateWishlistItem, getUserCategories } from '../services/api';

interface WishlistFormProps {
  item: WishlistItem | null;
  onSuccess: () => void;
  onClose: () => void;
}

function WishlistForm({ item, onSuccess, onClose }: WishlistFormProps) {
  const isEdit = item !== null;

  const [name, setName] = useState<string>(item?.name ?? '');
  const [estimatedCost, setEstimatedCost] = useState<string>(item?.estimated_cost?.toString() ?? '');
  const [priority, setPriority] = useState<string>(item?.priority ?? 'media');
  const [status, setStatus] = useState<string>(item?.status ?? 'draft');
  const [categoryName, setCategoryName] = useState<string>(item?.category?.nombre ?? '');
  const [notes, setNotes] = useState<string>(item?.notes ?? '');
  const [montoAhorrado, setMontoAhorrado] = useState<string>(item?.monto_ahorrado?.toString() ?? '0');
  const [categorySuggestions, setCategorySuggestions] = useState<UserCategory[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(item?.category_id ?? null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar categorías del usuario para autocomplete
  useEffect(() => {
    getUserCategories().then(setCategorySuggestions).catch(() => {});
  }, []);

  // Filtrar sugerencias según lo escrito
  const filteredSuggestions = categoryName.trim()
    ? categorySuggestions.filter((c) =>
        c.nombre.toLowerCase().includes(categoryName.toLowerCase())
      )
    : [];

  const handleSelectCategory = (cat: UserCategory) => {
    setCategoryName(cat.nombre);
    setSelectedCategoryId(cat.id);
    setShowSuggestions(false);
  };

  const handleCategoryChange = (value: string) => {
    setCategoryName(value);
    setSelectedCategoryId(null); // nueva categoría (inline) o búsqueda
    setShowSuggestions(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const costNum = parseFloat(estimatedCost);
      if (isNaN(costNum) || costNum <= 0) {
        throw new Error('El costo estimado debe ser un número positivo');
      }

      if (isEdit) {
        const payload: WishlistItemUpdate = {
          name: name !== item.name ? name : undefined,
          estimated_cost: costNum !== item.estimated_cost ? costNum : undefined,
          priority: priority !== item.priority ? (priority as WishlistItemUpdate['priority']) : undefined,
          status: status !== item.status ? (status as WishlistItemUpdate['status']) : undefined,
          notes: notes !== (item.notes ?? '') ? notes || null : undefined,
          monto_ahorrado: parseFloat(montoAhorrado) !== item.monto_ahorrado ? parseFloat(montoAhorrado) : undefined,
        };

        // Solo enviar category_name si cambió o si no hay category_id
        if (selectedCategoryId !== item.category_id) {
          if (selectedCategoryId) {
            payload.category_id = selectedCategoryId;
          } else if (categoryName.trim()) {
            payload.category_name = categoryName.trim();
          }
        }

        await updateWishlistItem(item.id, payload);
      } else {
        const payload: WishlistItemCreate = {
          name: name.trim(),
          estimated_cost: costNum,
          priority: priority as WishlistItemCreate['priority'],
          status: status as WishlistItemCreate['status'],
          notes: notes.trim() || null,
          monto_ahorrado: parseFloat(montoAhorrado) || 0,
        };

        if (selectedCategoryId) {
          payload.category_id = selectedCategoryId;
        } else if (categoryName.trim()) {
          payload.category_name = categoryName.trim();
        }

        await createWishlistItem(payload);
      }

      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el item';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/70 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-white">
            {isEdit ? 'Editar item' : 'Nuevo item'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1">Nombre *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ej: Viaje a Bariloche"
              className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* Estimated Cost */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1">Costo estimado *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              required
              placeholder="2500.00"
              className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>

          {/* Priority + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
              >
                <option value="draft">Borrador</option>
                <option value="en-progreso">En Progreso</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Category with autocomplete */}
          <div className="relative">
            <label className="text-slate-400 text-xs font-medium block mb-1">Categoría</label>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => handleCategoryChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Buscar o crear categoría..."
              className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600/70 rounded-xl overflow-hidden shadow-xl">
                {filteredSuggestions.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategory(cat)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/60 transition-colors"
                  >
                    {cat.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Monto ahorrado (solo edit) */}
          {isEdit && (
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1">Monto ahorrado</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={montoAhorrado}
                onChange={(e) => setMontoAhorrado(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Detalles, links, fechas..."
              className="w-full bg-slate-800/60 border border-slate-600/70 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-3 py-2 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-600/70 bg-transparent text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default WishlistForm;
