import type { TicketDescuentoLeido, TicketItemLeido } from '../types';

// El detalle del ticket necesita centavos: el formateador del dashboard los
// redondea a cero y aca perderia informacion.
const formatoImporte = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearImporte(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 's/d';
  return `$${formatoImporte.format(valor)}`;
}

function formatearCantidad(valor: number | null | undefined): string {
  if (!valor || valor === 1) return '';
  return ` x${String(valor).replace('.', ',')}`;
}

/**
 * Texto que va a `Movimiento.nota` a partir de lo que devolvio el lector.
 *
 * Se genera en el cliente porque la nota es el resultado de lo que el humano
 * dejo en las filas: si borra un item, el texto se regenera. El backend no
 * formatea nada, asi el formato vive en un solo lugar.
 */
export function formatearNotaTicket(
  comercio: string | null,
  items: TicketItemLeido[],
  descuentos: TicketDescuentoLeido[],
  total: number | null,
): string {
  const lineas: string[] = [];
  if (comercio) lineas.push(comercio);

  for (const item of items) {
    lineas.push(
      `${item.descripcion}${formatearCantidad(item.cantidad)} — ${formatearImporte(item.importe)}`,
    );
  }

  for (const descuento of descuentos) {
    lineas.push(`${descuento.descripcion} — -${formatearImporte(descuento.importe)}`);
  }

  lineas.push(`Total — ${formatearImporte(total)}`);
  return lineas.join('\n');
}
