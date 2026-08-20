import type { Ciclo } from '../types';
import { updateCiclo } from './api';

const redondear1 = (numero: number) => Math.round(numero * 10) / 10;

export function calcularPorcentajeAhorro(monto: number, ingresos: number): number {
  if (ingresos <= 0 || Number.isNaN(monto)) return 0;
  return Math.min(100, redondear1((monto / ingresos) * 100));
}

export function calcularMontoAhorro(porcentaje: number, ingresos: number): number {
  if (Number.isNaN(porcentaje)) return 0;
  return Math.round((ingresos * porcentaje) / 100);
}

export function guardarAhorroCiclo(cicloId: number, ahorroObjetivo: number): Promise<Ciclo> {
  return updateCiclo(cicloId, { ahorro_objetivo: ahorroObjetivo });
}
