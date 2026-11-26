import type { MovimientoCreate, TicketLeido } from '../types';

/** Un renglón en revisión: se convierte en un movimiento al confirmar el ticket. */
export interface FilaTicket {
  descripcion: string;
  cantidad: string; // se edita como texto para no pelear con el input
  importe: string;
  importeLista: number | null; // precio impreso, para mostrar el descuento
  categoriaId: string;
}

/** Diferencia contra el total por debajo de esto es redondeo, no un renglón perdido. */
export const TOLERANCIA_DESCUADRE = 0.05;

function aNumero(valor: string): number {
  const numero = Number(valor.replace(',', '.'));
  return Number.isFinite(numero) ? numero : 0;
}

export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Filas iniciales a partir de lo que devolvió el lector.
 *
 * Todos arrancan en la misma categoría (S2). Un renglón sin importe no puede
 * ser un movimiento, así que no entra: la diferencia contra el total queda
 * visible en el guard en vez de esconderse.
 */
export function filasDesdeTicket(ticket: TicketLeido, categoriaDefault: string): FilaTicket[] {
  return ticket.items
    .filter((item) => item.importe !== null && item.importe > 0)
    .map((item) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad === null ? '' : String(item.cantidad),
      importe: String(item.importe),
      importeLista: item.importe_lista,
      categoriaId: categoriaDefault,
    }));
}

export function sumaFilas(filas: FilaTicket[]): number {
  return centavos(filas.reduce((total, fila) => total + aNumero(fila.importe), 0));
}

/** Lo que falta (negativo) o sobra (positivo) contra el total del ticket. */
export function diferenciaConTotal(filas: FilaTicket[], total: number | null): number | null {
  if (total === null) return null;
  return centavos(sumaFilas(filas) - total);
}

export function hayDescuadre(filas: FilaTicket[], total: number | null): boolean {
  const diferencia = diferenciaConTotal(filas, total);
  return diferencia !== null && Math.abs(diferencia) >= TOLERANCIA_DESCUADRE;
}

/**
 * Convierte las filas en movimientos de un lote.
 *
 * La fecha la elige el humano y aplica a todos los renglones (S8). El comercio
 * va en su propia columna, no dentro de la descripción.
 */
export function movimientosDesdeFilas(
  filas: FilaTicket[],
  opciones: {
    fecha: string;
    comercio: string | null;
    clasificacion: 'necesidad' | 'deseo' | null;
    nota: string | null;
  },
): MovimientoCreate[] {
  return filas.map((fila) => ({
    importe: aNumero(fila.importe),
    fecha: `${opciones.fecha}T00:00:00`,
    descripcion: fila.descripcion,
    nota: opciones.nota,
    tipo: 'gasto',
    categoria_id: null,
    user_category_id: Number(fila.categoriaId) || null,
    cantidad: aNumero(fila.cantidad) || null,
    comercio: opciones.comercio,
    clasificacion: opciones.clasificacion,
  }));
}
