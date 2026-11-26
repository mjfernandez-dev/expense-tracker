// El detalle del ticket necesita centavos: el formateador del dashboard los
// redondea a cero y aca se perderia informacion.
const formatoImporte = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearImporte(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 's/d';
  return `$${formatoImporte.format(valor)}`;
}
