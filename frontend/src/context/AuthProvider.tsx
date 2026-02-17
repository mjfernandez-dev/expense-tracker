import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { getCurrentUser, setAuthToken, removeAuthToken } from '../services/api';
import { AuthContext, type AuthContextType } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const getSavedToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getSavedToken);
  const [isLoading, setIsLoading] = useState<boolean>(!!getSavedToken());

  useEffect(() => {
    if (!token) {
      return;
    }

    setAuthToken(token);
    getCurrentUser()
      .then(userData => {
        setUser(userData);
      })
      .catch(() => {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        removeAuthToken();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  const login = async (newToken: string, remember: boolean = true) => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');

    if (remember) {
      localStorage.setItem('token', newToken);
    } else {
      sessionStorage.setItem('token', newToken);
    }

    setAuthToken(newToken);
    setToken(newToken);
    const userData = await getCurrentUser();
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    removeAuthToken();
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
