/** Storage key for the "hide amounts" preference of the cycle dashboard. */
export const MONTOS_OCULTOS_KEY = 'finanzaapp.montosOcultos';

/** Text shown instead of a money amount while amounts are hidden. */
export const MONTO_OCULTO = '$ ••••••';

const formatoARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** Formats an amount in ARS, or the mask when amounts are hidden. */
export function formatARSOcultable(n: number, oculto: boolean): string {
  return oculto ? MONTO_OCULTO : formatoARS.format(n);
}

/**
 * Persisted preference for the cycle dashboard.
 * Missing, unknown, or unreadable storage means amounts stay visible.
 */
export function leerMontosOcultos(storage: Pick<Storage, 'getItem'> | null): boolean {
  if (storage === null) return false;
  try {
    return storage.getItem(MONTOS_OCULTOS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Best-effort persist: a failing storage never breaks the toggle. */
export function guardarMontosOcultos(
  storage: Pick<Storage, 'setItem'> | null,
  oculto: boolean,
): void {
  if (storage === null) return;
  try {
    storage.setItem(MONTOS_OCULTOS_KEY, oculto ? '1' : '0');
  } catch {
    // Private mode or quota errors: the preference just does not persist.
  }
}
