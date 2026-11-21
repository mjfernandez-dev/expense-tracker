import { describe, expect, it } from 'vitest';

import type { CicloResumen, GastoNoPlanificado, PresupuestoItem } from '../types';
import { calcularProgresoCategoria } from './progresoCategoria';

type Categoria = { categoria_id: number | null; user_category_id: number | null };

const item = (overrides: Partial<PresupuestoItem> = {}): PresupuestoItem => ({
  id: 1,
  ciclo_id: 9,
  categoria_id: null,
  user_category_id: 3,
  monto_estimado: 100_000,
  monto_ejecutado: 30_000,
  monto_pendiente: 70_000,
  confirmado: true,
  descripcion: 'Delivery',
  estado: 'parcial',
  gasto_programado_id: null,
  ...overrides,
});

const suelto = (overrides: Partial<GastoNoPlanificado> = {}): GastoNoPlanificado => ({
  categoria: 'Delivery',
  importe: 0,
  user_category_id: 3,
  categoria_id: null,
  ...overrides,
});

const resumen = (overrides: Partial<CicloResumen> = {}): CicloResumen => ({
  ciclo_id: 9,
  fecha_inicio: '2026-11-01T00:00:00',
  fecha_fin: '2026-11-30T00:00:00',
  dias_restantes: 10,
  total_ingresos: 1_000_000,
  ahorro_objetivo: 100_000,
  gastos_fijos_confirmados: 0,
  gastos_fijos_pendientes: 0,
  gastos_fijos_efectivizados: 0,
  saldo_disponible_total: 900_000,
  total_gastos: 130_000,
  gastos_no_planificados: 0,
  saldo_disponible_actual: 900_000,
  daily_cap: 90_000,
  gasto_hoy: 0,
  daily_cap_porcentaje_usado: 0,
  semaforo: 'verde',
  presupuesto_items: [item()],
  gastos_fijos: [],
  gastos_sin_presupuesto: [],
  clasificacion_importes: { necesidad: 0, deseo: 0, sin_clasificar: 0 },
  comparacion_anterior: null,
  ...overrides,
});

const categoria: Categoria = { categoria_id: null, user_category_id: 3 };
const HOY = '2026-11-20';
const FECHA_DE_HOY = '2026-11-20T00:00:00';

describe('progreso de la categoría de un movimiento recién cargado', () => {
  it('usa el ejecutado del item de presupuesto de la categoría', () => {
    expect(calcularProgresoCategoria(resumen(), categoria, FECHA_DE_HOY, HOY)).toEqual({
      tipo: 'con_presupuesto',
      gastado: 30_000,
      estimado: 100_000,
      excedido: 0,
      porcentaje: 30,
    });
  });

  it('suma los gastos sueltos de la misma categoría aunque la fila traiga otro nombre', () => {
    const r = resumen({
      gastos_sin_presupuesto: [
        suelto({ categoria: 'Delivery', importe: 5_000 }),
        suelto({ categoria: 'Otro nombre', importe: 2_500, user_category_id: 3 }),
        suelto({ categoria: 'Delivery', importe: 9_000, user_category_id: 4 }),
      ],
    });

    expect(calcularProgresoCategoria(r, categoria, FECHA_DE_HOY, HOY)).toMatchObject({
      tipo: 'con_presupuesto',
      gastado: 37_500,
    });
  });

  it('expone el excedido en vez de recortar el gasto al presupuesto', () => {
    const r = resumen({
      presupuesto_items: [item({ monto_ejecutado: 100_000, monto_pendiente: 0, estado: 'efectivizado' })],
      gastos_sin_presupuesto: [suelto({ importe: 3_000 })],
    });

    expect(calcularProgresoCategoria(r, categoria, FECHA_DE_HOY, HOY)).toEqual({
      tipo: 'con_presupuesto',
      gastado: 103_000,
      estimado: 100_000,
      excedido: 3_000,
      porcentaje: 100,
    });
  });

  it('muestra solo lo gastado cuando la categoría no tiene presupuesto', () => {
    const r = resumen({
      presupuesto_items: [],
      gastos_sin_presupuesto: [suelto({ importe: 12_500 })],
    });

    expect(calcularProgresoCategoria(r, categoria, FECHA_DE_HOY, HOY)).toEqual({
      tipo: 'sin_presupuesto',
      gastado: 12_500,
    });
  });

  it('muestra lo gastado cuando el item de la categoría no está confirmado', () => {
    const r = resumen({
      presupuesto_items: [item({ confirmado: false })],
      gastos_sin_presupuesto: [suelto({ importe: 8_000 })],
    });

    expect(calcularProgresoCategoria(r, categoria, FECHA_DE_HOY, HOY)).toEqual({
      tipo: 'sin_presupuesto',
      gastado: 8_000,
    });
  });

  it('ignora las reservas de gastos programados al calcular el presupuesto de la categoría', () => {
    const r = resumen({
      presupuesto_items: [
        item({ id: 2, monto_estimado: 500_000, monto_ejecutado: 400_000, gasto_programado_id: 77 }),
      ],
    });

    expect(calcularProgresoCategoria(r, categoria, FECHA_DE_HOY, HOY)).toEqual({
      tipo: 'sin_presupuesto',
      gastado: 0,
    });
  });

  it.each([
    ['un gasto anterior al inicio del ciclo', '2026-10-31T00:00:00'],
    ['un gasto con fecha futura dentro del ciclo', '2026-11-25T00:00:00'],
  ])('no atribuye %s', (_caso, fecha) => {
    expect(calcularProgresoCategoria(resumen(), categoria, fecha, HOY)).toEqual({
      tipo: 'fuera_de_ciclo',
    });
  });

  it('matchea por categoría del sistema cuando no hay categoría personalizada', () => {
    const r = resumen({
      presupuesto_items: [item({ user_category_id: null, categoria_id: 7 })],
      gastos_sin_presupuesto: [suelto({ user_category_id: null, categoria_id: 7, importe: 1_000 })],
    });

    expect(calcularProgresoCategoria(r, { categoria_id: 7, user_category_id: null }, FECHA_DE_HOY, HOY)).toEqual({
      tipo: 'con_presupuesto',
      gastado: 31_000,
      estimado: 100_000,
      excedido: 0,
      porcentaje: 31,
    });
  });

  it('informa la falta de ciclo activo', () => {
    expect(calcularProgresoCategoria(null, categoria, FECHA_DE_HOY, HOY)).toEqual({ tipo: 'sin_ciclo' });
  });
});
