// Rango de fechas (YYYY-MM-DD) que cubre un mes completo, para acotar la consulta
// al backend. El backend filtra `fecha >= fecha_desde` y `fecha < fecha_hasta + 1 día`,
// así que `fechaHasta` es el último día del mes (inclusivo).
//
// Toda la aritmética es UTC a propósito: `new Date('YYYY-MM-DD')` se parsea como UTC
// pero `new Date(y, m, d)` se parsea en hora local, y el resultado cambiaría según la
// zona del browser. El backend guarda timestamps naive en hora de Buenos Aires, así que
// el día del mes tiene que ser exactamente el que dice el calendario.

export interface MonthRange {
  /** Primer día del mes, inclusive. */
  fechaDesde: string;
  /** Último día del mes, inclusive. */
  fechaHasta: string;
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Rango inclusivo de un mes. `month` es 0-indexado, igual que `Date.getMonth()`.
 *
 * El día 0 del mes siguiente es, por definición, el último día del mes pedido: eso
 * resuelve los meses de 31, los de 30 y febrero bisiesto o no sin tablas ni condicionales.
 */
export function monthRange(year: number, month: number): MonthRange {
  return {
    fechaDesde: formatUtcDate(new Date(Date.UTC(year, month, 1))),
    fechaHasta: formatUtcDate(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/** ¿Cae la fecha de un movimiento dentro del rango (comparación lexicográfica de YYYY-MM-DD)? */
export function isDateInMonthRange(fecha: string, rango: MonthRange): boolean {
  const dia = fecha.slice(0, 10);
  return dia >= rango.fechaDesde && dia <= rango.fechaHasta;
}
