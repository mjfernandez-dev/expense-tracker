import { useNavigate } from 'react-router-dom';
import CategoryManager from '../components/CategoryManager';

function CategoriasPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Categorías</h1>
            <p className="text-slate-300 text-sm">Administrá tus categorías personalizadas</p>
          </div>
          <button
            onClick={() => navigate('/tools')}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
          >
            ← Volver
          </button>
        </div>

        <CategoryManager />

      </div>
    </div>
  );
}

export default CategoriasPage;
