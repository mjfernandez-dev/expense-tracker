// SERVICIO: Centraliza todas las llamadas HTTP al backend
import axios from 'axios';
// CONEXIÓN: Importamos los tipos definidos en types/index.ts
import type { Category, Expense, ExpenseCreate } from '../types';

// URL base del backend (FastAPI corriendo en puerto 8000)
const API_URL = 'http://127.0.0.1:8000';

// Instancia configurada de axios con la URL base
const api = axios.create({
  baseURL: API_URL,
});

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