import { createContext } from 'react';
import type { User } from '../types';

// Tipo del contexto de autenticación
export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (userFromLogin?: User) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  logoutError: string | null;
  setUser: (user: User | null) => void;
}

// Crear el contexto
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

