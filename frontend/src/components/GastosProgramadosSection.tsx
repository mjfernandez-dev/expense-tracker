// Sección "Gastos programados" de la Plantilla: gestión de deudas en cuotas.
// Lista las cuotas pendientes agrupadas por producto, permite dar de alta una
// serie (solo las cuotas restantes) y pagar lo del ciclo con un toque ("Pagar
// mes", el pago único del resumen). El backend reserva/ejecuta los items.
import { useCallback, useEffect, useState } from 'react';
import type { Category, Ciclo, GastoProgramado, UserCategory } from '../types';
import {
  cancelarGastoProgramado,
  crearSerieGastoProgramado,
  getCategories,
  getGastosProgramados,
  pagarMesGastosProgramados,
} from '../services/api';

interface GastosProgramadosSectionProps {
  /** Categorías personalizadas (del PresupuestoManager) para el alta */
  userCategories: UserCategory[];
  /** Ciclo activo: define qué cuotas abarca el botón "Pagar mes" */
  cicloActivo: Ciclo | null;
  /** El padre re-carga ciclo activo y categorías tras cada mutación exitosa */
  onCambios: () => void;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatFechaCorta = (s: string) =>
  new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

const fechaHoyLocal = () => new Date().toLocaleDateString('en-CA');

// Clave de agrupación: las cuotas llevan "Producto — cuota n/total";
// los programados sin cuota se agrupan por su descripción entera.
const productoDe = (gp: GastoProgramado) => {
  const i = gp.descripcion.indexOf(' — cuota ');
  return i > 0 ? gp.descripcion.slice(0, i) : gp.descripcion;
};

interface SerieFormState {
  producto: string;
  importe: string;
  cuotaInicial: string;
  cuotaTotal: string;
  primerVencimiento: string;
  categoria: string; // "u:<id>" personalizada | "s:<id>" sistema | ""
}

const FORM_INICIAL: SerieFormState = {
  producto: '',
  importe: '',
  cuotaInicial: '',
  cuotaTotal: '',
  primerVencimiento: '',
  categoria: '',
};

export default function GastosProgramadosSection({
  userCategories,
  cicloActivo,
  onCambios,
}: GastosProgramadosSectionProps) {
  const [pendientes, setPendientes] = useState<GastoProgramado[]>([]);
  const [categoriasSistema, setCategoriasSistema] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [altaAbierta, setAltaAbierta] = useState<boolean>(false);
  const [form, setForm] = useState<SerieFormState>({ ...FORM_INICIAL });
  const [guardandoSerie, setGuardandoSerie] = useState<boolean>(false);

  // "Pagar mes" en dos pasos: primer toque arma la confirmación, segundo paga
  const [pagarMesArmado, setPagarMesArmado] = useState<boolean>(false);
  const [pagandoMes, setPagandoMes] = useState<boolean>(false);

  const cargarPendientes = useCallback(async () => {
    try {
      const data = await getGastosProgramados({ estado: 'pendiente' });
      setPendientes(data);
    } catch {
      setError('No se pudieron cargar las cuotas pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cargar = async () => {
      try {
        const sistema = await getCategories();
        setCategoriasSistema(sistema);
      } catch {
        // Sin categorías de sistema el alta solo ofrece las personalizadas
      }
    };
    cargar();
  }, []);

  useEffect(() => {
    cargarPendientes();
  }, [cargarPendientes]);

  const grupos = pendientes.reduce<{ producto: string; cuotas: GastoProgramado[] }[]>((acc, gp) => {
    const producto = productoDe(gp);
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.producto === producto) {
      ultimo.cuotas.push(gp);
    } else {
      acc.push({ producto, cuotas: [gp] });
    }
    return acc;
  }, []).map(grupo => ({
    ...grupo,
    cuotas: [...grupo.cuotas].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.cuota_actual - b.cuota_actual),
  }));

  // Cuotas que abarca el pago único del resumen (vencimiento dentro del ciclo activo)
  const cuotasDelCiclo = cicloActivo
    ? pendientes.filter(gp => new Date(gp.vencimiento + 'T12:00:00') <= new Date(cicloActivo.fecha_fin + 'T12:00:00'))
    : [];
  const totalDelCiclo = cuotasDelCiclo.reduce((s, gp) => s + gp.importe, 0);

  const actualizarForm = (campo: keyof SerieFormState, valor: string) => {
    setForm(f => ({ ...f, [campo]: valor }));
  };

  const validarForm = (): string | null => {
    const importe = parseFloat(form.importe);
    if (form.producto.trim() === '') return 'Ingresá el nombre del producto.';
    if (isNaN(importe) || importe <= 0) return 'Ingresá un importe de cuota válido.';
    const inicial = parseInt(form.cuotaInicial, 10);
    const total = parseInt(form.cuotaTotal, 10);
    if (isNaN(inicial) || inicial < 1) return 'La cuota inicial debe ser 1 o más.';
    if (isNaN(total) || total < 1) return 'El total de cuotas debe ser 1 o más.';
    if (inicial > total) return 'La cuota inicial no puede superar el total.';
    if (form.primerVencimiento === '') return 'Ingresá la fecha de la primer cuota.';
    if (form.categoria === '') return 'Elegí una categoría para las cuotas.';
    return null;
  };

  const guardarSerie = async () => {
    const problema = validarForm();
    if (problema !== null) {
      setError(problema);
      return;
    }
    setError(null);
    setGuardandoSerie(true);
    const inicial = parseInt(form.cuotaInicial, 10);
    const total = parseInt(form.cuotaTotal, 10);
    const esUser = form.categoria.startsWith('u:');
    // Las cuotas de tarjeta son consumo a crédito: queda registrado en medio_pago
    const payload = {
      producto: form.producto.trim(),
      importe: parseFloat(form.importe),
      cuota_inicial: inicial,
      cuota_total: total,
      primer_vencimiento: form.primerVencimiento,
      medio_pago: 'credito',
      ...(esUser ? { user_category_id: Number(form.categoria.slice(2)), categoria_id: null } : { categoria_id: Number(form.categoria.slice(2)), user_category_id: null }),
    };
    try {
      await crearSerieGastoProgramado(payload);
      setForm({ ...FORM_INICIAL });
      setAltaAbierta(false);
      await cargarPendientes();
      onCambios();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'No se pudo crear la serie de cuotas.');
    } finally {
      setGuardandoSerie(false);
    }
  };

  const confirmarPagarMes = async () => {
    setPagandoMes(true);
    setError(null);
    try {
      await pagarMesGastosProgramados();
      setPagarMesArmado(false);
      await cargarPendientes();
      onCambios();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'No se pudo registrar el pago del mes.');
    } finally {
      setPagandoMes(false);
    }
  };

  const cancelarCuota = async (gp: GastoProgramado) => {
    setError(null);
    try {
      await cancelarGastoProgramado(gp.id);
      await cargarPendientes();
      onCambios();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? 'No se pudo cancelar la cuota.');
    }
  };

  return (
    <section className="space-y-3" aria-label="Gastos programados">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Gastos programados</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Deudas en cuotas: cada mes se comprometen solas al iniciar el ciclo y al pagar generan el movimiento con su categoría.
          </p>
        </div>
        {cicloActivo && cuotasDelCiclo.length > 0 && (
          <button
            onClick={() => {
              if (pagandoMes) return;
              pagarMesArmado ? confirmarPagarMes() : setPagarMesArmado(true);
            }}
            disabled={pagandoMes}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex-shrink-0 ${
              pagarMesArmado || pagandoMes
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            aria-label={`Pagar mes: ${cuotasDelCiclo.length} cuotas por ${formatARS(totalDelCiclo)}`}
          >
            {pagandoMes
              ? 'Pagando…'
              : pagarMesArmado
                ? `Confirmar ${formatARS(totalDelCiclo)}`
                : `Pagar mes · ${cuotasDelCiclo.length} cuota${cuotasDelCiclo.length > 1 ? 's' : ''} · ${formatARS(totalDelCiclo)}`}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-100 ml-4" aria-label="Cerrar error">✕</button>
        </div>
      )}

      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl p-4 space-y-3">
        {loading ? (
          <p className="text-center text-slate-400 text-sm py-4">Cargando cuotas…</p>
        ) : grupos.length === 0 && !altaAbierta ? (
          <p className="text-center text-slate-400 text-sm py-4">
            Sin cuotas pendientes. Dales de alta con "Nueva serie".
          </p>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {grupos.map(grupo => {
              const resto = grupo.cuotas.reduce((s, gp) => s + gp.importe, 0);
              const cuotaInfo = grupo.cuotas[0].cuota_total;
              return (
                <div key={grupo.producto} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200 text-sm font-medium truncate">{grupo.producto}</span>
                    <span className="text-slate-400 text-xs font-mono tabular-nums whitespace-nowrap flex-shrink-0">
                      {grupo.cuotas.length} pendiente{grupo.cuotas.length > 1 ? 's' : ''} · {formatARS(resto)}
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {grupo.cuotas.map(gp => (
                      <div key={gp.id} className="flex items-center justify-between gap-2 pl-3">
                        <span className="text-slate-400 text-xs font-mono tabular-nums">
                          {cuotaInfo !== null ? `cuota ${gp.cuota_actual}/${cuotaInfo} · ` : ''}
                          {formatFechaCorta(gp.vencimiento)} · {formatARS(gp.importe)}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {gp.categoria && (
                            <span className="text-xs text-slate-500 hidden sm:inline">{gp.categoria.nombre}</span>
                          )}
                          {gp.user_category && (
                            <span className="text-xs text-slate-500 hidden sm:inline">{gp.user_category.nombre}</span>
                          )}
                          <button
                            onClick={() => cancelarCuota(gp)}
                            className="text-xs text-slate-500 hover:text-red-300 transition-colors"
                            aria-label={`Cancelar cuota ${gp.descripcion}`}
                            title="Cancelar cuota"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {altaAbierta ? (
          <form
            onSubmit={(e) => { e.preventDefault(); guardarSerie(); }}
            className="border-t border-slate-700/50 pt-3 space-y-3"
            aria-label="Nueva serie de cuotas"
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Producto</span>
                <input
                  type="text"
                  value={form.producto}
                  onChange={e => actualizarForm('producto', e.target.value)}
                  placeholder="Ej: Zapatillas"
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-400 text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Importe cuota</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.importe}
                  onChange={e => actualizarForm('importe', e.target.value)}
                  placeholder="Ej: 20000"
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-400 text-sm tabular-nums focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Primer vto.</span>
                <input
                  type="date"
                  min={fechaHoyLocal()}
                  value={form.primerVencimiento}
                  onChange={e => actualizarForm('primerVencimiento', e.target.value)}
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Cuota actual</span>
                <input
                  type="number"
                  min="1"
                  value={form.cuotaInicial}
                  onChange={e => actualizarForm('cuotaInicial', e.target.value)}
                  placeholder="Ej: 4"
                  required
                  aria-label="Cuota por la que vas"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-400 text-sm tabular-nums focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">De cuotas</span>
                <input
                  type="number"
                  min="1"
                  value={form.cuotaTotal}
                  onChange={e => actualizarForm('cuotaTotal', e.target.value)}
                  placeholder="Ej: 6"
                  required
                  aria-label="Total de cuotas"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder:text-slate-400 text-sm tabular-nums focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Categoría de las cuotas</span>
                <select
                  value={form.categoria}
                  onChange={e => actualizarForm('categoria', e.target.value)}
                  required
                  className="scheme-dark w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Elegir…</option>
                  {userCategories.length > 0 && (
                    <optgroup label="Personales">
                      {userCategories.map(cat => (
                        <option key={`u${cat.id}`} value={`u:${cat.id}`}>{cat.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                  {categoriasSistema.length > 0 && (
                    <optgroup label="Sistema">
                      {categoriasSistema.map(cat => (
                        <option key={`s${cat.id}`} value={`s:${cat.id}`}>{cat.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Cargá solo las cuotas que te faltan pagar (vas por la 3 de 6 → cuota actual 4, de 6 cuotas).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setAltaAbierta(false); setForm({ ...FORM_INICIAL }); setError(null); }}
                className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoSerie}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {guardandoSerie ? 'Creando…' : 'Crear cuotas'}
              </button>
            </div>
          </form>
        ) : (
          <div className="border-t border-slate-700/50 pt-3">
            <button
              onClick={() => { setAltaAbierta(true); setError(null); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              aria-label="Nueva serie de cuotas"
            >
              + Nueva serie
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
