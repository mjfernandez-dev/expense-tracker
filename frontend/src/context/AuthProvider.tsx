import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { getCurrentUser, logoutUser } from '../services/api';
import { AuthContext, type AuthContextType } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Verificar sesión al montar (la cookie httpOnly se envía automáticamente)
  const checkSession = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async () => {
    // La cookie ya fue seteada por el backend en /auth/login
    // Solo necesitamos cargar los datos del usuario
    const userData = await getCurrentUser();
    setUser(userData);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch {
      // Si falla el logout del server, igual limpiamos el estado local
    }
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
