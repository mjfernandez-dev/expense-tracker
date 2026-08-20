import type { UserCategory } from '../types';

export interface CategoriaPresupuestoSugerida {
  user_category_id: number;
  nombre: string;
  monto: string;
  activa: boolean;
}

export function mapearSugerenciasPresupuesto(
  categorias: UserCategory[],
  maximosHistoricos: Record<number, number>,
): CategoriaPresupuestoSugerida[] {
  return categorias.map((categoria) => {
    const montoPlantilla = Number(categoria.monto_default ?? 0);
    if (categoria.tiene_monto_fijo && montoPlantilla > 0) {
      return {
        user_category_id: categoria.id,
        nombre: categoria.nombre,
        monto: String(montoPlantilla),
        activa: true,
      };
    }

    const maximoHistorico = Number(maximosHistoricos[categoria.id] ?? 0);
    if (maximoHistorico > 0) {
      return {
        user_category_id: categoria.id,
        nombre: categoria.nombre,
        monto: String(maximoHistorico),
        activa: true,
      };
    }

    return {
      user_category_id: categoria.id,
      nombre: categoria.nombre,
      monto: '',
      activa: false,
    };
  });
}
