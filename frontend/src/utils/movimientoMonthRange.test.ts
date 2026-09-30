import { describe, expect, it } from 'vitest';

import { monthRange, isDateInMonthRange } from './movimientoMonthRange';

describe('monthRange', () => {
  it('cubre los meses de 31 días', () => {
    expect(monthRange(2026, 0)).toEqual({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
    expect(monthRange(2026, 2)).toEqual({ fechaDesde: '2026-03-01', fechaHasta: '2026-03-31' });
    expect(monthRange(2026, 4)).toEqual({ fechaDesde: '2026-05-01', fechaHasta: '2026-05-31' });
    expect(monthRange(2026, 6)).toEqual({ fechaDesde: '2026-07-01', fechaHasta: '2026-07-31' });
    expect(monthRange(2026, 7)).toEqual({ fechaDesde: '2026-08-01', fechaHasta: '2026-08-31' });
    expect(monthRange(2026, 9)).toEqual({ fechaDesde: '2026-10-01', fechaHasta: '2026-10-31' });
    expect(monthRange(2026, 11)).toEqual({ fechaDesde: '2026-12-01', fechaHasta: '2026-12-31' });
  });

  it('cubre los meses de 30 días', () => {
    expect(monthRange(2026, 3)).toEqual({ fechaDesde: '2026-04-01', fechaHasta: '2026-04-30' });
    expect(monthRange(2026, 5)).toEqual({ fechaDesde: '2026-06-01', fechaHasta: '2026-06-30' });
    expect(monthRange(2026, 8)).toEqual({ fechaDesde: '2026-09-01', fechaHasta: '2026-09-30' });
    expect(monthRange(2026, 10)).toEqual({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-30' });
    expect(monthRange(2024, 10)).toEqual({ fechaDesde: '2024-11-01', fechaHasta: '2024-11-30' });
  });

  it('devuelve 29 días en febrero de un año bisiesto', () => {
    expect(monthRange(2024, 1)).toEqual({ fechaDesde: '2024-02-01', fechaHasta: '2024-02-29' });
    expect(monthRange(2020, 1)).toEqual({ fechaDesde: '2020-02-01', fechaHasta: '2020-02-29' });
  });

  it('devuelve 28 días en febrero de un año no bisiesto', () => {
    expect(monthRange(2026, 1)).toEqual({ fechaDesde: '2026-02-01', fechaHasta: '2026-02-28' });
    expect(monthRange(2025, 1)).toEqual({ fechaDesde: '2025-02-01', fechaHasta: '2025-02-28' });
    expect(monthRange(1900, 1)).toEqual({ fechaDesde: '1900-02-01', fechaHasta: '1900-02-28' });
  });

  it('cierra diciembre el 31 sin desbordar al año siguiente', () => {
    expect(monthRange(2026, 11)).toEqual({ fechaDesde: '2026-12-01', fechaHasta: '2026-12-31' });
  });

  it('abre enero el 1 sin retroceder al año anterior', () => {
    expect(monthRange(2026, 0)).toEqual({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' });
  });

  it('anda igual con independencia de la zona horaria del proceso', () => {
    // El helper usa aritmética UTC: los valores no dependen de TZ.
    expect(monthRange(2026, 1)).toEqual({ fechaDesde: '2026-02-01', fechaHasta: '2026-02-28' });
    expect(monthRange(2024, 1)).toEqual({ fechaDesde: '2024-02-01', fechaHasta: '2024-02-29' });
  });
});

describe('isDateInMonthRange', () => {
  const febrero = monthRange(2024, 1);

  it('incluye el primer y el último día del mes', () => {
    expect(isDateInMonthRange('2024-02-01T00:00:00', febrero)).toBe(true);
    expect(isDateInMonthRange('2024-02-29T23:59:59', febrero)).toBe(true);
  });

  it('excluye los días contiguos', () => {
    expect(isDateInMonthRange('2024-01-31T23:59:59', febrero)).toBe(false);
    expect(isDateInMonthRange('2024-03-01T00:00:00', febrero)).toBe(false);
  });

  it('excluye un 29 de febrero en un año no bisiesto', () => {
    expect(isDateInMonthRange('2026-02-29', monthRange(2026, 1))).toBe(false);
  });
});
