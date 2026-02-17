import { createContext } from 'react';
import type { User } from '../types';

// Tipo del contexto de autenticación
export interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, remember?: boolean) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

// Crear el contexto
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

