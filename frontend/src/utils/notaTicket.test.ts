import { describe, expect, it } from 'vitest';

import type { TicketDescuentoLeido, TicketItemLeido } from '../types';
import { formatearImporte, formatearNotaTicket } from './notaTicket';

const ITEMS: TicketItemLeido[] = [
  { descripcion: 'Leche Uat Proteina 1l', cantidad: 1, importe: 2993 },
  { descripcion: 'Banana S/E 1 Kg', cantidad: 0.832, importe: 2411.97 },
];

const DESCUENTOS: TicketDescuentoLeido[] = [
  { descripcion: 'OFERTA QUESO LS', importe: 1440 },
];

describe('formatearImporte', () => {
  it('conserva los centavos y usa formato argentino', () => {
    expect(formatearImporte(21349.13)).toBe('$21.349,13');
    expect(formatearImporte(2993)).toBe('$2.993,00');
  });

  it('devuelve s/d cuando no hay importe', () => {
    expect(formatearImporte(null)).toBe('s/d');
    expect(formatearImporte(undefined)).toBe('s/d');
  });
});

describe('formatearNotaTicket', () => {
  it('arma encabezado, items, descuentos y total', () => {
    const nota = formatearNotaTicket('Vea Rio IV - Shopping', ITEMS, DESCUENTOS, 21349.13);

    expect(nota.split('\n')).toEqual([
      'Vea Rio IV - Shopping',
      'Leche Uat Proteina 1l — $2.993,00',
      'Banana S/E 1 Kg x0,832 — $2.411,97',
      'OFERTA QUESO LS — -$1.440,00',
      'Total — $21.349,13',
    ]);
  });

  it('omite el encabezado si no hay comercio', () => {
    const nota = formatearNotaTicket(null, ITEMS, [], 21349.13);

    expect(nota.startsWith('Leche')).toBe(true);
  });

  it('refleja el borrado de un item', () => {
    const nota = formatearNotaTicket('Vea', [ITEMS[0]], DESCUENTOS, 21349.13);

    expect(nota).not.toContain('Banana');
    expect(nota).toContain('Leche');
  });
});
