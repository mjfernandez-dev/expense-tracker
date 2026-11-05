// UTIL: arma la matriz de presupuesto por categoría (Plantilla → opción B).
// Une, por id, los items confirmados del ciclo activo + los gastos sin
// presupuesto + las categorías del usuario con su sugerencia (monto_default).
// Lógica pura y testeada; el componente MatrizPresupuesto solo presenta filas.
import type { GastoNoPlanificado, PresupuestoItem, UserCategory } from '../types';

export interface FilaMatrizPresupuesto {
  /** userCategoryId = null → categoría de sistema o ítem ad-hoc */
  userCategoryId: number | null;
  categoriaId: number | null;
  clave: string;
  nombre: string;
  /** monto_default de la categoría del usuario; null si no aplica */
  sugerencia: number | null;
  tieneMontoFijo: boolean;
  /** suma de monto_estimado de los items del ciclo; null si no hay item */
  presupuestado: number | null;
  /** suma de monto_ejecutado de los items del ciclo; sin comprometer NO suma acá */
  ejecutado: number;
  /** importe de gastos sin presupuesto atribuido a la fila */
  sinComprometer: number;
  itemIds: number[];
  /** sobre-gasto real de items: ejecutado superó lo presupuestado */
  excede: boolean;
}

const _clave = (prefijo: string, id: string | number) => `${prefijo}${id}`;

function _variantes(): FilaMatrizPresupuesto {
  return {
    userCategoryId: null,
    categoriaId: null,
    clave: '',
    nombre: '',
    sugerencia: null,
    tieneMontoFijo: false,
    presupuestado: null,
    ejecutado: 0,
    sinComprometer: 0,
    itemIds: [],
    excede: false,
  };
}

export function armarMatrizPresupuesto(
  items: PresupuestoItem[],
  gastosSinPresupuesto: GastoNoPlanificado[],
  userCategories: UserCategory[],
): FilaMatrizPresupuesto[] {
  const filas = new Map<string, FilaMatrizPresupuesto>();

  const obtenerFila = (
    userCategoryId: number | null,
    categoriaId: number | null,
    nombre: string,
  ): FilaMatrizPresupuesto => {
    const clave =
      userCategoryId != null ? _clave('u', userCategoryId) :
      categoriaId != null ? _clave('c', categoriaId) :
      _clave('n', nombre);
    const existente = filas.get(clave);
    if (existente) return existente;

    const fila = _variantes();
    fila.clave = clave;
    fila.nombre = nombre;
    if (userCategoryId != null) {
      fila.userCategoryId = userCategoryId;
      const cat = userCategories.find(c => c.id === userCategoryId);
      if (cat) {
        fila.nombre = cat.nombre;
        fila.sugerencia = cat.monto_default ?? null;
        fila.tieneMontoFijo = !!cat.tiene_monto_fijo;
      }
    } else if (categoriaId != null) {
      fila.categoriaId = categoriaId;
    }
    filas.set(clave, fila);
    return fila;
  };

  // 1) Toda categoría del usuario aparece, tenga o no actividad en el ciclo
  for (const cat of userCategories) {
    const fila = obtenerFila(cat.id, null, cat.nombre);
    fila.nombre = cat.nombre;
    fila.sugerencia = cat.monto_default ?? null;
    fila.tieneMontoFijo = !!cat.tiene_monto_fijo;
  }

  // 2) Items confirmados del ciclo activo: presupuestado y ejecutado
  for (const item of items) {
    const fila = obtenerFila(item.user_category_id, item.categoria_id, item.descripcion ?? 'Sin categoría');
    fila.itemIds.push(item.id);
    fila.presupuestado = (fila.presupuestado ?? 0) + item.monto_estimado;
    fila.ejecutado += item.monto_ejecutado;
  }

  // 3) Gastos sin presupuesto, atribuidos por id (backend S5) o por nombre como fallback
  for (const gasto of gastosSinPresupuesto) {
    const fila = obtenerFila(gasto.user_category_id ?? null, gasto.categoria_id ?? null, gasto.categoria);
    fila.sinComprometer += gasto.importe;
  }

  const filasListado = [...filas.values()];
  for (const fila of filasListado) {
    fila.excede = fila.presupuestado !== null && fila.ejecutado > fila.presupuestado;
  }
  return filasListado.sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
}
