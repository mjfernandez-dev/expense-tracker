// SERVICIO: Centraliza todas las llamadas HTTP al backend
import axios from 'axios';
// CONEXIÓN: Importamos los tipos definidos en types/index.ts
import type {
  Category,
  UserCategory,
  Movimiento,
  MovimientoCreate,
  GastoFijo,
  User,
  UserCreate,
  PasswordResetResponse,
  Contact,
  ContactCreate,
  SplitGroup,
  SplitGroupCreate,
  SplitGroupMember,
  SplitExpense,
  SplitExpenseCreate,
  QuickAddMemberData,
  GroupBalanceSummary,
  PaymentCreate,
  PaymentPreferenceResponse,
  Payment,
} from '../types';

// URL base del backend (FastAPI corriendo en puerto 8000)
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Instancia configurada de axios con la URL base
// withCredentials: true envía automáticamente la cookie httpOnly en cada request
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// ============== FUNCIONES DE AUTENTICACIÓN ==============

// Registrar nuevo usuario
// POST /auth/register
export const registerUser = async (userData: UserCreate): Promise<User> => {
  const response = await api.post('/auth/register', userData);
  return response.data;
};

// Login - la cookie httpOnly se setea automáticamente por el backend
// POST /auth/login (usa form-data, no JSON)
export const loginUser = async (username: string, password: string): Promise<void> => {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  await api.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
};

// Logout - elimina la cookie httpOnly
// POST /auth/logout
export const logoutUser = async (): Promise<void> => {
  await api.post('/auth/logout');
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

// Actualizar datos de pago del usuario
// PUT /auth/payment-info
export const updatePaymentInfo = async (aliasBancario: string | null, cvu: string | null): Promise<User> => {
  const response = await api.put('/auth/payment-info', {
    alias_bancario: aliasBancario,
    cvu: cvu,
  });
  return response.data;
};

// ============== FUNCIONES PARA CATEGORÍAS ==============

// Obtener categorías del sistema (predeterminadas, solo lectura)
// GET /categories/ → devuelve Category[]
export const getCategories = async (): Promise<Category[]> => {
  const response = await api.get('/categories/');
  return response.data;
};

// Obtener categorías personalizadas del usuario autenticado
// GET /user-categories/ → devuelve UserCategory[]
export const getUserCategories = async (): Promise<UserCategory[]> => {
  const response = await api.get('/user-categories/');
  return response.data;
};

// Crear una categoría personalizada
// POST /user-categories/ → envía {nombre}, devuelve UserCategory
export const createCategory = async (nombre: string): Promise<UserCategory> => {
  const response = await api.post('/user-categories/', { nombre });
  return response.data;
};

// ============== FUNCIONES PARA MOVIMIENTOS ==============

// Obtener todos los movimientos (opcionalmente filtrar por tipo)
// GET /movimientos/ → devuelve Movimiento[]
export const getMovimientos = async (tipo?: 'gasto' | 'ingreso'): Promise<Movimiento[]> => {
  const params = tipo ? { tipo } : {};
  const response = await api.get('/movimientos/', { params });
  return response.data;
};

// Crear un movimiento
// POST /movimientos/ → envía MovimientoCreate, devuelve Movimiento
export const createMovimiento = async (movimiento: MovimientoCreate): Promise<Movimiento> => {
  const response = await api.post('/movimientos/', movimiento);
  return response.data;
};

// Obtener un movimiento específico por ID
// GET /movimientos/{id} → devuelve Movimiento
export const getMovimiento = async (id: number): Promise<Movimiento> => {
  const response = await api.get(`/movimientos/${id}`);
  return response.data;
};

// Eliminar un movimiento
// DELETE /movimientos/{id}
export const deleteMovimiento = async (id: number): Promise<void> => {
  await api.delete(`/movimientos/${id}`);
};

// Actualizar un movimiento
// PUT /movimientos/{id} → envía MovimientoCreate, devuelve Movimiento actualizado
export const updateMovimiento = async (id: number, movimiento: MovimientoCreate): Promise<Movimiento> => {
  const response = await api.put(`/movimientos/${id}`, movimiento);
  return response.data;
};

// Alias de compatibilidad para imports existentes
export const getExpenses = getMovimientos;
export const createExpense = createMovimiento;
export const getExpense = getMovimiento;
export const deleteExpense = deleteMovimiento;
export const updateExpense = (id: number, expense: MovimientoCreate) => updateMovimiento(id, expense);

// Eliminar una categoría personalizada
// DELETE /user-categories/{id}
export const deleteCategory = async (id: number): Promise<void> => {
  await api.delete(`/user-categories/${id}`);
};

// Actualizar una categoría personalizada
// PUT /user-categories/{id} → envía {nombre}, devuelve UserCategory
export const updateCategory = async (id: number, nombre: string): Promise<UserCategory> => {
  const response = await api.put(`/user-categories/${id}`, { nombre });
  return response.data;
};

// ============== FUNCIONES PARA CONTACTOS ==============

export const getContacts = async (): Promise<Contact[]> => {
  const response = await api.get('/contacts/');
  return response.data;
};

export const createContact = async (contact: ContactCreate): Promise<Contact> => {
  const response = await api.post('/contacts/', contact);
  return response.data;
};

export const updateContact = async (id: number, contact: ContactCreate): Promise<Contact> => {
  const response = await api.put(`/contacts/${id}`, contact);
  return response.data;
};

export const deleteContact = async (id: number): Promise<void> => {
  await api.delete(`/contacts/${id}`);
};

// ============== FUNCIONES PARA GRUPOS DIVIDIDOS ==============

export const getSplitGroups = async (): Promise<SplitGroup[]> => {
  const response = await api.get('/split-groups/');
  return response.data;
};

export const getSplitGroup = async (id: number): Promise<SplitGroup> => {
  const response = await api.get(`/split-groups/${id}`);
  return response.data;
};

export const createSplitGroup = async (group: SplitGroupCreate): Promise<SplitGroup> => {
  const response = await api.post('/split-groups/', group);
  return response.data;
};

export const updateSplitGroup = async (id: number, data: { nombre: string; descripcion: string | null }): Promise<SplitGroup> => {
  const response = await api.put(`/split-groups/${id}`, data);
  return response.data;
};

export const deleteSplitGroup = async (id: number): Promise<void> => {
  await api.delete(`/split-groups/${id}`);
};

export const toggleGroupActive = async (id: number): Promise<SplitGroup> => {
  const response = await api.put(`/split-groups/${id}/toggle-active`);
  return response.data;
};

export const addGroupMember = async (groupId: number, contactId: number): Promise<SplitGroupMember> => {
  const response = await api.post(`/split-groups/${groupId}/members`, { contact_id: contactId });
  return response.data;
};

export const removeGroupMember = async (groupId: number, memberId: number): Promise<void> => {
  await api.delete(`/split-groups/${groupId}/members/${memberId}`);
};

export const quickAddGroupMember = async (groupId: number, data: QuickAddMemberData): Promise<SplitGroupMember> => {
  const response = await api.post(`/split-groups/${groupId}/members/quick`, data);
  return response.data;
};

// ============== FUNCIONES PARA GASTOS DIVIDIDOS ==============

export const getSplitExpenses = async (groupId: number): Promise<SplitExpense[]> => {
  const response = await api.get(`/split-groups/${groupId}/expenses`);
  return response.data;
};

export const createSplitExpense = async (groupId: number, expense: SplitExpenseCreate): Promise<SplitExpense> => {
  const response = await api.post(`/split-groups/${groupId}/expenses`, expense);
  return response.data;
};

export const updateSplitExpense = async (groupId: number, expenseId: number, expense: SplitExpenseCreate): Promise<SplitExpense> => {
  const response = await api.put(`/split-groups/${groupId}/expenses/${expenseId}`, expense);
  return response.data;
};

export const deleteSplitExpense = async (groupId: number, expenseId: number): Promise<void> => {
  await api.delete(`/split-groups/${groupId}/expenses/${expenseId}`);
};

// ============== FUNCIONES PARA BALANCES ==============

export const getGroupBalances = async (groupId: number): Promise<GroupBalanceSummary> => {
  const response = await api.get(`/split-groups/${groupId}/balances`);
  return response.data;
};

// ============== FUNCIONES PARA GASTOS FIJOS ==============

// Listar gastos fijos del usuario con stats históricos
// GET /gastos-fijos/ → devuelve GastoFijo[]
export const getGastosFijos = async (): Promise<GastoFijo[]> => {
  const response = await api.get('/gastos-fijos/');
  return response.data;
};

// Activar o pausar un gasto fijo
// PUT /gastos-fijos/{id} → envía {activo}, devuelve GastoFijo actualizado
export const toggleGastoFijo = async (id: number, activo: boolean): Promise<GastoFijo> => {
  const response = await api.put(`/gastos-fijos/${id}`, { activo });
  return response.data;
};

// Eliminar un gasto fijo (los movimientos existentes quedan desvinculados)
// DELETE /gastos-fijos/{id}
export const deleteGastoFijo = async (id: number): Promise<void> => {
  await api.delete(`/gastos-fijos/${id}`);
};

// Triggerear generación manual del mes actual (idempotente)
// POST /gastos-fijos/generar-mes
export const generarGastosFijosMes = async (): Promise<{ message: string }> => {
  const response = await api.post('/gastos-fijos/generar-mes');
  return response.data;
};

// ============== FUNCIONES PARA PAGOS (MERCADO PAGO) ==============

export const createPaymentPreference = async (data: PaymentCreate): Promise<PaymentPreferenceResponse> => {
  const response = await api.post('/payments/create-preference', data);
  return response.data;
};

export const getGroupPayments = async (groupId: number): Promise<Payment[]> => {
  const response = await api.get(`/payments/group/${groupId}`);
  return response.data;
};

export const getPaymentStatus = async (paymentId: number): Promise<Payment> => {
  const response = await api.get(`/payments/${paymentId}/status`);
  return response.data;
};