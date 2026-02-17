import { createContext } from 'react';
import type { User } from '../types';

// Tipo del contexto de autenticación
export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

// Crear el contexto
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

