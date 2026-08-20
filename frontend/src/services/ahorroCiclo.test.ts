import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ciclo } from '../types';
import { updateCiclo, updateUserPreferences } from './api';
import {
  calcularMontoAhorro,
  calcularPorcentajeAhorro,
  guardarAhorroCiclo,
} from './ahorroCiclo';

vi.mock('./api', () => ({
  updateCiclo: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

describe('ahorro del ciclo actual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('guarda únicamente el ahorro objetivo del ciclo', async () => {
    const cicloActualizado = { id: 7, ahorro_objetivo: 25_000 } as Ciclo;
    vi.mocked(updateCiclo).mockResolvedValue(cicloActualizado);

    await expect(guardarAhorroCiclo(7, 25_000)).resolves.toBe(cicloActualizado);

    expect(updateCiclo).toHaveBeenCalledOnce();
    expect(updateCiclo).toHaveBeenCalledWith(7, { ahorro_objetivo: 25_000 });
    expect(updateUserPreferences).not.toHaveBeenCalled();
  });

  it.each([
    ['calcula el porcentaje', 25_000, 100_000, 25],
    ['redondea el porcentaje a un decimal', 10_050, 100_000, 10.1],
    ['limita el porcentaje calculado a 100', 120_000, 100_000, 100],
    ['evita dividir por cero', 25_000, 0, 0],
  ])('%s', (_caso, monto, ingresos, esperado) => {
    expect(calcularPorcentajeAhorro(monto, ingresos)).toBe(esperado);
  });

  it.each([
    ['calcula el monto', 25, 100_000, 25_000],
    ['redondea el monto a pesos', 10.05, 100_000, 10_050],
  ])('%s', (_caso, porcentaje, ingresos, esperado) => {
    expect(calcularMontoAhorro(porcentaje, ingresos)).toBe(esperado);
  });
});
