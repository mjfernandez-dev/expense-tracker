import { describe, expect, it } from 'vitest';
import type { GastoNoPlanificado, PresupuestoItem, UserCategory } from '../types';
import { armarMatrizPresupuesto } from './matrizPresupuesto';

const userCat = (
  id: number,
  nombre: string,
  monto_default: number | null,
  tiene_monto_fijo: boolean = true,
): UserCategory => ({
  id,
  nombre,
  color: '#000000',
  icon: null,
  monto_default,
  tiene_monto_fijo,
});

let nextItemId = 1;
const item = (overrides: Partial<PresupuestoItem>): PresupuestoItem => {
  nextItemId += 1;
  return {
    id: nextItemId,
    ciclo_id: 1,
    categoria_id: null,
    user_category_id: null,
    monto_estimado: 0,
    monto_ejecutado: 0,
    monto_pendiente: 0,
    confirmado: true,
    descripcion: null,
    estado: 'pendiente',
    gasto_programado_id: null,
    ...overrides,
  };
};

const sin = (importe: number, overrides: Partial<GastoNoPlanificado> = {}): GastoNoPlanificado => ({
  categoria: 'Sin categoría',
  importe,
  user_category_id: null,
  categoria_id: null,
  ...overrides,
});

describe('armarMatrizPresupuesto', () => {
  it('fila completa: item con presupuesto + sugerencia y exceso detectado', () => {
    const filas = armarMatrizPresupuesto(
      [item({ user_category_id: 7, monto_estimado: 100, monto_ejecutado: 150, estado: 'parcial' })],
      [],
      [userCat(7, 'Super', 100)],
    );

    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila.userCategoryId).toBe(7);
    expect(fila.nombre).toBe('Super');
    expect(fila.presupuestado).toBe(100);
    expect(fila.ejecutado).toBe(150);
    expect(fila.sugerencia).toBe(100);
    expect(fila.tieneMontoFijo).toBe(true);
    expect(fila.excede).toBe(true);
    expect(fila.itemIds).toHaveLength(1);
  });

  it('categoría sin item pero con gasto sin comprometer: sin exceso, presupuestado null', () => {
    const filas = armarMatrizPresupuesto(
      [],
      [sin(40, { categoria: 'Salud', user_category_id: 9 })],
      [userCat(9, 'Salud', null)],
    );

    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila.userCategoryId).toBe(9);
    expect(fila.presupuestado).toBeNull();
    expect(fila.ejecutado).toBe(0);
    expect(fila.sinComprometer).toBe(40);
    expect(fila.excede).toBe(false);
  });

  it('item de categoría del sistema sin sugerencia: no excede si no hay item', () => {
    const filas = armarMatrizPresupuesto([], [sin(30, { categoria: 'Transporte', categoria_id: 3 })], []);

    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila.userCategoryId).toBeNull();
    expect(fila.categoriaId).toBe(3);
    expect(fila.nombre).toBe('Transporte');
    expect(fila.sugerencia).toBeNull();
    expect(fila.sinComprometer).toBe(30);
    expect(fila.excede).toBe(false);
  });

  it('agrupa múltiples items y gastos de la misma categoría sin duplicar filas', () => {
    const filas = armarMatrizPresupuesto(
      [
        item({ user_category_id: 7, monto_estimado: 100, monto_ejecutado: 80 }),
        item({ user_category_id: 7, monto_estimado: 50, monto_ejecutado: 20 }),
      ],
      [sin(15, { categoria: 'Super', user_category_id: 7 })],
      [userCat(7, 'Super', 120)],
    );

    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila.presupuestado).toBe(150);
    expect(fila.ejecutado).toBe(100);
    expect(fila.sinComprometer).toBe(15);
    expect(fila.itemIds).toHaveLength(2);
    expect(fila.excede).toBe(false);
  });

  it('categorías sin actividad siguen en la matriz (default gestionable)', () => {
    const filas = armarMatrizPresupuesto(
      [],
      [],
      [userCat(7, 'Super', 100), userCat(9, 'Salud', null, false)],
    );

    const superFila = filas.find(f => f.nombre === 'Super');
    const saludFila = filas.find(f => f.nombre === 'Salud');
    expect(superFila?.presupuestado).toBeNull();
    expect(superFila?.sugerencia).toBe(100);
    expect(saludFila?.tieneMontoFijo).toBe(false);
    expect(saludFila?.sugerencia).toBeNull();
  });

  it('item ad-hoc sin categoría definida cae en fila propia por nombre', () => {
    const filas = armarMatrizPresupuesto(
      [item({ descripcion: 'Obra Social', monto_estimado: 60, monto_ejecutado: 60 })],
      [],
      [],
    );

    expect(filas).toHaveLength(1);
    const fila = filas[0];
    expect(fila.userCategoryId).toBeNull();
    expect(fila.categoriaId).toBeNull();
    expect(fila.nombre).toBe('Obra Social');
    expect(fila.presupuestado).toBe(60);
  });
});
