import { describe, expect, it } from 'vitest';

import { formatearImporte } from './formatoMoneda';

describe('formatearImporte', () => {
  it('conserva los centavos y usa formato argentino', () => {
    expect(formatearImporte(21349.13)).toBe('$21.349,13');
    expect(formatearImporte(2993)).toBe('$2.993,00');
  });

  it('devuelve s/d cuando no hay importe', () => {
    expect(formatearImporte(null)).toBe('s/d');
    expect(formatearImporte(undefined)).toBe('s/d');
  });
});
