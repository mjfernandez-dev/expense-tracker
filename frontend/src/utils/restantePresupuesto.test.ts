import { describe, it, expect } from 'vitest';
import { restantePresupuesto, restantePresupuestoConfirmado } from './restantePresupuesto';
import type { PresupuestoItem } from '../types';

function item(
  id: number,
  monto_estimado: number,
  monto_ejecutado: number,
  confirmado = true,
): PresupuestoItem {
  return {
    id,
    ciclo_id: 1,
    categoria_id: null,
    user_category_id: null,
    monto_estimado,
    monto_ejecutado,
    monto_pendiente: 0,
    confirmado,
    descripcion: null,
    estado: 'parcial',
  };
}

describe('restantePresupuesto', () => {
  it('solo suma restos de items no sobrepasados; un item sobrepasado aporta 0', () => {
    const items = [
      item(1, 300_000, 400_000), // sobrepasado -> 0
      item(2, 250_000, 100_000), // reste 150.000
      item(3, 111_475, 234_275), // sobrepasado -> 0
    ];
    expect(restantePresupuesto(items)).toBe(150_000);
  });

  it('devuelve la suma total cuando nada excede el presupuesto', () => {
    const items = [
      item(1, 100_000, 60_000),
      item(2, 100_000, 40_000),
      item(3, 50_000, 0),
    ];
    expect(restantePresupuesto(items)).toBe(150_000);
  });

  it('items sin confirmar no se incluyen', () => {
    const items = [
      item(1, 100_000, 0),
      item(2, 100_000, 0, false),
    ];
    expect(restantePresupuestoConfirmado(items)).toBe(100_000);
  });

  it('lista vacia -> 0', () => {
    expect(restantePresupuestoConfirmado([])).toBe(0);
  });
});
