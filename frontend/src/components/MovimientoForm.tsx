import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { UserCategory, MovimientoCreate, Movimiento, TicketLeido } from '../types';
import { getUserCategories, createMovimiento, createMovimientosLote, updateMovimiento, createCategory, searchDescripciones, leerTicket } from '../services/api';
import type { DescripcionSuggestion } from '../services/api';
import { getCurrentBADateInputValue } from '../utils/buenosAiresDate';
import { obtenerCategoriaSugerida } from '../utils/sugerenciaCategoria';
import { formatearImporte } from '../utils/formatoMoneda';
import {
  diferenciaConTotal,
  filasDesdeTicket,
  hayDescuadre,
  movimientosDesdeFilas,
  sumaFilas,
} from '../utils/ticketFilas';
import type { FilaTicket } from '../utils/ticketFilas';
import { getApiErrorMessage } from '../utils/apiError';

interface MovimientoFormProps {
  onMovimientoCreated: (movimiento?: Movimiento) => void;
  onMovimientoUpdated: () => void;
  movimientoToEdit?: Movimiento | null;
  onCancelEdit?: () => void;
  categoriesVersion?: number;
}

function MovimientoForm({ onMovimientoCreated, onMovimientoUpdated, movimientoToEdit, onCancelEdit, categoriesVersion }: MovimientoFormProps) {
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto');
  const [importe, setImporte] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [nota, setNota] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [fecha, setFecha] = useState<string>(getCurrentBADateInputValue());
  const [esInicioCiclo, setEsInicioCiclo] = useState<boolean>(false);
  const [clasificacion, setClasificacion] = useState<string>('');

  // Lector de tickets: con un ticket cargado el formulario pasa a ser una
  // revisión con una fila por renglón, y se guarda todo junto en un lote.
  const [ticket, setTicket] = useState<TicketLeido | null>(null);
  const [filas, setFilas] = useState<FilaTicket[]>([]);
  const [categoriaTicketId, setCategoriaTicketId] = useState<string>('');
  const [confirmoDescuadre, setConfirmoDescuadre] = useState<boolean>(false);
  const [leyendoTicket, setLeyendoTicket] = useState<boolean>(false);
  const archivoTicketRef = useRef<HTMLInputElement>(null);
  const filasRef = useRef<HTMLDivElement>(null);

  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineQueued, setOfflineQueued] = useState<boolean>(false);
  const [showNewCat, setShowNewCat] = useState<boolean>(false);
  const [newCatNombre, setNewCatNombre] = useState<string>('');
  const [savingCat, setSavingCat] = useState<boolean>(false);

  // Autocomplete de descripciones
  const [suggestions, setSuggestions] = useState<DescripcionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const suggestionListRef = useRef<HTMLUListElement>(null);
  const justSelectedRef = useRef(false);
  // Guard de toque manual: si el usuario eligió la categoría a mano, la
  // auto-aplicación de la sugerencia se saltea (la elección explícita gana).
  const categoriaTouchedRef = useRef(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getUserCategories();
        setCategories(data);
        if (data.length > 0 && !movimientoToEdit) {
          setCategoriaId(data[0].id.toString());
        }
      } catch {
        setError('Error al cargar categorías');
      }
    };

    fetchCategories();
  }, [movimientoToEdit, categoriesVersion]);

  // Buscar sugerencias de descripciones con debounce
  useEffect(() => {
    // Si el cambio vino de seleccionar una sugerencia, no buscar de nuevo
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    const trimmed = descripcion.trim();
    if (trimmed.length < 1 || movimientoToEdit) {
      setShowSuggestions(false);
      setSuggestions([]);
      return;
    }

    suggestionTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchDescripciones(trimmed);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setSelectedSuggestionIndex(-1);
        setSuggestionsError(null);
      } catch {
        // El autocomplete es opcional: no romper el form, pero sí reportar
        // el fallo de forma visible (sin ocultarlo silenciosamente).
        setSuggestions([]);
        setShowSuggestions(false);
        setSuggestionsError('No se pudieron cargar las sugerencias');
      }
    }, 300);

    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [descripcion, movimientoToEdit]);

  const resetForm = useCallback(() => {
    categoriaTouchedRef.current = false;
    setTipo('gasto');
    setImporte('');
    setDescripcion('');
    setNota('');
    setFecha(getCurrentBADateInputValue());
    setEsInicioCiclo(false);
    setClasificacion('');
    setTicket(null);
    setFilas([]);
    setCategoriaTicketId('');
    setConfirmoDescuadre(false);
    if (categories.length > 0) {
      setCategoriaId(categories[0].id.toString());
    }
  }, [categories]);

  useEffect(() => {
    if (movimientoToEdit) {
      setTipo(movimientoToEdit.tipo);
      setImporte(movimientoToEdit.importe.toString());
      setDescripcion(movimientoToEdit.descripcion);
      setNota(movimientoToEdit.nota || '');
      setFecha(movimientoToEdit.fecha.split('T')[0]);
      const catId = movimientoToEdit.categoria_id ?? movimientoToEdit.user_category_id;
      setCategoriaId(catId ? catId.toString() : '');
      setClasificacion(movimientoToEdit.clasificacion || '');
    } else {
      resetForm();
    }
  }, [movimientoToEdit, categories, resetForm]);

  const handleCreateCategory = async () => {
    const nombre = newCatNombre.trim();
    if (!nombre) return;
    setSavingCat(true);
    try {
      const nueva = await createCategory(nombre);
      setCategories((prev) => [...prev, nueva]);
      setCategoriaId(nueva.id.toString());
      // Crear una categoría es una elección explícita: nunca auto-aplicar encima
      categoriaTouchedRef.current = true;
      setNewCatNombre('');
      setShowNewCat(false);
    } catch {
      setError('Error al crear la categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      const selected = suggestions[selectedSuggestionIndex];
      if (selected) {
        justSelectedRef.current = true;
        setDescripcion(selected.descripcion);
        aplicarCategoriaSugerida(selected.descripcion);
        setShowSuggestions(false);
        setSuggestions([]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  // Auto-aplica la categoría sugerida para una descripción elegida, solo al
  // crear y si el usuario no tocó la categoría a mano (el helper decide).
  const aplicarCategoriaSugerida = useCallback(
    (desc: string) => {
      const sugerida = obtenerCategoriaSugerida(
        desc,
        suggestions,
        categories,
        Boolean(movimientoToEdit),
        categoriaTouchedRef.current,
      );
      if (sugerida !== null) {
        setCategoriaId(String(sugerida));
      }
    },
    [suggestions, categories, movimientoToEdit],
  );

  const selectSuggestion = useCallback((desc: string) => {
    justSelectedRef.current = true;
    setDescripcion(desc);
    aplicarCategoriaSugerida(desc);
    setShowSuggestions(false);
    setSuggestions([]);
  }, [aplicarCategoriaSugerida]);

  const esTicket = ticket !== null;
  const sumaTicket = sumaFilas(filas);
  const diferenciaTicket = diferenciaConTotal(filas, ticket?.total ?? null);
  const descuadre = hayDescuadre(filas, ticket?.total ?? null);

  const guardarTicket = async () => {
    if (filas.length === 0) {
      setError('No quedan renglones para guardar');
      return;
    }
    if (filas.some((fila) => !fila.categoriaId)) {
      setError('Elegí una categoría para todos los renglones');
      return;
    }
    if (descuadre && !confirmoDescuadre) {
      setError('La suma de los renglones no coincide con el total del ticket');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await createMovimientosLote(
        movimientosDesdeFilas(filas, {
          fecha,
          comercio: ticket?.comercio ?? null,
          clasificacion: (clasificacion as 'necesidad' | 'deseo' | null) || null,
          nota: null,
        }),
      );

      resetForm();
      onMovimientoCreated();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo guardar el ticket'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (esTicket) {
      await guardarTicket();
      return;
    }

    if (!importe || !descripcion || !categoriaId) {
      setError('Por favor completa todos los campos obligatorios');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const movimientoData: MovimientoCreate = {
        importe: parseFloat(importe),
        fecha: fecha + 'T00:00:00',
        descripcion,
        nota: nota || null,
        tipo,
        categoria_id: null,
        user_category_id: parseInt(categoriaId) || null,
        es_inicio_ciclo: !movimientoToEdit && tipo === 'ingreso' && esInicioCiclo,
        presupuesto_item_id: null,
        clasificacion: tipo === 'gasto' ? (clasificacion as 'necesidad' | 'deseo' | null) || null : null,
      };

      if (movimientoToEdit) {
        await updateMovimiento(movimientoToEdit.id, movimientoData);
        onMovimientoUpdated();
      } else {
        const resultado = await createMovimiento(movimientoData);
        if (resultado.id < 0) {
          setOfflineQueued(true);
          resetForm();
          return;
        }
        onMovimientoCreated(resultado);
      }

      resetForm();

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || msg);
    } finally {
      setLoading(false);
    }
  };

  const isIngreso = tipo === 'ingreso';

  const handleLeerTicket = async (archivo: File) => {
    try {
      setLeyendoTicket(true);
      setError(null);
      const leido = await leerTicket(archivo);

      const categoriaDefault = categoriaId || (categories[0] ? String(categories[0].id) : '');
      setTicket(leido);
      setCategoriaTicketId(categoriaDefault);
      setFilas(filasDesdeTicket(leido, categoriaDefault));
      setConfirmoDescuadre(false);
      // Un ticket de supermercado siempre es un gasto.
      setTipo('gasto');
      // El detalle quedó al fondo del formulario: sin esto el usuario que
      // esperó 30 s no ve el resultado.
      requestAnimationFrame(() => {
        filasRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo leer el ticket'));
    } finally {
      setLeyendoTicket(false);
      // Permite volver a elegir el mismo archivo sin tener que recargar.
      if (archivoTicketRef.current) archivoTicketRef.current.value = '';
    }
  };

  const descartarTicket = () => {
    setTicket(null);
    setFilas([]);
    setCategoriaTicketId('');
    setConfirmoDescuadre(false);
    setError(null);
  };

  /** Cambia la categoría de todas las filas de una vez (el default del ticket). */
  const aplicarCategoriaATodos = (nuevaCategoria: string) => {
    setCategoriaTicketId(nuevaCategoria);
    setFilas((previas) => previas.map((fila) => ({ ...fila, categoriaId: nuevaCategoria })));
    setConfirmoDescuadre(false);
  };

  const actualizarFila = (indice: number, cambios: Partial<FilaTicket>) => {
    setFilas((previas) =>
      previas.map((fila, posicion) => (posicion === indice ? { ...fila, ...cambios } : fila)),
    );
    // La confirmación vale para una suma concreta: si cambia, se vuelve a pedir.
    setConfirmoDescuadre(false);
  };

  const quitarFila = (indice: number) => {
    setFilas((previas) => previas.filter((_, posicion) => posicion !== indice));
    setConfirmoDescuadre(false);
  };

  return (
    <div className={`bg-slate-800/70 rounded-2xl border border-slate-600/70 border-l-4 ${isIngreso ? 'border-l-green-500' : 'border-l-red-500'} p-4`}>
      {movimientoToEdit && (
        <h2 className="mb-3 text-base font-semibold text-white">
          ✏️ Editando {isIngreso ? 'ingreso' : 'gasto'}
        </h2>
      )}

      {!movimientoToEdit && (
        <div className="mb-3">
          <div className="flex items-center gap-2 pr-9">
            {!esTicket && (
              <div className="flex gap-1 rounded-xl bg-slate-900/50 p-1">
                <button
                  type="button"
                  onClick={() => setTipo('gasto')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    tipo === 'gasto'
                      ? 'bg-red-600 text-white shadow-glow-red'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('ingreso')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    tipo === 'ingreso'
                      ? 'bg-green-600 text-white shadow-glow-green'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Ingreso
                </button>
              </div>
            )}

            <input
              ref={archivoTicketRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void handleLeerTicket(archivo);
              }}
            />
            <button
              type="button"
              onClick={() => archivoTicketRef.current?.click()}
              disabled={leyendoTicket}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-blue-400/50 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200 transition-colors hover:bg-blue-500/20 disabled:cursor-wait disabled:opacity-60"
            >
              <span aria-hidden="true">{leyendoTicket ? '⏳' : '📷'}</span>
              {leyendoTicket ? 'Leyendo…' : esTicket ? 'Otra foto' : 'Leer ticket'}
            </button>
          </div>

          {leyendoTicket && (
            <p className="mt-1 text-xs text-slate-500">
              Puede tardar hasta 30 segundos. No cierres esta pantalla.
            </p>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {offlineQueued && (
        <div role="status" className="bg-amber-500/10 border border-amber-400/50 rounded-xl mb-4 overflow-hidden">
          <div className="flex items-start gap-3 px-4 pt-4 pb-3">
            <span className="text-amber-400 text-xl leading-none mt-0.5" aria-hidden="true">📶</span>
            <div className="flex-1 min-w-0">
              <p className="text-amber-200 font-semibold text-sm mb-1">Guardado sin conexión</p>
              <p className="text-amber-300/80 text-xs leading-relaxed">
                El movimiento fue guardado localmente en tu dispositivo. El progreso de la categoría se va a ver al sincronizar.
              </p>
            </div>
          </div>
          <div className="px-4 pb-3 flex justify-end">
            <button
              type="button"
              onClick={() => { setOfflineQueued(false); onMovimientoCreated(); }}
              className="text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 px-4 py-1.5 rounded-lg transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">

        {esTicket ? (
          <div ref={filasRef} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm font-semibold text-slate-200">
                🧾 {ticket?.comercio ?? 'Ticket'}
              </span>
              <button
                type="button"
                onClick={descartarTicket}
                className="text-xs text-slate-400 transition-colors hover:text-slate-200"
              >
                Descartar
              </button>
            </div>

            <div>
              <label htmlFor="categoria-ticket" className="mb-1 block text-xs font-medium text-slate-400">
                Categoría para todos
              </label>
              <select
                id="categoria-ticket"
                value={categoriaTicketId}
                onChange={(e) => aplicarCategoriaATodos(e.target.value)}
                className="w-full rounded-lg border border-slate-500/80 bg-slate-700/80 px-3 py-2 text-sm text-white transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {filas.length} {filas.length === 1 ? 'renglón' : 'renglones'}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {formatearImporte(sumaTicket)}
                </span>
              </div>

              <ul className="divide-y divide-slate-700/40 rounded-xl border border-slate-600/50 bg-slate-900/40">
                {filas.length === 0 && (
                  <li className="px-3 py-3 text-xs text-slate-500">
                    No quedan renglones. Descartá el ticket o cargá otra foto.
                  </li>
                )}

                {filas.map((fila, indice) => (
                  <li key={`${indice}-${fila.descripcion}`} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 text-sm leading-tight text-slate-200">
                        {fila.descripcion}
                      </span>
                      {fila.importeLista !== null && Number(fila.importeLista) !== Number(fila.importe) && (
                        <span className="shrink-0 font-mono text-xs text-slate-500 line-through">
                          {formatearImporte(fila.importeLista)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => quitarFila(indice)}
                        aria-label={`Quitar ${fila.descripcion}`}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        value={fila.cantidad}
                        onChange={(e) => actualizarFila(indice, { cantidad: e.target.value })}
                        aria-label={`Cantidad de ${fila.descripcion}`}
                        placeholder="cant."
                        className="w-16 rounded-lg border border-slate-600/70 bg-slate-800/80 px-2 py-1 text-right text-xs text-white placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={fila.importe}
                        onChange={(e) => actualizarFila(indice, { importe: e.target.value })}
                        aria-label={`Importe de ${fila.descripcion}`}
                        className="w-24 rounded-lg border border-slate-600/70 bg-slate-800/80 px-2 py-1 text-right font-mono text-xs text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                      />
                      <select
                        value={fila.categoriaId}
                        onChange={(e) => actualizarFila(indice, { categoriaId: e.target.value })}
                        aria-label={`Categoría de ${fila.descripcion}`}
                        className="min-w-0 flex-1 rounded-lg border border-slate-600/70 bg-slate-800/80 px-2 py-1 text-xs text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {ticket?.total !== null && ticket?.total !== undefined && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  descuadre
                    ? 'border-amber-400/60 bg-amber-500/10 text-amber-200'
                    : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Total del ticket</span>
                  <span className="font-mono">{formatearImporte(ticket.total)}</span>
                </div>
                {descuadre && diferenciaTicket !== null && (
                  <>
                    <div className="mt-1 flex items-center justify-between">
                      <span>{diferenciaTicket < 0 ? 'Falta registrar' : 'Sobra'}</span>
                      <span className="font-mono">{formatearImporte(Math.abs(diferenciaTicket))}</span>
                    </div>
                    <label className="mt-2 flex items-start gap-2 leading-tight">
                      <input
                        type="checkbox"
                        checked={confirmoDescuadre}
                        onChange={(e) => setConfirmoDescuadre(e.target.checked)}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-500 bg-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Confirmo guardar aunque la suma no coincida</span>
                    </label>
                  </>
                )}
              </div>
            )}

            <div>
              <label htmlFor="fecha-ticket" className="mb-1 block text-xs font-medium text-slate-400">
                Fecha (aplica a todos)
              </label>
              <input
                id="fecha-ticket"
                type="date"
                max={getCurrentBADateInputValue()}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-slate-500/80 bg-slate-700/80 px-3 py-2 text-sm text-white transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500 [color-scheme:dark]"
              />
            </div>
          </div>
        ) : (
          <>

        {/* ═══════ DATOS PRINCIPALES ═══════ */}
        <div className="space-y-3">

        <div className={`rounded-xl border p-3 text-center ${isIngreso ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <label className={`mb-1 block text-xs font-semibold uppercase tracking-widest ${isIngreso ? 'text-green-400' : 'text-red-400'}`}>
            {isIngreso ? 'Ingreso' : 'Gasto'} *
          </label>
          <div className="flex items-center justify-center gap-2">
            <span className={`text-2xl font-light ${isIngreso ? 'text-green-400' : 'text-red-400'}`}>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0"
              autoFocus
              className={`w-full max-w-xs border-b-2 bg-transparent text-center text-3xl font-bold ${isIngreso ? 'border-green-500 text-green-100 placeholder:text-green-800' : 'border-red-500 text-red-100 placeholder:text-red-900'} focus:outline-none`}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-100 mb-1">
            Descripción *
          </label>
          <input
            ref={descRef}
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            onKeyDown={handleDescKeyDown}
            onBlur={() => {
              // Esperar a que el mousedown de la sugerencia se procese
              setTimeout(() => {
                setShowSuggestions(false);
                // Exact match en blur: auto-aplica la categoría solo al crear.
                // Edición, toque manual y sin historial quedan excluidos dentro
                // del helper (no-op benigno si la lista quedó stale en el debounce).
                aplicarCategoriaSugerida(descripcion);
              }, 200);
            }}
            placeholder={isIngreso ? 'Ej: Sueldo de febrero' : 'Ej: Almuerzo con cliente'}
            autoComplete="off"
            className={`w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${isIngreso ? 'focus:ring-green-500' : 'focus:ring-red-500'}`}
          />
          {suggestionsError && (
            <p role="alert" className="mt-1 text-xs text-red-400">
              {suggestionsError}
            </p>
          )}
          {showSuggestions && (
            <ul
              ref={suggestionListRef}
              role="listbox"
              aria-label="Sugerencias de descripciones"
              className="mt-1 bg-slate-800 border border-slate-600 rounded-lg overflow-hidden shadow-xl z-10"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.descripcion}
                  role="option"
                  aria-selected={i === selectedSuggestionIndex}
                  onMouseDown={() => selectSuggestion(s.descripcion)}
                  className={`px-4 py-2.5 cursor-pointer text-sm flex items-center justify-between transition-colors ${
                    i === selectedSuggestionIndex
                      ? 'bg-blue-600/40 text-white'
                      : 'text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <span>{s.descripcion}</span>
                  <span className="text-xs text-slate-400 ml-2 shrink-0">
                    ×{s.frecuencia}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-100">
                Categoría *
              </label>
              <button
                type="button"
                onClick={() => { setShowNewCat((v) => !v); setNewCatNombre(''); }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                {showNewCat ? '✕ Cancelar' : '+ Nueva'}
              </button>
            </div>
            <select
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value);
                // Elección manual explícita: la sugerencia no debe pisarla
                categoriaTouchedRef.current = true;
              }}
              className={`w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white focus:outline-none focus:ring-2 focus:border-transparent transition-all ${isIngreso ? 'focus:ring-green-500' : 'focus:ring-red-500'}`}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nombre}
                </option>
              ))}
            </select>
            {showNewCat && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newCatNombre}
                  onChange={(e) => setNewCatNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
                  placeholder="Nombre de la categoría"
                  autoFocus
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-700/80 border border-blue-500/50 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={savingCat || !newCatNombre.trim()}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-sm font-medium transition-colors"
                >
                  {savingCat ? '...' : 'Crear'}
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1">
              Fecha
            </label>
            <input
              type="date"
              max={getCurrentBADateInputValue()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white focus:outline-none focus:ring-2 focus:border-transparent transition-all [color-scheme:dark] ${isIngreso ? 'focus:ring-green-500' : 'focus:ring-red-500'}`}
            />
          </div>
        </div>

        </div> {/* fin: datos principales */}

        {/* ──────── DETALLES OPCIONALES ──────── */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600/30" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-slate-800/70 px-3 text-xs font-mono text-slate-500 uppercase tracking-widest">
              Detalles opcionales
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="nota-movimiento" className="mb-1 block text-xs font-medium text-slate-400">
            Nota
          </label>
          <textarea
            id="nota-movimiento"
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Información adicional"
            className="w-full resize-y rounded-lg border border-slate-500/80 bg-slate-700/80 px-3 py-2 text-sm text-white placeholder:text-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
          </>
        )}

        {!isIngreso && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Clasificación
            </label>
            <div className="flex gap-1 rounded-xl border border-slate-600/30 bg-slate-900/60 p-1">
              {[
                { value: '', label: '— Sin clasificar' },
                { value: 'necesidad', label: '🏠 Necesidad' },
                { value: 'deseo', label: '✨ Deseo' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setClasificacion(opt.value)}
                  className={`flex-1 rounded-lg px-1 py-1.5 text-xs font-medium transition-all duration-150 ${
                    clasificacion === opt.value
                      ? opt.value === 'necesidad'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-500/30'
                        : opt.value === 'deseo'
                        ? 'bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-md shadow-amber-500/30'
                        : 'bg-gradient-to-r from-slate-500 to-slate-700 text-white shadow-md shadow-slate-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!movimientoToEdit && isIngreso && (
          <div
            onClick={() => setEsInicioCiclo(prev => !prev)}
            className={`flex cursor-pointer select-none items-center gap-3 rounded-lg border px-3 py-2 transition-all ${
              esInicioCiclo
                ? 'bg-blue-500/15 border-blue-400/50'
                : 'bg-slate-700/50 border-slate-500/50 hover:border-slate-400'
            }`}
          >
            <div className={`relative h-5 w-10 flex-shrink-0 rounded-full transition-colors duration-200 ${esInicioCiclo ? 'bg-blue-500' : 'bg-slate-600'}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${esInicioCiclo ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <div>
              <span className={`text-xs font-medium ${esInicioCiclo ? 'text-blue-300' : 'text-slate-300'}`}>
                Marcar como inicio de ciclo
              </span>
              <p className="mt-0.5 text-xs text-slate-400">
                Activa el Daily Cap y solvencia diaria
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || (esTicket && descuadre && !confirmoDescuadre)}
            className={`${
              isIngreso
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-glow-green-lg border-green-300/70'
                : 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 shadow-glow-red-lg border-red-300/70'
            } w-full rounded-full border px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-all duration-200 disabled:from-slate-700 disabled:to-slate-700`}
          >
            {loading
              ? 'Guardando...'
              : esTicket
                ? `Registrar ${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'}`
                : movimientoToEdit
                  ? `Actualizar ${isIngreso ? 'Ingreso' : 'Gasto'}`
                  : `Registrar ${isIngreso ? 'Ingreso' : 'Gasto'}`}
          </button>

          {movimientoToEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-6 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default MovimientoForm;
