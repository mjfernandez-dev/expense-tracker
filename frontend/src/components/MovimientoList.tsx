import { useEffect, useState, useMemo } from 'react';
import type { Movimiento } from '../types';
import { getMovimientos, deleteMovimiento } from '../services/api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

type TabActivo = 'gastos' | 'ingresos' | 'balance';

interface MovimientoListProps {
  onEdit?: (movimiento: Movimiento) => void;
}

function MovimientoList({ onEdit }: MovimientoListProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tabActivo, setTabActivo] = useState<TabActivo>('gastos');

  const fetchMovimientos = async () => {
    try {
      setLoading(true);
      const data = await getMovimientos();
      setMovimientos(data);
    } catch (err) {
      setError('Error al cargar los movimientos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovimientos();
  }, []);

  const movimientosMes = useMemo(() => {
    return movimientos.filter((mov) => {
      const date = new Date(mov.fecha);
      return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
    });
  }, [movimientos, selectedYear, selectedMonth]);

  const gastosMes = useMemo(() =>
    movimientosMes
      .filter((m) => m.tipo === 'gasto')
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [movimientosMes]
  );

  const ingresosMes = useMemo(() =>
    movimientosMes
      .filter((m) => m.tipo === 'ingreso')
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [movimientosMes]
  );

  const totalGastos = useMemo(() => gastosMes.reduce((sum, m) => sum + m.importe, 0), [gastosMes]);
  const totalIngresos = useMemo(() => ingresosMes.reduce((sum, m) => sum + m.importe, 0), [ingresosMes]);
  const balanceNeto = totalIngresos - totalGastos;

  const getNombreCategoria = (mov: Movimiento) =>
    mov.categoria?.nombre ?? mov.user_category?.nombre ?? 'Sin categoría';

  const handlePrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear((y) => y - 1); }
    else setSelectedMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear((y) => y + 1); }
    else setSelectedMonth((m) => m + 1);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return;
    setIsDeleting(true);
    try {
      await deleteMovimiento(deleteTarget);
      await fetchMovimientos();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const listaActiva = tabActivo === 'gastos' ? gastosMes : ingresosMes;
  const esIngreso = tabActivo === 'ingresos';

  const renderFila = (mov: Movimiento) => (
    <tr key={mov.id} className="hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3 text-sm text-slate-300">
        {new Date(mov.fecha).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-sm text-slate-100 font-medium">
        {mov.descripcion}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
          esIngreso
            ? 'bg-green-500/20 text-green-300 border-green-400/30'
            : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
        }`}>
          {getNombreCategoria(mov)}
        </span>
      </td>
      <td className={`px-4 py-3 text-sm text-right font-semibold ${esIngreso ? 'text-green-300' : 'text-white'}`}>
        {esIngreso ? '+' : '-'}${mov.importe.toFixed(2)}
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
            onClick={() => setDeleteTarget(mov.id)}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );

  const renderTarjetaMobile = (mov: Movimiento) => {
    const isExpanded = expandedId === mov.id;
    return (
      <div key={mov.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpandedId(isExpanded ? null : mov.id)}
          className="w-full px-4 py-3 text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100 truncate mr-3">{mov.descripcion}</span>
            <span className={`text-sm font-bold whitespace-nowrap ${esIngreso ? 'text-green-300' : 'text-white'}`}>
              {esIngreso ? '+' : '-'}${mov.importe.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{new Date(mov.fecha).toLocaleDateString()}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                esIngreso
                  ? 'bg-green-500/20 text-green-300 border-green-400/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
              }`}>
                {getNombreCategoria(mov)}
              </span>
            </div>
            <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-4 pb-3 pt-1 border-t border-slate-700/40">
            {mov.nota && (
              <p className="text-xs text-slate-400 mb-3"><span className="text-slate-500">Nota:</span> {mov.nota}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onEdit?.(mov)}
                className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              >
                Editar
              </button>
              <button
                onClick={() => setDeleteTarget(mov.id)}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
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
    <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
      <h2 className="text-2xl font-bold mb-4 text-white">Movimientos</h2>

      {/* TABS */}
      <div className="flex gap-1 mb-5 p-1 bg-slate-950/50 rounded-xl w-fit">
        {(['gastos', 'ingresos', 'balance'] as TabActivo[]).map((tab) => {
          const labels: Record<TabActivo, string> = { gastos: 'Gastos', ingresos: 'Ingresos', balance: 'Balance' };
          const activeStyles: Record<TabActivo, string> = {
            gastos: 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]',
            ingresos: 'bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]',
            balance: 'bg-slate-600 text-white shadow-[0_0_10px_rgba(148,163,184,0.3)]',
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

      {/* SELECTOR DE MES */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="border border-blue-400/70 bg-slate-800/40 text-blue-300 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-all"
        >
          &larr; Anterior
        </button>
        <h3 className="text-lg font-semibold text-white">{MESES[selectedMonth]} {selectedYear}</h3>
        <button
          onClick={handleNextMonth}
          className="border border-blue-400/70 bg-slate-800/40 text-blue-300 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-all"
        >
          Siguiente &rarr;
        </button>
      </div>

      {/* TAB: BALANCE */}
      {tabActivo === 'balance' && (
        <div className="space-y-3">
          <div className="bg-green-500/10 border border-green-400/40 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-green-200">Ingresos {MESES[selectedMonth]}</span>
            <span className="text-2xl font-bold text-green-300">+${totalIngresos.toFixed(2)}</span>
          </div>
          <div className="bg-red-500/10 border border-red-400/40 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-red-200">Gastos {MESES[selectedMonth]}</span>
            <span className="text-2xl font-bold text-red-300">-${totalGastos.toFixed(2)}</span>
          </div>
          <div className={`rounded-xl p-4 flex items-center justify-between border ${
            balanceNeto >= 0
              ? 'bg-emerald-500/15 border-emerald-400/50'
              : 'bg-red-500/15 border-red-400/50'
          }`}>
            <span className={`text-sm font-semibold ${balanceNeto >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
              Balance neto {MESES[selectedMonth]}
            </span>
            <span className={`text-3xl font-bold ${balanceNeto >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {balanceNeto >= 0 ? '+' : ''}${balanceNeto.toFixed(2)}
            </span>
          </div>
          {movimientosMes.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-4">
              Sin movimientos en {MESES[selectedMonth]} {selectedYear}
            </p>
          )}
        </div>
      )}

      {/* TABS: GASTOS / INGRESOS */}
      {tabActivo !== 'balance' && (
        <>
          {/* Resumen del tab */}
          <div className={`rounded-lg p-4 mb-4 border ${
            esIngreso
              ? 'bg-green-500/10 border-green-300/60'
              : 'bg-blue-500/10 border-blue-300/60'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${esIngreso ? 'text-green-200' : 'text-blue-200'}`}>
                Total {esIngreso ? 'ingresos' : 'gastos'} {MESES[selectedMonth]}
              </span>
              <span className={`text-2xl font-bold ${esIngreso ? 'text-green-100' : 'text-blue-100'}`}>
                {esIngreso ? '+' : ''}${(esIngreso ? totalIngresos : totalGastos).toFixed(2)}
              </span>
            </div>
          </div>

          {listaActiva.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-lg">
                No hay {esIngreso ? 'ingresos' : 'gastos'} en {MESES[selectedMonth]} {selectedYear}.
              </p>
              <p className="text-sm mt-2">
                {movimientos.length === 0
                  ? `Comenzá registrando tu primer ${esIngreso ? 'ingreso' : 'gasto'} arriba`
                  : 'Probá navegando a otro mes'}
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP: Tabla */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/70">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Descripción</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Categoría</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300 uppercase tracking-wider">Importe</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 uppercase tracking-wider">Nota</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {listaActiva.map(renderFila)}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800/40 border-t-2 border-slate-600">
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-white text-right">Total:</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${esIngreso ? 'text-green-300' : 'text-white'}`}>
                        {esIngreso ? '+' : ''}${(esIngreso ? totalIngresos : totalGastos).toFixed(2)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* MÓVIL: Acordeón */}
              <div className="sm:hidden space-y-2">
                {listaActiva.map(renderTarjetaMobile)}
                <div className="bg-slate-800/40 border border-slate-600 rounded-xl px-4 py-3 flex items-center justify-between mt-3">
                  <span className="text-sm font-bold text-white">Total:</span>
                  <span className={`text-sm font-bold ${esIngreso ? 'text-green-300' : 'text-white'}`}>
                    {esIngreso ? '+' : ''}${(esIngreso ? totalIngresos : totalGastos).toFixed(2)}
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteTarget(null)} />
          <div className="relative bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Eliminar movimiento</h3>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro de que deseas eliminar este movimiento? Esta acción no se puede deshacer.
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
                className="flex-1 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-medium py-2.5 rounded-lg shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-300/50 transition-all text-sm"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MovimientoList;
