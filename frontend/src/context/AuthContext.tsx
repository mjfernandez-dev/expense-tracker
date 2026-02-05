import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { getCurrentUser, setAuthToken, removeAuthToken } from '../services/api';

// Tipo del contexto de autenticación
interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

// Crear el contexto
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider que envuelve la aplicación
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Al montar, verificar si hay token guardado
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setAuthToken(savedToken);
      setToken(savedToken);
      // Obtener datos del usuario
      getCurrentUser()
        .then(userData => {
          setUser(userData);
        })
        .catch(() => {
          // Token inválido o expirado
          localStorage.removeItem('token');
          removeAuthToken();
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  // Función de login: guarda token y obtiene usuario
  const login = async (newToken: string) => {
    localStorage.setItem('token', newToken);
    setAuthToken(newToken);
    setToken(newToken);
    const userData = await getCurrentUser();
    setUser(userData);
  };

  // Función de logout: limpia todo
  const logout = () => {
    localStorage.removeItem('token');
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

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook para usar el contexto
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
