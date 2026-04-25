import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { getCurrentUser, logoutUser } from '../services/api';
import { clearCachedUser } from '../services/offlineDB';
import { AuthContext, type AuthContextType } from './AuthContext';

const AUTH_PREVIOUS_SESSION_KEY = 'auth:had_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  // Verificar sesión al montar (la cookie httpOnly se envía automáticamente)
  const checkSession = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      setSessionExpired(false);
      localStorage.setItem(AUTH_PREVIOUS_SESSION_KEY, '1');
    } catch (error: unknown) {
      const isExpired =
        !!error && typeof error === 'object' && 'response' in error && (error as any).response?.status === 401;
      // Mostrar "sesión expirada" solo si hubo una sesión previa en este navegador.
      const hadSession = localStorage.getItem(AUTH_PREVIOUS_SESSION_KEY) === '1';
      const shouldShowExpired = isExpired && hadSession;
      setSessionExpired(shouldShowExpired);
      if (shouldShowExpired) {
        // Evita mostrar el mismo banner en cada refresh de /login.
        localStorage.removeItem(AUTH_PREVIOUS_SESSION_KEY);
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (userFromLogin?: User) => {
    // Si /auth/login ya devolvió el usuario, evitamos una segunda llamada /auth/me.
    const userData = userFromLogin ?? await getCurrentUser();
    setUser(userData);
    setSessionExpired(false);
    localStorage.setItem(AUTH_PREVIOUS_SESSION_KEY, '1');
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch {
      // Si falla el logout del server, igual limpiamos el estado local
    }
    try {
      await clearCachedUser();
    } catch {
      // No detener el logout si la limpieza local falla
    }
    localStorage.removeItem(AUTH_PREVIOUS_SESSION_KEY);
    setUser(null);
    setSessionExpired(false);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
    sessionExpired,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
