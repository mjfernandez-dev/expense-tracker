import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { loginUser } from '../services/api';
import authLogo from '../assets/auth-logo.jpeg';

// Cambia este flag a false si quieres usar el icono 📊 en lugar de la imagen
const SHOW_IMAGE_LOGO = true;

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await loginUser(username, password);
      await login(response.access_token, rememberMe);
      navigate('/');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        setError(axiosError.response?.data?.detail || 'Error al iniciar sesión');
      } else {
        setError('Error al iniciar sesión');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900">
      <div className="max-w-md w-full">
        {/* Branding: Logo + Nombre + Descripción */}
        <div className="text-center mb-8">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="w-20 h-20 mx-auto mb-4 rounded-full border-2 border-blue-400/70 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-xl shadow-black/40 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950 transition"
          >
            {SHOW_IMAGE_LOGO ? (
              <img
                src={authLogo}
                alt="Logo FinanzAPP"
                className="w-16 h-16 object-cover"
              />
            ) : (
              <span className="text-3xl text-blue-400">📊</span>
            )}
          </button>
          <h1 className="text-3xl font-bold text-white tracking-wide">FinanzAPP</h1>
          <p className="text-slate-400 mt-1 text-sm">Gestiona tus finanzas personales</p>
        </div>

        {/* Tarjeta de login */}
        <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 px-8 py-10 relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white tracking-wide">Iniciar Sesión</h2>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-100 mb-2">
                Usuario
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Tu nombre de usuario"
              />
            </div>

            {/* Password + ¿Olvidaste tu contraseña? */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-100 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-11 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200 focus:outline-none"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <label className="inline-flex items-center text-xs text-slate-200">
                  <input
                    type="checkbox"
                    className="mr-2 h-4 w-4 rounded border-slate-500 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Recordar sesión en este equipo
                </label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>

            {/* Botón de login */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 px-4 rounded-full tracking-wide uppercase text-sm shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 transition-all duration-200"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Link a registro */}
          <div className="mt-8 text-center">
            <p className="text-slate-100/80 text-sm">
              ¿No tienes cuenta?{' '}
              <Link
                to="/register"
                className="font-semibold text-white hover:text-slate-100 underline-offset-4 hover:underline"
              >
                Regístrate aquí
              </Link>
            </p>
          </div>
        </div>

        {/* Preview de imagen a pantalla casi completa */}
        {isPreviewOpen && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/70"
            onClick={() => setIsPreviewOpen(false)}
          >
            <div
              className="relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-black/80 text-white text-sm flex items-center justify-center shadow-md hover:bg-black"
              >
                ✕
              </button>
              <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-full border-4 border-blue-400 bg-slate-950 overflow-hidden shadow-2xl">
                {SHOW_IMAGE_LOGO ? (
                  <img
                    src={authLogo}
                    alt="Logo de gastos ampliado"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-7xl text-blue-400">📊</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
