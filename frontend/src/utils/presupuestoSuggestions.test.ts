import { describe, expect, it } from 'vitest';

import type { UserCategory } from '../types';
import { mapearSugerenciasPresupuesto } from './presupuestoSuggestions';

function categoria(overrides: Partial<UserCategory> = {}): UserCategory {
  return {
    id: 1,
    nombre: 'Alimentación',
    color: '#000000',
    icon: null,
    ...overrides,
  };
}

describe('mapearSugerenciasPresupuesto', () => {
  it.each([
    ['menor', 300, 200],
    ['mayor', 300, 500],
    ['inexistente', 300, undefined],
  ])('prioriza la plantilla activa ante un histórico %s', (_caso, montoDefault, maximoHistorico) => {
    const resultado = mapearSugerenciasPresupuesto(
      [categoria({ monto_default: montoDefault, tiene_monto_fijo: true })],
      maximoHistorico === undefined ? {} : { 1: maximoHistorico },
    );

    expect(resultado).toEqual([
      { user_category_id: 1, nombre: 'Alimentación', monto: '300', activa: true },
    ]);
  });

  it.each([
    ['deshabilitada', { monto_default: 300, tiene_monto_fijo: false }],
    ['ausente', {}],
    ['sin monto', { monto_default: null, tiene_monto_fijo: true }],
    ['monto cero', { monto_default: 0, tiene_monto_fijo: true }],
  ])('usa el máximo histórico con una plantilla %s', (_caso, plantilla) => {
    const resultado = mapearSugerenciasPresupuesto([categoria(plantilla)], { 1: 450 });

    expect(resultado[0]).toEqual({
      user_category_id: 1,
      nombre: 'Alimentación',
      monto: '450',
      activa: true,
    });
  });

  it('deja inactiva y vacía una categoría sin plantilla válida ni histórico', () => {
    const resultado = mapearSugerenciasPresupuesto(
      [categoria({ monto_default: 0, tiene_monto_fijo: true })],
      {},
    );

    expect(resultado[0]).toEqual({
      user_category_id: 1,
      nombre: 'Alimentación',
      monto: '',
      activa: false,
    });
  });

  it('mantiene el orden y calcula cada categoría de forma independiente', () => {
    const categorias = [
      categoria({ id: 3, nombre: 'Tercera', monto_default: 150, tiene_monto_fijo: true }),
      categoria({ id: 1, nombre: 'Primera' }),
      categoria({ id: 2, nombre: 'Segunda' }),
    ];

    expect(mapearSugerenciasPresupuesto(categorias, { 1: 250 })).toEqual([
      { user_category_id: 3, nombre: 'Tercera', monto: '150', activa: true },
      { user_category_id: 1, nombre: 'Primera', monto: '250', activa: true },
      { user_category_id: 2, nombre: 'Segunda', monto: '', activa: false },
    ]);
  });
});
