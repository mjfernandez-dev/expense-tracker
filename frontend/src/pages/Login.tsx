import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { loginUser } from '../services/api';
import authLogo from '../assets/auth-logo.jpeg';
import { getApiErrorMessage } from '../utils/apiError';

const SHOW_IMAGE_LOGO = false;

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { successMessage?: string } | null)?.successMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await loginUser(username, password);
      await login();
      navigate('/');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Error al iniciar sesion'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full border-2 border-blue-400/70 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-xl shadow-black/40">
            {SHOW_IMAGE_LOGO ? (
              <img
                src={authLogo}
                alt="Logo FinanzAPP"
                className="w-16 h-16 object-cover"
                width="64"
                height="64"
                loading="lazy"
              />
            ) : (
              <span className="text-3xl text-blue-400">📊</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wide">FinanzAPP</h1>
          <p className="text-slate-400 mt-1 text-sm">Gestiona tus finanzas personales</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 px-8 py-10 relative z-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white tracking-wide">Iniciar Sesion</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {successMessage && (
              <div role="status" className="bg-green-500/10 border border-green-300/60 text-green-100 px-4 py-3 rounded-lg text-sm">
                {successMessage}
              </div>
            )}

            {error && (
              <div role="alert" className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-100 mb-2">
                Usuario
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Tu nombre de usuario"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-100 mb-2">
                Contrasena
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 pr-11 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Tu contrasena"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200 focus:outline-none"
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors"
                >
                  Olvidaste tu contrasena?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 px-4 rounded-full tracking-wide uppercase text-sm shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 transition-all duration-200"
            >
              {isLoading ? 'Iniciando sesion...' : 'Iniciar Sesion'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-100/80 text-sm">
              No tienes cuenta?{' '}
              <Link
                to="/register"
                className="font-semibold text-white hover:text-slate-100 underline-offset-4 hover:underline"
              >
                Registrate aqui
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
