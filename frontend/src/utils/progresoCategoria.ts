import type { CicloResumen } from '../types';

// Progreso, para una categoría concreta, del ciclo activo. Se alimenta del
// resumen que ya calcula el backend (calcular_resumen): el frontend no
// recalcula totales por su cuenta.
//
// Definición de "presupuesto de la categoría": items confirmados y ordinarios
// (los de gasto_programado_id NULL). Las reservas de gastos programados son su
// propia bolsa y se muestran en el tab de Presupuesto, no acá.
//
// "Gastado" = ejecutado de esos items + las filas de gastos_sin_presupuesto de
// la misma categoría. El backend ya agrupa ahí los gastos sin vínculo y el
// exceso de los items que superaron su monto_estimado, así que sumar ambas
// fuentes no duplica nada.

export interface CategoriaMovimiento {
  categoria_id: number | null;
  user_category_id: number | null;
}

export type ProgresoCategoria =
  | { tipo: 'sin_ciclo' }
  | { tipo: 'fuera_de_ciclo' }
  | { tipo: 'sin_presupuesto'; gastado: number }
  | {
      tipo: 'con_presupuesto';
      gastado: number;
      estimado: number;
      excedido: number;
      porcentaje: number;
    };

function _matcheaCategoria(
  fila: { categoria_id?: number | null; user_category_id?: number | null },
  categoria: CategoriaMovimiento,
): boolean {
  if (categoria.user_category_id !== null) {
    return fila.user_category_id === categoria.user_category_id;
  }
  if (categoria.categoria_id !== null) {
    return fila.user_category_id == null && fila.categoria_id === categoria.categoria_id;
  }
  return false;
}

function _soloFecha(fecha: string): string {
  return fecha.slice(0, 10);
}

/**
 * Calcula el progreso de la categoría de un movimiento recién creado.
 *
 * `fechaMovimiento` y `hoy` van en formato YYYY-MM-DD o ISO; solo se comparan
 * los primeros 10 caracteres. Un movimiento con fecha futura no entra al
 * resumen del ciclo (el backend vincula hasta min(ahora, fecha_fin)), así que
 * se reporta como fuera de ciclo en lugar de mostrar un número que no lo
 * incluye.
 */
export function calcularProgresoCategoria(
  resumen: CicloResumen | null,
  categoria: CategoriaMovimiento,
  fechaMovimiento: string,
  hoy: string,
): ProgresoCategoria {
  if (!resumen) {
    return { tipo: 'sin_ciclo' };
  }

  const fecha = _soloFecha(fechaMovimiento);
  const inicio = _soloFecha(resumen.fecha_inicio);
  const fin = _soloFecha(resumen.fecha_fin);
  if (fecha < inicio || fecha > fin || fecha > _soloFecha(hoy)) {
    return { tipo: 'fuera_de_ciclo' };
  }

  const itemsCategoria = resumen.presupuesto_items.filter(
    (item) =>
      item.confirmado &&
      item.gasto_programado_id == null &&
      _matcheaCategoria(item, categoria),
  );

  const ejecutadoItems = itemsCategoria.reduce((suma, item) => suma + item.monto_ejecutado, 0);
  const sueltos = resumen.gastos_sin_presupuesto
    .filter((fila) => _matcheaCategoria(fila, categoria))
    .reduce((suma, fila) => suma + fila.importe, 0);

  const gastado = ejecutadoItems + sueltos;
  const estimado = itemsCategoria.reduce((suma, item) => suma + item.monto_estimado, 0);

  if (estimado <= 0) {
    return { tipo: 'sin_presupuesto', gastado };
  }

  return {
    tipo: 'con_presupuesto',
    gastado,
    estimado,
    excedido: Math.max(0, gastado - estimado),
    porcentaje: Math.min(100, Math.round((gastado / estimado) * 100)),
  };
}
