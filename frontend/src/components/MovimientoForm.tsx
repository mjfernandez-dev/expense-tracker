import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { UserCategory, MovimientoCreate, Movimiento } from '../types';
import { getUserCategories, createMovimiento, updateMovimiento, createCategory, searchDescripciones } from '../services/api';
import type { DescripcionSuggestion } from '../services/api';
import { getCurrentBADateInputValue } from '../utils/buenosAiresDate';

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
  const [medioPago, setMedioPago] = useState<string>('');
  const [clasificacion, setClasificacion] = useState<string>('');

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
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const suggestionListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getUserCategories();
        setCategories(data);
        if (data.length > 0 && !movimientoToEdit) {
          setCategoriaId(data[0].id.toString());
        }
      } catch (err) {
        setError('Error al cargar categorías');
      }
    };

    fetchCategories();
  }, [movimientoToEdit, categoriesVersion]);

  // Buscar sugerencias de descripciones con debounce
  useEffect(() => {
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
      } catch {
        // fallo silencioso — no romper el form por sugerencias
      }
    }, 300);

    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [descripcion, movimientoToEdit]);

  useEffect(() => {
    if (movimientoToEdit) {
      setTipo(movimientoToEdit.tipo);
      setImporte(movimientoToEdit.importe.toString());
      setDescripcion(movimientoToEdit.descripcion);
      setNota(movimientoToEdit.nota || '');
      setFecha(movimientoToEdit.fecha.split('T')[0]);
      const catId = movimientoToEdit.categoria_id ?? movimientoToEdit.user_category_id;
      setCategoriaId(catId ? catId.toString() : '');
      setMedioPago(movimientoToEdit.medio_pago || '');
      setClasificacion(movimientoToEdit.clasificacion || '');
    } else {
      setTipo('gasto');
      setImporte('');
      setDescripcion('');
      setNota('');
      setFecha(getCurrentBADateInputValue());
      setEsInicioCiclo(false);
      setMedioPago('');
      setClasificacion('');
      if (categories.length > 0) {
        setCategoriaId(categories[0].id.toString());
      }
    }
  }, [movimientoToEdit, categories]);

  const handleCreateCategory = async () => {
    const nombre = newCatNombre.trim();
    if (!nombre) return;
    setSavingCat(true);
    try {
      const nueva = await createCategory(nombre);
      setCategories((prev) => [...prev, nueva]);
      setCategoriaId(nueva.id.toString());
      setNewCatNombre('');
      setShowNewCat(false);
    } catch (err) {
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
        setDescripcion(selected.descripcion);
        setShowSuggestions(false);
        setSuggestions([]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const selectSuggestion = useCallback((desc: string) => {
    setDescripcion(desc);
    setShowSuggestions(false);
    setSuggestions([]);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

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
        medio_pago: medioPago || null,
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
          setImporte(''); setDescripcion(''); setNota(''); setEsInicioCiclo(false);
          return;
        }
        onMovimientoCreated(resultado);
      }

      setImporte('');
      setDescripcion('');
      setNota('');
      setEsInicioCiclo(false);
      setMedioPago('');
      setClasificacion('');

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      const detail = (err as any)?.response?.data?.detail;
      setError(detail || msg);
    } finally {
      setLoading(false);
    }
  };

  const isIngreso = tipo === 'ingreso';

  return (
    <div className={`bg-slate-800/70 rounded-2xl border border-slate-600/70 border-l-4 ${isIngreso ? 'border-l-green-500' : 'border-l-red-500'} p-6 mb-6`}>
      <h2 className="text-2xl font-bold mb-4 text-white">
        {movimientoToEdit
          ? `✏️ Editar ${isIngreso ? 'Ingreso' : 'Gasto'}`
          : `➕ Registrar Movimiento`}
      </h2>

      {!movimientoToEdit && (
        <div className="flex gap-2 mb-5 p-1 bg-slate-900/50 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setTipo('gasto')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tipo === 'gasto'
                ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => setTipo('ingreso')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tipo === 'ingreso'
                ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ingreso
          </button>
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
                El movimiento fue guardado localmente en tu dispositivo.
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

      <form onSubmit={handleSubmit} className="space-y-4">

        <div className={`rounded-xl border p-4 text-center ${isIngreso ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <label className={`block text-xs font-semibold uppercase tracking-widest mb-2 ${isIngreso ? 'text-green-400' : 'text-red-400'}`}>
            {isIngreso ? 'Ingreso' : 'Gasto'} *
          </label>
          <div className="flex items-center justify-center gap-2">
            <span className={`text-3xl font-light ${isIngreso ? 'text-green-400' : 'text-red-400'}`}>$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0"
              autoFocus
              className={`w-full max-w-xs text-4xl font-bold text-center bg-transparent border-b-2 ${isIngreso ? 'border-green-500 text-green-100 placeholder:text-green-800' : 'border-red-500 text-red-100 placeholder:text-red-900'} focus:outline-none`}
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
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            placeholder={isIngreso ? 'Ej: Sueldo de febrero' : 'Ej: Almuerzo con cliente'}
            autoComplete="off"
            className={`w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${isIngreso ? 'focus:ring-green-500' : 'focus:ring-red-500'}`}
          />
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
            onChange={(e) => setCategoriaId(e.target.value)}
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
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={`w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white focus:outline-none focus:ring-2 focus:border-transparent transition-all [color-scheme:dark] ${isIngreso ? 'focus:ring-green-500' : 'focus:ring-red-500'}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-100 mb-1">
            Nota (opcional)
          </label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Información adicional"
            className="w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-100 mb-1">
            Medio de pago <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <select
            value={medioPago}
            onChange={e => setMedioPago(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          >
            <option value="">Sin especificar</option>
            <option value="efectivo">Efectivo</option>
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
            <option value="transferencia">Transferencia</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        {!isIngreso && (
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1">
              Clasificación <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-600/30">
              {[
                { value: '', label: '— Sin clasificar' },
                { value: 'necesidad', label: '🏠 Necesidad' },
                { value: 'deseo', label: '✨ Deseo' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setClasificacion(opt.value)}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all duration-150 ${
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
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all select-none ${
              esInicioCiclo
                ? 'bg-blue-500/15 border-blue-400/50'
                : 'bg-slate-700/50 border-slate-500/50 hover:border-slate-400'
            }`}
          >
            <div className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${esInicioCiclo ? 'bg-blue-500' : 'bg-slate-600'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${esInicioCiclo ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <div>
              <span className={`text-sm font-medium ${esInicioCiclo ? 'text-blue-300' : 'text-slate-300'}`}>
                Marcar como inicio de ciclo
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Activa el Daily Cap y seguimiento de solvencia diaria
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className={`${
              isIngreso
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-[0_0_25px_rgba(34,197,94,0.5)] border-green-300/70'
                : 'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 shadow-[0_0_25px_rgba(239,68,68,0.5)] border-red-300/70'
            } disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full border tracking-wide uppercase text-sm transition-all duration-200`}
          >
            {loading ? 'Guardando...' : movimientoToEdit
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
