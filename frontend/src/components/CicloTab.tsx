// COMPONENTE: Tab único "Ciclo" — reemplaza Balance + edición de presupuesto del ciclo.
// El backend (calcular_resumen) es la única fuente de verdad; NO se recalculan totales
// desde movimientos ni se usa getMovimientosByDateRange para el reporte.
import { useState, useEffect } from 'react';
import type { Ciclo } from '../types';
import { getCiclo, getCiclos, actualizarMontoPresupuestoItem } from '../services/api';
import ClasificacionPie from './ClasificacionPie';

interface CicloTabProps {
  refreshKey: number;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const formatFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const formatFechaLargo = (s: string) =>
  new Date(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function CicloTab({ refreshKey }: CicloTabProps) {
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [selectedCiclo, setSelectedCiclo] = useState<Ciclo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // ── Edición inline del monto estimado ─────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const todos = await getCiclos();
        setCiclos(todos);

        const defaultId = todos.find(c => c.activo)?.id ?? todos[0]?.id;
        if (defaultId) {
          const full = await getCiclo(defaultId);
          setSelectedCiclo(full);
        } else {
          setSelectedCiclo(null);
        }
      } catch {
        setError('No se pudo cargar el ciclo.');
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [refreshKey]);

  const seleccionarCiclo = async (id: number) => {
    if (selectedCiclo?.id === id) return;
    setError(null);
    setInlineError(null);
    setLoading(true);
    try {
      const full = await getCiclo(id);
      setSelectedCiclo(full);
    } catch {
      setError('No se pudo cargar el ciclo seleccionado.');
    } finally {
      setLoading(false);
    }
  };

  const iniciarEdicion = (id: number, montoEstimado: number) => {
    setEditingId(id);
    setEditingValue(String(montoEstimado));
    setInlineError(null);
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setEditingValue('');
    setInlineError(null);
  };

  const guardarEdicion = async (itemId: number) => {
    if (!selectedCiclo) return;
    const nuevo = parseFloat(editingValue);
    if (isNaN(nuevo) || nuevo < 0) {
      setInlineError('Ingresá un monto válido.');
      return;
    }
    setSavingId(itemId);
    setInlineError(null);
    try {
      // El PATCH devuelve el CicloRead actualizado → reemplazar selección sin re-fetch
      const actualizado = await actualizarMontoPresupuestoItem(selectedCiclo.id, itemId, nuevo);
      setSelectedCiclo(actualizado);
      setEditingId(null);
      setEditingValue('');
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      setInlineError(e.response?.data?.detail ?? 'No se pudo actualizar el monto.');
    } finally {
      setSavingId(null);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-20 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-40 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
        <div className="h-40 bg-slate-900/80 border border-slate-700/70 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900/80 border border-red-500/20 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (ciclos.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-slate-300 text-base font-medium">Sin ciclos</p>
        <p className="text-slate-400 text-sm mt-2">Registrá un ingreso e iniciá un ciclo para ver el balance.</p>
      </div>
    );
  }

  if (!selectedCiclo || !selectedCiclo.resumen) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-8 text-center">
        <p className="text-slate-300 text-base font-medium">Seleccioná un ciclo</p>
      </div>
    );
  }

  const r = selectedCiclo.resumen;
  // Unión client-side: items confirmados ("comprometida") + gastos sin presupuesto ("sin comprometer")
  const items = r.presupuesto_items.filter((i) => i.confirmado);
  const sinPresupuesto = [...r.gastos_sin_presupuesto].sort((a, b) => b.importe - a.importe);
  const totalSinPresupuesto = sinPresupuesto.reduce((s, g) => s + g.importe, 0);

  const resultado = r.saldo_disponible_actual;
  const semaforoColor =
    r.semaforo === 'rojo' ? 'border-red-500/30' :
    r.semaforo === 'amarillo' ? 'border-amber-500/30' : 'border-emerald-500/30';

  const clasificacionData = r.clasificacion_importes;

  const renderItem = (itemId: number, descripcion: string, ejecutado: number, estimado: number, estado: string, pendiente: number) => {
    const pct = estimado > 0 ? Math.min((ejecutado / estimado) * 100, 100) : 0;
    const barColor =
      estado === 'efectivizado' ? 'bg-green-500' :
      estado === 'parcial' ? 'bg-blue-400' : 'bg-slate-600';
    const pctColor =
      estado === 'efectivizado' ? 'text-green-400' :
      estado === 'parcial' ? 'text-blue-300' : 'text-slate-500';

    const isEditing = editingId === itemId;
    const isSaving = savingId === itemId;

    return (
      <div key={itemId} className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-200 text-xs font-medium truncate">
              {descripcion || 'Sin descripción'}
            </span>
            <span className="text-xs font-mono text-blue-400/80 bg-blue-500/10 border border-blue-500/20 px-1.5 py-px rounded flex-shrink-0">
              comprometida
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-mono ${pctColor}`}>{Math.round(pct)}%</span>
            <span className="text-slate-400 text-xs tabular-nums">
              {formatARS(ejecutado)}<span className="text-slate-600"> / </span>{formatARS(estimado)}
            </span>
          </div>
        </div>
        <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {pendiente > 0 ? (
              <p className={`text-xs font-mono ${pctColor}`}>Restante: {formatARS(pendiente)}</p>
            ) : (
              <p className="text-xs font-mono text-green-400">Completado</p>
            )}
          </div>
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                autoFocus
                className="w-28 bg-slate-800 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none tabular-nums"
              />
              <button
                onClick={() => guardarEdicion(itemId)}
                disabled={isSaving}
                className="text-xs font-medium text-blue-300 hover:text-blue-200 disabled:opacity-50"
              >
                {isSaving ? '...' : 'OK'}
              </button>
              <button
                onClick={cancelarEdicion}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => iniciarEdicion(itemId, estimado)}
              className="text-xs font-mono text-slate-500 hover:text-slate-300 flex-shrink-0"
              aria-label={`Editar monto estimado de ${descripcion || 'item'}`}
            >
              editar
            </button>
          )}
        </div>
        {isEditing && inlineError && (
          <p className="text-xs text-red-400 mt-1">{inlineError}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-4">

      {/* ── Selector de ciclos ──────────────────────── */}
      <div className="relative bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl p-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {ciclos.map((c) => {
            const isSelected = c.id === selectedCiclo.id;
            return (
              <button
                key={c.id}
                onClick={() => seleccionarCiclo(c.id)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-mono transition-all duration-200 whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600/30 border border-blue-500/50 text-blue-200 shadow-lg'
                    : 'bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`}
              >
                {formatFecha(c.fecha_inicio)} → {formatFecha(c.fecha_fin)}
                {c.activo && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-400 align-middle" title="Activo" />
                )}
              </button>
            );
          })}
        </div>
        {/* Fade que indica scroll horizontal en mobile */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-900/80 to-transparent rounded-r-2xl md:hidden" />
      </div>

      {/* ── Encabezado ──────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
            {formatFechaLargo(selectedCiclo.fecha_inicio)} → {formatFechaLargo(selectedCiclo.fecha_fin)}
          </h2>
          {selectedCiclo.activo && (
            <span className="text-xs font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
              Activo
            </span>
          )}
        </div>
        <span className="text-slate-500 text-xs tabular-nums">
          {selectedCiclo.activo
            ? `${r.dias_restantes} día${r.dias_restantes !== 1 ? 's' : ''} restante${r.dias_restantes !== 1 ? 's' : ''}`
            : 'Ciclo cerrado'}
        </span>
      </div>

      {/* ── Resultado del ciclo (desde el resumen) ── */}
      <div className={`bg-slate-900/80 border backdrop-blur-2xl rounded-xl px-5 py-3 ${semaforoColor}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Disponible del ciclo</p>
            <p className="text-xs text-slate-500 mt-0.5">Total disponible − gastos no planificados</p>
          </div>
          <p className={`text-lg font-bold tabular-nums ${
            resultado >= 0 ? 'text-emerald-300' : 'text-red-300'
          }`}>
            {resultado >= 0 ? '+' : ''}{formatARS(resultado)}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums border-t border-slate-700/40 pt-2 mt-1">
          <span className="text-emerald-400">
            +{formatARS(r.total_ingresos)} <span className="text-slate-500 font-mono">ingresos</span>
          </span>
          <span className="text-red-400">
            −{formatARS(r.total_gastos)} <span className="text-slate-500 font-mono">gastos</span>
          </span>
          <span className="text-amber-400">
            −{formatARS(selectedCiclo.ahorro_objetivo)} <span className="text-slate-500 font-mono">ahorro</span>
          </span>
          <span className={resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            = {formatARS(resultado)} <span className="text-slate-500 font-mono">resultado</span>
          </span>
        </div>
      </div>

      {/* ── Desktop: 2 columnas / Mobile: 1 columna ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* ── Ejecución presupuestaria (lista unificada) ── */}
        <section>
          <div className="flex items-baseline justify-between mb-2 px-1">
            <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
              Ejecución presupuestaria
            </h2>
            <span className="text-slate-500 text-xs tabular-nums">{formatARS(r.total_gastos)} total</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl overflow-hidden">
            {items.length === 0 && sinPresupuesto.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-6">Sin gastos en este ciclo</p>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {items.map((item) =>
                  renderItem(item.id, item.descripcion ?? '', item.monto_ejecutado, item.monto_estimado, item.estado, item.monto_pendiente)
                )}

                {items.length > 0 && sinPresupuesto.length > 0 && (
                  <div className="px-4 py-2 bg-slate-800/80 border-y border-slate-700/40">
                    <div className="flex items-center gap-2">
                      <div className="w-px h-4 bg-slate-600/60" />
                      <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                        Gastos sin comprometer
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {formatARS(totalSinPresupuesto)}
                      </span>
                    </div>
                  </div>
                )}

                {sinPresupuesto.map((g) => {
                  const pct = r.total_gastos > 0 ? (g.importe / r.total_gastos) * 100 : 0;
                  return (
                    <div key={g.categoria} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-300 text-xs truncate">{g.categoria}</span>
                          <span className="text-xs font-mono text-red-400/80 bg-red-500/10 border border-red-500/20 px-1.5 py-px rounded flex-shrink-0">
                            sin comprometer
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-mono text-slate-500">{pct.toFixed(0)}%</span>
                          <span className="text-slate-300 text-xs tabular-nums font-medium">{formatARS(g.importe)}</span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-slate-700/80 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

              </div>
            )}
          </div>
          {inlineError && editingId === null && (
            <p className="text-xs text-red-400 mt-2">{inlineError}</p>
          )}
        </section>

        {/* ── Necesidad vs Deseo (desde clasificacion_importes) ── */}
        <section>
          <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
            Necesidad vs Deseo
          </h2>
          <div className="bg-slate-900/80 border border-slate-700/70 backdrop-blur-2xl rounded-2xl shadow-2xl p-4">
            {clasificacionData.necesidad === 0 && clasificacionData.deseo === 0 ? (
              <p className="text-slate-400 text-sm text-center py-2">
                Clasificá tus gastos como Necesidad o Deseo al registrarlos.
              </p>
            ) : (
              <>
                <ClasificacionPie
                  necesidad={clasificacionData.necesidad}
                  deseo={clasificacionData.deseo}
                  sinClasificar={clasificacionData.sin_clasificar}
                  total={r.total_gastos}
                />
                <div className="mt-3 space-y-1 text-xs tabular-nums border-t border-slate-700/40 pt-3">
                  <div className="flex justify-between">
                    <span className="text-emerald-400">Necesidad</span>
                    <span className="text-slate-200 font-medium">{formatARS(clasificacionData.necesidad)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-400">Deseo</span>
                    <span className="text-slate-200 font-medium">{formatARS(clasificacionData.deseo)}</span>
                  </div>
                  {clasificacionData.sin_clasificar > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 italic">Sin clasificar</span>
                      <span className="text-slate-400">{formatARS(clasificacionData.sin_clasificar)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
