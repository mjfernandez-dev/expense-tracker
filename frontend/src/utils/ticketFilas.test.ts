import { describe, expect, it } from 'vitest';

import type { TicketLeido } from '../types';
import {
  diferenciaConTotal,
  filasDesdeTicket,
  hayDescuadre,
  movimientosDesdeFilas,
  sumaFilas,
} from './ticketFilas';

const TICKET: TicketLeido = {
  comercio: 'Vea Rio IV - Shopping',
  total: 21349.13,
  subtotal: 24629.13,
  descuentos: [{ descripcion: 'OFERTA QUESO LS', importe: 3280 }],
  items: [
    {
      descripcion: 'Queso LS Cremon 280g',
      cantidad: 1,
      importe_lista: 4290,
      descuento: 1440,
      importe: 2850,
    },
    {
      descripcion: 'Banana S/E 1 Kg',
      cantidad: 0.832,
      importe_lista: 2411.97,
      descuento: 0,
      importe: 2411.97,
    },
  ],
};

describe('filasDesdeTicket', () => {
  it('arranca todos los renglones en la misma categoría', () => {
    const filas = filasDesdeTicket(TICKET, '7');

    expect(filas).toHaveLength(2);
    expect(filas.every((fila) => fila.categoriaId === '7')).toBe(true);
  });

  it('conserva el precio final y la cantidad para editarlos', () => {
    const filas = filasDesdeTicket(TICKET, '7');

    expect(filas[0].importe).toBe('2850');
    expect(filas[1].cantidad).toBe('0.832');
    expect(filas[0].importeLista).toBe(4290);
  });

  it('descarta los renglones sin importe: no pueden ser un movimiento', () => {
    const conHueco: TicketLeido = {
      ...TICKET,
      items: [...TICKET.items, { descripcion: 'Sin precio', cantidad: null, importe_lista: null, descuento: 0, importe: null }],
    };

    expect(filasDesdeTicket(conHueco, '7')).toHaveLength(2);
  });
});

describe('guard aritmético', () => {
  it('detecta que la suma no cierra con el total', () => {
    const filas = filasDesdeTicket(TICKET, '7');

    expect(sumaFilas(filas)).toBe(5261.97);
    expect(diferenciaConTotal(filas, 21349.13)).toBe(-16087.16);
    expect(hayDescuadre(filas, 21349.13)).toBe(true);
  });

  it('no marca descuadre cuando cierra', () => {
    const filas = filasDesdeTicket(TICKET, '7');

    expect(hayDescuadre(filas, 5261.97)).toBe(false);
  });

  it('tolera el ruido de redondeo', () => {
    const filas = filasDesdeTicket(TICKET, '7');

    expect(hayDescuadre(filas, 5261.98)).toBe(false);
  });

  it('sin total impreso no hay nada contra qué comparar', () => {
    expect(hayDescuadre([], null)).toBe(false);
    expect(diferenciaConTotal([], null)).toBeNull();
  });

  it('refleja el borrado de un renglón en la suma', () => {
    const filas = filasDesdeTicket(TICKET, '7');

    expect(sumaFilas(filas.slice(0, 1))).toBe(2850);
  });
});

describe('movimientosDesdeFilas', () => {
  it('un movimiento por renglón, con su categoría, cantidad y comercio', () => {
    const filas = filasDesdeTicket(TICKET, '7');
    filas[1].categoriaId = '9';

    const movimientos = movimientosDesdeFilas(filas, {
      fecha: '2026-11-26',
      comercio: TICKET.comercio,
      clasificacion: 'necesidad',
      nota: null,
    });

    expect(movimientos).toHaveLength(2);
    expect(movimientos[0]).toMatchObject({
      descripcion: 'Queso LS Cremon 280g',
      importe: 2850,
      cantidad: 1,
      user_category_id: 7,
      comercio: 'Vea Rio IV - Shopping',
      tipo: 'gasto',
      fecha: '2026-11-26T00:00:00',
      clasificacion: 'necesidad',
    });
    expect(movimientos[1].user_category_id).toBe(9);
  });

  it('acepta coma decimal escrita a mano', () => {
    const filas = filasDesdeTicket(TICKET, '7');
    filas[1].importe = '2411,5';
    filas[1].cantidad = '0,832';

    const [movimiento] = movimientosDesdeFilas(filas.slice(1), {
      fecha: '2026-11-26',
      comercio: null,
      clasificacion: null,
      nota: null,
    });

    expect(movimiento.importe).toBe(2411.5);
    expect(movimiento.cantidad).toBe(0.832);
  });
});
