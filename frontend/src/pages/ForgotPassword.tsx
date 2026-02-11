import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/api';
import authLogo from '../assets/auth-logo.jpeg';

// Cambia este flag a false si quieres usar solo el icono 🔐
const SHOW_IMAGE_LOGO = true;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setResetToken(null);
    setIsLoading(true);

    try {
      const response = await requestPasswordReset(email);
      setMessage(response.message);

      // En desarrollo, el backend devuelve el token para poder probar el flujo
      if (response.reset_token) {
        setResetToken(response.reset_token);
      }
    } catch {
      setError('Ocurrió un error al solicitar el restablecimiento de contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900">
      <div className="max-w-md w-full">
        {/* Icono / imagen circular superior (reset) */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full border-2 border-blue-400/70 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-xl shadow-black/40">
            {SHOW_IMAGE_LOGO ? (
              <img
                src={authLogo}
                alt="Logo de gastos"
                className="w-16 h-16 object-cover"
              />
            ) : (
              <span className="text-3xl text-blue-400">🔐</span>
            )}
          </div>
        </div>

        {/* Tarjeta de reset */}
        <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 px-8 py-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-white tracking-wide">¿Olvidaste tu contraseña?</h1>
            <p className="text-slate-300 mt-2 text-sm">
              Ingresa tu email y, si existe una cuenta asociada, podrás restablecer tu contraseña.
            </p>
          </div>

          {/* Formulario */}
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

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-100 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="tu@email.com"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold py-3 px-4 rounded-full tracking-wide uppercase text-sm shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 transition-all duration-200"
            >
              {isLoading ? 'Enviando...' : 'Enviar instrucciones'}
            </button>
          </form>

          {/* Token de prueba (solo desarrollo) */}
          {resetToken && (
            <div className="mt-6 bg-amber-500/10 border border-amber-300/60 text-amber-100 px-4 py-3 rounded-lg text-sm">
              <p className="font-semibold mb-1">Token de prueba (solo desarrollo):</p>
              <p className="break-all">{resetToken}</p>
              <p className="mt-2">
                Puedes usar este token en la pantalla de{' '}
                <Link
                  to="/reset-password"
                  className="text-blue-300 hover:text-blue-200 font-medium underline-offset-4 hover:underline"
                >
                  Restablecer contraseña
                </Link>
                .
              </p>
            </div>
          )}

          {/* Links inferiores */}
          <div className="mt-6 text-center">
            <p className="text-slate-100/80 text-sm">
              ¿Recordaste tu contraseña?{' '}
              <Link
                to="/login"
                className="font-semibold text-white hover:text-slate-100 underline-offset-4 hover:underline"
              >
                Volver a iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

