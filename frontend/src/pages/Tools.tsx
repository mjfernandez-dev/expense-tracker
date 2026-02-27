import { useNavigate } from 'react-router-dom';

function Tools() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Herramientas</h1>
            <p className="text-slate-300 text-sm">Utilidades para gestionar tus finanzas</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
          >
            Volver al inicio
          </button>
        </div>

        {/* GRID DE HERRAMIENTAS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

          {/* Card: Dividir Gastos */}
          <div
            onClick={() => navigate('/tools/split-groups')}
            className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all duration-300 cursor-pointer group"
          >
            <div className="text-4xl mb-4">💸</div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
              Dividir Gastos
            </h3>
            <p className="text-sm text-slate-400">
              Crea grupos, registra gastos compartidos y calcula quien le debe a quien.
            </p>
          </div>

          {/* Card: Categorías */}
          <div
            onClick={() => navigate('/tools/categorias')}
            className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all duration-300 cursor-pointer group"
          >
            <div className="text-4xl mb-4">🏷️</div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
              Categorías
            </h3>
            <p className="text-sm text-slate-400">
              Administrá tus categorías personalizadas para clasificar movimientos.
            </p>
          </div>

          {/* Card: Recurrentes */}
          <div
            onClick={() => navigate('/tools/recurrentes')}
            className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all duration-300 cursor-pointer group"
          >
            <div className="text-4xl mb-4">🔄</div>
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">
              Gastos Recurrentes
            </h3>
            <p className="text-sm text-slate-400">
              Gastos fijos que se generan automáticamente el 1° de cada mes.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Tools;
