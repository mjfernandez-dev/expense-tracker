import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { getCurrentUser, refreshSession, logoutUser } from '../services/api';
import { clearCachedUser } from '../services/offlineDB';
import { AuthContext, type AuthContextType } from './AuthContext';

const AUTH_PREVIOUS_SESSION_KEY = 'auth:had_session';

interface AuthProviderProps { children: ReactNode; }

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Verificar sesión al montar usando refresh proactivo.
  // Llama a /auth/refresh directamente en vez de /auth/me para evitar el ciclo
  // /auth/me → 401 → refresh → retry que genera requests fallidas y agrega latencia,
  // especialmente en cold start de Render free tier.
  const checkSession = useCallback(async () => {
    try {
      const userData = await refreshSession();
      setUser(userData);
      setSessionExpired(false);
      localStorage.setItem(AUTH_PREVIOUS_SESSION_KEY, '1');
    } catch (error: unknown) {
      const isExpired =
        !!error && typeof error === 'object' && 'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 401;
      const hadSession = localStorage.getItem(AUTH_PREVIOUS_SESSION_KEY) === '1';
      const shouldShowExpired = isExpired && hadSession;
      setSessionExpired(shouldShowExpired);
      if (shouldShowExpired) {
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
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : 'Error al cerrar sesión en el servidor');
    }
    try {
      await clearCachedUser();
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : 'Error al limpiar caché local');
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
    logoutError,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
