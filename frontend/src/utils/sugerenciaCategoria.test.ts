import { describe, expect, it } from 'vitest';

import type { DescripcionSuggestion } from '../services/api';
import type { UserCategory } from '../types';
import { obtenerCategoriaSugerida } from './sugerenciaCategoria';

function sugerencia(overrides: Partial<DescripcionSuggestion> = {}): DescripcionSuggestion {
  return {
    descripcion: 'Supermercado',
    frecuencia: 3,
    user_category_id: 1,
    categoria_id: null,
    ...overrides,
  };
}

function categoria(overrides: Partial<UserCategory> = {}): UserCategory {
  return {
    id: 1,
    nombre: 'Alimentación',
    color: '#000000',
    icon: null,
    ...overrides,
  };
}

describe('obtenerCategoriaSugerida', () => {
  it('aplica la categoría sugerida ante un match exacto', () => {
    expect(
      obtenerCategoriaSugerida('Supermercado', [sugerencia()], [categoria()], false, false),
    ).toBe(1);
  });

  it('aplica ante diferencias de caso y espacios (trim + case-insensitive)', () => {
    expect(
      obtenerCategoriaSugerida('  supermercado  ', [sugerencia()], [categoria()], false, false),
    ).toBe(1);
  });

  it('no sugiere ante un match parcial ni una descripción sin historial', () => {
    expect(
      obtenerCategoriaSugerida('super', [sugerencia()], [categoria()], false, false),
    ).toBeNull();
    expect(
      obtenerCategoriaSugerida('Primera vez', [sugerencia()], [categoria()], false, false),
    ).toBeNull();
  });

  it('no sugiere si el usuario tocó la categoría manualmente', () => {
    expect(
      obtenerCategoriaSugerida('Supermercado', [sugerencia()], [categoria()], false, true),
    ).toBeNull();
  });

  it('nunca sugiere en modo edición', () => {
    expect(
      obtenerCategoriaSugerida('Supermercado', [sugerencia()], [categoria()], true, false),
    ).toBeNull();
  });

  it('trata campos ausentes (undefined/null) como sin sugerencia', () => {
    const sinCampos: DescripcionSuggestion = { descripcion: 'Supermercado', frecuencia: 3 };
    expect(
      obtenerCategoriaSugerida('Supermercado', [sinCampos], [categoria()], false, false),
    ).toBeNull();
    expect(
      obtenerCategoriaSugerida(
        'Supermercado',
        [sugerencia({ user_category_id: null })],
        [categoria()],
        false,
        false,
      ),
    ).toBeNull();
  });

  it('no sugiere un id que no está en la lista de categorías disponibles', () => {
    expect(
      obtenerCategoriaSugerida('Supermercado', [sugerencia({ user_category_id: 99 })], [categoria()], false, false),
    ).toBeNull();
  });

  it('no sugiere con sugerencias vacías (offline / fallo de red)', () => {
    expect(
      obtenerCategoriaSugerida('Supermercado', [], [categoria()], false, false),
    ).toBeNull();
  });
});
