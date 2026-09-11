import type { DescripcionSuggestion } from '../services/api';
import type { UserCategory } from '../types';

// Helper puro: decide si una sugerencia de descripción auto-aplica su categoría.
// Devuelve el user_category_id sugerido, o null cuando no corresponde aplicar
// (offline, modo edición, categoría tocada manualmente, primera vez, id no
// disponible en la lista de categorías del form).
export function obtenerCategoriaSugerida(
  descripcion: string,
  suggestions: DescripcionSuggestion[],
  categoriasDisponibles: UserCategory[],
  esEdicion: boolean,
  categoriaTouched: boolean,
): number | null {
  if (esEdicion || categoriaTouched) return null;

  const normalizada = descripcion.trim().toLowerCase();
  if (!normalizada) return null;

  const coincidencia = suggestions.find(
    (s) => s.descripcion.trim().toLowerCase() === normalizada,
  );
  const userCategoryId = coincidencia?.user_category_id ?? null;
  if (userCategoryId === null) return null;

  return categoriasDisponibles.some((c) => c.id === userCategoryId)
    ? userCategoryId
    : null;
}
