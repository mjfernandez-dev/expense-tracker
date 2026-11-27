import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Un editor o script que lea UTF-8 como Windows-1252 y vuelva a guardarlo
// deja "CategorÃ­a" en vez de "Categoría", y rompe los emojis. Ningún fuente
// debería tener esos patrones: el texto de la UI se escribe directo en UTF-8.
const MOJIBAKE = new RegExp('[ÃÂð]|\\uFFFD|â€');
const EXTENSIONES = ['.ts', '.tsx'];

function archivosFuente(directorio) {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosFuente(ruta);
    return EXTENSIONES.some((extension) => entrada.name.endsWith(extension)) ? [ruta] : [];
  });
}

describe('codificación de los fuentes', () => {
  it('no guarda texto UTF-8 doble codificado', () => {
    const culpables = archivosFuente(join(process.cwd(), 'src')).filter((archivo) =>
      MOJIBAKE.test(readFileSync(archivo, 'utf8')),
    );

    expect(culpables).toEqual([]);
  });
});
