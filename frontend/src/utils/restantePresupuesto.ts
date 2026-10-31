import type { PresupuestoItem } from '../types';

/**
 * Money still unspent within confirmed budget items, never negative.
 * An item whose execution exceeded its estimate contributes 0, because
 * the overspend is already debited elsewhere (gastos no planificados).
 */
export function restantePresupuesto(items: PresupuestoItem[]): number {
  return items.reduce((s, i) => s + Math.max(0, i.monto_estimado - i.monto_ejecutado), 0);
}

/** Same as restantePresupuesto but restricted to confirmed items. */
export function restantePresupuestoConfirmado(items: PresupuestoItem[]): number {
  return restantePresupuesto(items.filter(i => i.confirmado));
}
