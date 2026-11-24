import { describe, it, expect } from 'vitest';
import {
  MONTOS_OCULTOS_KEY,
  MONTO_OCULTO,
  formatARSOcultable,
  guardarMontosOcultos,
  leerMontosOcultos,
} from './montosOcultos';

function storageFalso(inicial: string | null = null) {
  const datos = new Map<string, string>();
  if (inicial !== null) datos.set(MONTOS_OCULTOS_KEY, inicial);
  return {
    datos,
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => {
      datos.set(clave, valor);
    },
  };
}

describe('formatARSOcultable', () => {
  it('con montos visibles formatea el importe en pesos', () => {
    expect(formatARSOcultable(1_234_567, false)).toContain('1.234.567');
    expect(formatARSOcultable(1_234_567, false)).not.toBe(MONTO_OCULTO);
  });

  it('con montos ocultos reemplaza cualquier importe por la mascara', () => {
    expect(formatARSOcultable(0, true)).toBe(MONTO_OCULTO);
    expect(formatARSOcultable(1_234_567, true)).toBe(MONTO_OCULTO);
    expect(formatARSOcultable(-201_397, true)).toBe(MONTO_OCULTO);
  });
});

describe('leerMontosOcultos', () => {
  it('sin preferencia guardada los montos quedan visibles', () => {
    expect(leerMontosOcultos(storageFalso())).toBe(false);
  });

  it('lee la preferencia guardada', () => {
    expect(leerMontosOcultos(storageFalso('1'))).toBe(true);
    expect(leerMontosOcultos(storageFalso('0'))).toBe(false);
  });

  it('un valor desconocido o un storage que falla deja los montos visibles', () => {
    expect(leerMontosOcultos(storageFalso('cualquier-cosa'))).toBe(false);
    expect(leerMontosOcultos(null)).toBe(false);
    expect(
      leerMontosOcultos({
        getItem: () => {
          throw new Error('storage bloqueado');
        },
      }),
    ).toBe(false);
  });
});

describe('guardarMontosOcultos', () => {
  it('persiste la preferencia y leerMontosOcultos la recupera', () => {
    const storage = storageFalso();
    guardarMontosOcultos(storage, true);
    expect(storage.datos.get(MONTOS_OCULTOS_KEY)).toBe('1');
    expect(leerMontosOcultos(storage)).toBe(true);

    guardarMontosOcultos(storage, false);
    expect(storage.datos.get(MONTOS_OCULTOS_KEY)).toBe('0');
    expect(leerMontosOcultos(storage)).toBe(false);
  });

  it('un storage que falla no rompe el toggle', () => {
    expect(() =>
      guardarMontosOcultos(
        {
          setItem: () => {
            throw new Error('quota excedida');
          },
        },
        true,
      ),
    ).not.toThrow();
    expect(() => guardarMontosOcultos(null, true)).not.toThrow();
  });
});
