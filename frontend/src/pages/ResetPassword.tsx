import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('El token es obligatorio');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setIsLoading(true);

    try {
      await resetPassword(token, newPassword);
      setMessage('Tu contraseña se ha restablecido correctamente. Ahora puedes iniciar sesión con la nueva contraseña.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        setError(axiosError.response?.data?.detail || 'Error al restablecer la contraseña');
      } else {
        setError('Error al restablecer la contraseña');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900">
      <div className="max-w-md w-full">
        {/* Logo circular */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full border-2 border-blue-400/70 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-xl shadow-black/40">
            <span className="text-3xl text-blue-400">&#x1f511;</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 px-8 py-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-white tracking-wide">Restablecer contraseña</h1>
            <p className="text-slate-300 mt-2 text-sm">
              Introduce el token que recibiste y elige una nueva contraseña.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Mensajes */}
            {error && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-500/10 border border-green-300/60 text-green-100 px-4 py-3 rounded-lg text-sm">
                {message}
              </div>
            )}

            {/* Token */}
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-slate-100 mb-2">
                Token de restablecimiento
              </label>
              <input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Pega aquí el token recibido"
              />
            </div>

            {/* Nueva contraseña */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-100 mb-2">
                Nueva contraseña
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-100 mb-2">
                Confirmar nueva contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Repite la nueva contraseña"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 px-4 rounded-full tracking-wide uppercase text-sm shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 transition-all duration-200"
            >
              {isLoading ? 'Restableciendo...' : 'Restablecer contraseña'}
            </button>
          </form>

          {/* Links inferiores */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-slate-100/80 text-sm">
              <Link to="/login" className="font-semibold text-white hover:text-slate-100 underline-offset-4 hover:underline">
                Volver a iniciar sesión
              </Link>
            </p>
            <p className="text-slate-100/80 text-sm">
              ¿No tienes token?{' '}
              <Link to="/forgot-password" className="text-blue-300 hover:text-blue-200 font-medium transition-colors">
                Solicitar restablecimiento
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
