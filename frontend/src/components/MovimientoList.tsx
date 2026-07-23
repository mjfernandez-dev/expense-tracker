import { useEffect, useState, useMemo, useCallback } from 'react';
import type { Movimiento } from '../types';
import { getMovimientos, deleteMovimiento } from '../services/api';
import ClasificacionBadge from './ClasificacionBadge';

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const sortMovimientos = (a: Movimiento, b: Movimiento) => {
  const byFecha = new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
  return byFecha !== 0 ? byFecha : b.id - a.id;
};

type TabActivo = 'gastos' | 'ingresos';

interface MovimientoListProps {
  onEdit?: (movimiento: Movimiento) => void;
}

function MovimientoList({ onEdit }: MovimientoListProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);  // modal normal
  const [autoDeleteTarget, setAutoDeleteTarget] = useState<Movimiento | null>(null);  // modal 3 opciones
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [tabActivo, setTabActivo] = useState<TabActivo>('gastos');

  const fetchMovimientos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMovimientos();
      setMovimientos(data);
    } catch {
      setError('Error al cargar los movimientos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  useEffect(() => {
    const isOpen = deleteTarget !== null || autoDeleteTarget !== null;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [deleteTarget, autoDeleteTarget]);

  const movimientosMes = useMemo(() => {
    return movimientos.filter((mov) => {
      const date = new Date(mov.fecha);
      return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
    });
  }, [movimientos, selectedYear, selectedMonth]);

  // Filtro por descripción (client-side, sobre el mes seleccionado)
  const movimientosSearch = useMemo(() => {
    if (!searchQuery.trim()) return movimientosMes;
    const q = searchQuery.trim().toLowerCase();
    return movimientosMes.filter((m) => m.descripcion.toLowerCase().includes(q));
  }, [movimientosMes, searchQuery]);

  const getNombreCategoria = (mov: Movimiento) =>
    mov.categoria?.nombre ?? mov.user_category?.nombre ?? 'Sin categoría';

  // Categorías únicas disponibles en los movimientos del mes (para el selector)
  const categoriasDelMes = useMemo(() => {
    const names = new Set<string>();
    movimientosMes.forEach((m) => names.add(getNombreCategoria(m)));
    return Array.from(names).sort();
  }, [movimientosMes]);

  // Filtro por categoría
  const movimientosCategoria = useMemo(() => {
    if (!selectedCategory) return movimientosSearch;
    return movimientosSearch.filter((m) => getNombreCategoria(m) === selectedCategory);
  }, [movimientosSearch, selectedCategory]);

  const gastosMes = useMemo(() =>
    movimientosCategoria.filter((m) => m.tipo === 'gasto').sort(sortMovimientos),
    [movimientosCategoria]
  );

  const ingresosMes = useMemo(() =>
    movimientosCategoria.filter((m) => m.tipo === 'ingreso').sort(sortMovimientos),
    [movimientosCategoria]
  );

  const totalGastos = useMemo(() => gastosMes.reduce((sum, m) => sum + m.importe, 0), [gastosMes]);
  const totalIngresos = useMemo(() => ingresosMes.reduce((sum, m) => sum + m.importe, 0), [ingresosMes]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear((y) => y - 1); }
    else setSelectedMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear((y) => y + 1); }
    else setSelectedMonth((m) => m + 1);
  };

  const handleDeleteRequest = (mov: Movimiento) => {
    if (mov.is_auto_generated) {
      setAutoDeleteTarget(mov);
    } else {
      setDeleteTarget(mov.id);
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return;
    setIsDeleting(true);
    try {
      await deleteMovimiento(deleteTarget);
      await fetchMovimientos();
    } catch {
      setError('Error al eliminar el movimiento');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleAutoDeleteSoloEsteMes = async () => {
    if (!autoDeleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMovimiento(autoDeleteTarget.id);
      await fetchMovimientos();
      setAutoDeleteTarget(null);
    } catch {
      setError('Error al eliminar el movimiento');
    } finally {
      setIsDeleting(false);
    }
  };


  const listaActiva = tabActivo === 'gastos' ? gastosMes : ingresosMes;
  const esIngreso = tabActivo === 'ingresos';

  const listaAgrupadaPorDia = useMemo(() => {
    const map = new Map<string, Movimiento[]>();
    listaActiva.forEach((mov) => {
      const key = mov.fecha.substring(0, 10);
      if (!map.has(key)) map.set(key, []);
      const group = map.get(key);
      if (group) group.push(mov);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => {
        const d = new Date(key + 'T12:00:00');
        const label = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
        const total = items.reduce((sum, m) => sum + m.importe, 0);
        return { key, label, items, total };
      });
  }, [listaActiva]);

  const renderTarjetaMobile = (mov: Movimiento) => {
    const isExpanded = expandedId === mov.id;
    return (
      <div key={mov.id} className="bg-slate-700/50 border border-slate-600/60 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpandedId(isExpanded ? null : mov.id)}
          className="w-full px-4 py-3 text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100 truncate mr-3">{mov.descripcion}</span>
            <span className={`text-sm font-bold whitespace-nowrap ${esIngreso ? 'text-green-300' : 'text-white'}`}>
              {esIngreso ? '+' : '-'}{formatARS(mov.importe)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">{new Date(mov.fecha).toLocaleDateString()}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                esIngreso
                  ? 'bg-green-500/20 text-green-300 border-green-400/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
              }`}>
                {getNombreCategoria(mov)}
              </span>
              {mov.is_auto_generated && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-400/30">
                  Auto
                </span>
              )}
              <ClasificacionBadge value={mov.clasificacion} />
            </div>
            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-4 pb-3 pt-1 border-t border-slate-600/50">
            {mov.nota && (
              <p className="text-xs text-slate-400 mb-3"><span className="text-slate-500">Nota:</span> {mov.nota}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => onEdit?.(mov)}
                aria-label="Editar"
                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 p-2 rounded-lg transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => handleDeleteRequest(mov)}
                aria-label="Eliminar"
                className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 p-2 rounded-lg transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-6">
        <div className="text-center text-slate-300">Cargando movimientos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">{error}</div>
    );
  }

  return (
    <>
    <div className="bg-slate-800/70 backdrop-blur-2xl rounded-2xl shadow-xl border border-slate-600/60 p-6">
      <h2 className="text-2xl font-bold mb-4 text-white">Movimientos</h2>

      {/* HERO: total del mes + navegación integrada */}
      <div className={`rounded-2xl p-5 mb-4 border bg-gradient-to-br ${
        esIngreso
          ? 'from-green-900/30 via-green-800/5 to-slate-800/50 border-green-700/30'
          : 'from-red-900/30 via-red-800/5 to-slate-800/50 border-red-700/30'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handlePrevMonth}
            className="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-600/60 text-slate-400 hover:text-white hover:border-slate-400 flex items-center justify-center transition-all shrink-0"
            aria-label="Mes anterior"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center flex-1 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              {MESES[selectedMonth]} {selectedYear}
            </span>
            <div className="text-[2.5rem] leading-none font-extrabold text-white mt-2 tracking-tight">
              {esIngreso ? '+' : '-'}{formatARS(esIngreso ? totalIngresos : totalGastos)}
            </div>
            <span className="text-sm text-slate-400 mt-1.5 block">
              total {esIngreso ? 'ingresos' : 'gastos'}
            </span>
          </div>
          <button
            onClick={handleNextMonth}
            className="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-600/60 text-slate-400 hover:text-white hover:border-slate-400 flex items-center justify-center transition-all shrink-0"
            aria-label="Mes siguiente"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 mb-4 p-1 bg-slate-700/50 rounded-xl w-fit">
        {(['gastos', 'ingresos'] as TabActivo[]).map((tab) => {
          const labels: Record<TabActivo, string> = { gastos: 'Gastos', ingresos: 'Ingresos' };
          const activeStyles: Record<TabActivo, string> = {
            gastos: 'bg-red-600 text-white',
            ingresos: 'bg-green-600 text-white',
          };
          return (
            <button
              key={tab}
              onClick={() => setTabActivo(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                tabActivo === tab ? activeStyles[tab] : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* FILTROS: búsqueda + categoría en fila */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por descripción…"
            aria-label="Buscar movimientos por descripción"
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-700/60 border border-slate-600/60 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="relative sm:w-48">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filtrar por categoría"
            className="w-full px-3 py-2 rounded-lg bg-slate-700/60 border border-slate-600/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none"
          >
            <option value="">Todas las categorías</option>
            {categoriasDelMes.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory('')}
              className="absolute inset-y-0 right-6 pr-0 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Limpiar filtro de categoría"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <>

          {listaActiva.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {searchQuery.trim() || selectedCategory ? (
                <>
                  <p className="text-lg">
                    No hay {esIngreso ? 'ingresos' : 'gastos'}
                    {searchQuery.trim() ? <> que coincidan con "<span className="text-slate-300 font-medium">{searchQuery.trim()}</span>"</> : ''}
                    {selectedCategory ? <> en la categoría <span className="text-slate-300 font-medium">{selectedCategory}</span></> : ''}.
                  </p>
                  <p className="text-sm mt-2">
                    Probá con otros filtros o{' '}
                    <button onClick={() => { setSearchQuery(''); setSelectedCategory(''); }} className="text-blue-400 hover:text-blue-300 underline">limpiá los filtros</button>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg">
                    No hay {esIngreso ? 'ingresos' : 'gastos'} en {MESES[selectedMonth]} {selectedYear}.
                  </p>
                  <p className="text-sm mt-2">
                    {movimientos.length === 0
                      ? `Comenzá registrando tu primer ${esIngreso ? 'ingreso' : 'gasto'} arriba`
                      : 'Probá navegando a otro mes'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* DESKTOP: Tabla agrupada por día */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700/60 border-b border-slate-600/60">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Descripción</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Categoría</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300 uppercase tracking-wider">Importe</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Nota</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-600/40">
                    {listaAgrupadaPorDia.map(({ key, label, items, total }) => (
                      <>
                        <tr key={`header-${key}`} className="bg-slate-700/30 border-y border-slate-600/50">
                          <td colSpan={3} className="px-4 py-2">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                          </td>
                          <td colSpan={2} className={`px-4 py-2 text-right text-xs font-semibold ${esIngreso ? 'text-green-400' : 'text-slate-400'}`}>
                            {esIngreso ? '+' : '-'}{formatARS(total)}
                          </td>
                        </tr>
                        {items.map((mov) => (
                          <tr key={mov.id} className="hover:bg-slate-700/40 transition-colors">
                            <td className="px-4 py-3 text-sm text-slate-100 font-medium">
                              <div className="flex items-center gap-2">
                                {mov.descripcion}
                                {mov.is_auto_generated && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-400/30 whitespace-nowrap">
                                    Auto
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                  esIngreso
                                    ? 'bg-green-500/20 text-green-300 border-green-400/30'
                                    : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                                }`}>
                                  {getNombreCategoria(mov)}
                                </span>
                                <ClasificacionBadge value={mov.clasificacion} />
                              </div>
                            </td>
                            <td className={`px-4 py-3 text-sm text-right font-semibold ${esIngreso ? 'text-green-300' : 'text-white'}`}>
                              {esIngreso ? '+' : '-'}{formatARS(mov.importe)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {mov.nota || <span className="text-slate-500">-</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => onEdit?.(mov)}
                                  className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteRequest(mov)}
                                  className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-700/40 border-t-2 border-slate-500">
                      <td colSpan={2} className="px-4 py-3 text-sm font-bold text-white text-right">Total:</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${esIngreso ? 'text-green-300' : 'text-white'}`}>
                        {esIngreso ? '+' : ''}{formatARS(esIngreso ? totalIngresos : totalGastos)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* MÓVIL: Agrupado por día */}
              <div className="sm:hidden space-y-4">
                {listaAgrupadaPorDia.map(({ key, label, items, total }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between px-1 mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                      <span className={`text-xs font-semibold ${esIngreso ? 'text-green-400' : 'text-slate-400'}`}>
                        {esIngreso ? '+' : '-'}{formatARS(total)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map(renderTarjetaMobile)}
                    </div>
                  </div>
                ))}
                <div className="bg-slate-800/40 border border-slate-600 rounded-xl px-4 py-3 flex items-center justify-between mt-3">
                  <span className="text-sm font-bold text-white">Total:</span>
                  <span className={`text-sm font-bold ${esIngreso ? 'text-green-300' : 'text-white'}`}>
                    {esIngreso ? '+' : ''}{formatARS(esIngreso ? totalIngresos : totalGastos)}
                  </span>
                </div>
              </div>
            </>
          )}
        </>

    </div>

      {/* Modal normal: eliminar movimiento regular */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteTarget(null)} />
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar movimiento</h3>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 border border-slate-600 bg-slate-800/60 text-slate-300 font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-medium py-2.5 rounded-lg transition-all text-sm"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Modal 3 opciones: eliminar movimiento auto-generado */}
      {autoDeleteTarget !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setAutoDeleteTarget(null)} />
          <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-400/30">Auto</span>
              <h3 className="text-lg font-semibold text-white">Movimiento automático</h3>
            </div>
            <p className="text-sm text-slate-300 mb-5">
              Este movimiento fue generado automáticamente. ¿Qué querés hacer?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleAutoDeleteSoloEsteMes}
                disabled={isDeleting}
                className="w-full border border-red-500/40 bg-red-500/10 text-red-200 font-medium py-2.5 rounded-lg hover:bg-red-500/20 disabled:opacity-50 transition-all text-sm text-left px-4"
              >
                <span className="font-semibold">Eliminar movimiento</span>
                <span className="block text-xs text-red-300/70 mt-0.5">Borra este movimiento definitivamente.</span>
              </button>
              <button
                onClick={() => setAutoDeleteTarget(null)}
                disabled={isDeleting}
                className="w-full border border-slate-700 bg-transparent text-slate-400 font-medium py-2 rounded-lg hover:bg-slate-800/40 disabled:opacity-50 transition-all text-sm"
              >
                Cancelar
              </button>
            </div>
            {isDeleting && <p className="text-xs text-slate-400 text-center mt-3">Procesando...</p>}
          </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MovimientoList;
