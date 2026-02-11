// SERVICIO: Centraliza todas las llamadas HTTP al backend
import axios from 'axios';
// CONEXIÓN: Importamos los tipos definidos en types/index.ts
import type {
  Category,
  Expense,
  ExpenseCreate,
  User,
  UserCreate,
  AuthResponse,
  PasswordResetResponse,
} from '../types';

// URL base del backend (FastAPI corriendo en puerto 8000)
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Instancia configurada de axios con la URL base
const api = axios.create({
  baseURL: API_URL,
});

// ============== FUNCIONES PARA MANEJO DE TOKEN ==============

// Agregar token JWT al header de todas las peticiones
export const setAuthToken = (token: string) => {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

// Eliminar token del header
export const removeAuthToken = () => {
  delete api.defaults.headers.common['Authorization'];
};

// ============== FUNCIONES DE AUTENTICACIÓN ==============

// Registrar nuevo usuario
// POST /auth/register
export const registerUser = async (userData: UserCreate): Promise<User> => {
  const response = await api.post('/auth/register', userData);
  return response.data;
};

// Login - devuelve token JWT
// POST /auth/login (usa form-data, no JSON)
export const loginUser = async (username: string, password: string): Promise<AuthResponse> => {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await api.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return response.data;
};

// Solicitar restablecimiento de contraseña
// POST /auth/forgot-password
export const requestPasswordReset = async (email: string): Promise<PasswordResetResponse> => {
  const response = await api.post('/auth/forgot-password', { email });
  return response.data;
};

// Confirmar restablecimiento de contraseña con token
// POST /auth/reset-password
export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  await api.post('/auth/reset-password', {
    token,
    new_password: newPassword,
  });
};

// Cambiar contraseña (usuario autenticado)
// POST /auth/change-password
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
};

// Obtener usuario actual
// GET /auth/me
export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get('/auth/me');
  return response.data;
};

// ============== FUNCIONES PARA CATEGORÍAS ==============

// Obtener todas las categorías
// GET /categories/ → devuelve Category[]
export const getCategories = async (): Promise<Category[]> => {
  const response = await api.get('/categories/');
  return response.data;  // axios.data contiene el body de la respuesta
};

// Crear una categoría
// POST /categories/ → envía {nombre}, devuelve Category
export const createCategory = async (nombre: string): Promise<Category> => {
  const response = await api.post('/categories/', { nombre });
  return response.data;
};

// ============== FUNCIONES PARA GASTOS ==============

// Obtener todos los gastos
// GET /expenses/ → devuelve Expense[]
export const getExpenses = async (): Promise<Expense[]> => {
  const response = await api.get('/expenses/');
  return response.data;
};

// Crear un gasto
// POST /expenses/ → envía ExpenseCreate, devuelve Expense
export const createExpense = async (expense: ExpenseCreate): Promise<Expense> => {
  const response = await api.post('/expenses/', expense);
  return response.data;
};

// Obtener un gasto específico por ID
// GET /expenses/{id} → devuelve Expense
export const getExpense = async (id: number): Promise<Expense> => {
  const response = await api.get(`/expenses/${id}`);
  return response.data;
};

// Eliminar un gasto
// DELETE /expenses/{id} → devuelve mensaje de confirmación
export const deleteExpense = async (id: number): Promise<void> => {
  await api.delete(`/expenses/${id}`);
  // void porque no necesitamos el body de la respuesta
};

// Actualizar un gasto
// PUT /expenses/{id} → envía ExpenseCreate, devuelve Expense actualizado
export const updateExpense = async (id: number, expense: ExpenseCreate): Promise<Expense> => {
  const response = await api.put(`/expenses/${id}`, expense);
  return response.data;
};

// Eliminar una categoría
// DELETE /categories/{id}
export const deleteCategory = async (id: number): Promise<void> => {
  await api.delete(`/categories/${id}`);
};

// Actualizar una categoría
// PUT /categories/{id} → envía {nombre}, devuelve Category
export const updateCategory = async (id: number, nombre: string): Promise<Category> => {
  const response = await api.put(`/categories/${id}`, { nombre });
  return response.data;
};