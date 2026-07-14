// SERVICIO: Centraliza todas las llamadas HTTP al backend
import axios from 'axios';
import {
  getCachedMovimientos, saveMovimientos,
  getCachedCategories, saveCategories,
  getCachedUserCategories, saveUserCategories,
  getCachedUser, saveUser, clearCachedUser,
  enqueueOperation,
} from './offlineDB';
// CONEXIÓN: Importamos los tipos definidos en types/index.ts
import type {
  Category,
  UserCategory,
  Movimiento,
  MovimientoCreate,
  User,
  UserCreate,
  PasswordResetResponse,
  AuthResponse,
  Ciclo,
  CicloCreate,
  PresupuestoItemCreate,
  GastoFijo,
  GastoFijoUpdate,
  WishlistItem,
  WishlistItemCreate,
  WishlistItemUpdate,
  WishlistListResponse,
  GoalContributeRequest,
  GoalWithdrawRequest,
  GoalContribution,
} from '../types';

// URL base del backend (FastAPI corriendo en puerto 8000)
const API_URL = import.meta.env.VITE_API_URL || '/api';

// Instancia configurada de axios con la URL base
// withCredentials: true envía automáticamente la cookie httpOnly en cada request
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 35000, // cubre cold start de Render free tier (~20-50s)
});

// ============== INTERCEPTOR: REFRESH TOKEN AUTOMÁTICO ==============
// Cuando el backend devuelve 401, intenta renovar el access_token usando el
// refresh_token (cookie httpOnly). Si lo renueva, reintenta el request original
// transparentemente. Si el request original era /auth/me, podemos reutilizar
// la respuesta de refresh para evitar una segunda llamada innecesaria.

let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

function notifyRefreshDone() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Si ya hay un refresh en curso, encolar este request y esperar
        return new Promise((resolve, reject) => {
          refreshSubscribers.push(() => {
            api(originalRequest).then(resolve).catch(reject);
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await api.post<{ message: string; user?: User }>('/auth/refresh');
        notifyRefreshDone();
        isRefreshing = false;

        if (originalRequest.url?.includes('/auth/me') && refreshResponse.data.user) {
          return Promise.resolve({ ...refreshResponse, data: refreshResponse.data.user });
        }

        return api(originalRequest);
      } catch {
        isRefreshing = false;
        refreshSubscribers = [];
        // No redirigir desde aquí — AuthProvider maneja el estado de sesión
        // expirada vía React Router. window.location.href cancela requests en vuelo.
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// ============== FUNCIONES DE AUTENTICACIÓN ==============

// Registrar nuevo usuario
// POST /auth/register
export const registerUser = async (userData: UserCreate): Promise<User> => {
  const response = await api.post('/auth/register', userData);
  return response.data;
};

// Login — la cookie httpOnly se setea automáticamente por el backend
// POST /auth/login (envía JSON, el backend espera LoginRequest)
export const loginUser = async (username: string, password: string): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>('/auth/login', { username, password });
  return response.data;
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
  if (!navigator.onLine) {
    const cached = await getCachedUser();
    if (cached) return cached;
    throw new Error('Sin conexión y sin datos guardados');
  }

  try {
    const response = await api.get('/auth/me');
    try {
      await saveUser(response.data);
    } catch {
      // fallo silencioso — el cache offline es best-effort
    }
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await clearCachedUser();
      throw error;
    }

    const cached = await getCachedUser();
    if (cached) return cached;
    throw error;
  }
};

// Refresh proactivo de sesión al iniciar la app.
// Llama directamente a /auth/refresh (sin pasar por el interceptor de 401),
// lo que evita el ciclo /auth/me → 401 → refresh → retry en cada cold start.
export const refreshSession = async (): Promise<User> => {
  if (!navigator.onLine) {
    const cached = await getCachedUser();
    if (cached) return cached;
    throw new Error('Sin conexión y sin datos guardados');
  }

  const refreshResponse = await api.post<{ message: string; user?: User }>('/auth/refresh');
  const user = refreshResponse.data.user ?? (await api.get<User>('/auth/me')).data;
  try {
    await saveUser(user);
  } catch {
    // cache failure no bloquea el login
  }
  return user;
};

// ============== FUNCIONES PARA CATEGORÍAS ==============

// Obtener categorías del sistema (predeterminadas, solo lectura)
// GET /categories/ → devuelve Category[]
export const getCategories = async (): Promise<Category[]> => {
  if (!navigator.onLine) return getCachedCategories();
  try {
    const response = await api.get('/categories/');
    await saveCategories(response.data);
    return response.data;
  } catch (error) {
    const cached = await getCachedCategories();
    if (cached.length > 0) return cached;
    throw error;
  }
};

// Obtener categorías personalizadas del usuario autenticado
// GET /user-categories/ → devuelve UserCategory[]
export const getUserCategories = async (): Promise<UserCategory[]> => {
  if (!navigator.onLine) return getCachedUserCategories();
  try {
    const response = await api.get('/user-categories/');
    await saveUserCategories(response.data);
    return response.data;
  } catch (error) {
    const cached = await getCachedUserCategories();
    if (cached.length > 0) return cached;
    throw error;
  }
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
  if (!navigator.onLine) {
    const cached = await getCachedMovimientos();
    return tipo ? cached.filter(m => m.tipo === tipo) : cached;
  }
  try {
    const params = tipo ? { tipo } : {};
    const response = await api.get('/movimientos/', { params });
    if (!tipo) await saveMovimientos(response.data); // solo guardar snapshot completo
    return response.data;
  } catch (error) {
    const cached = await getCachedMovimientos();
    if (cached.length > 0) return tipo ? cached.filter(m => m.tipo === tipo) : cached;
    throw error;
  }
};

// Crear un movimiento
// POST /movimientos/ → envía MovimientoCreate, devuelve Movimiento
// Si no hay conexión (navigator.onLine=false O error de red sin respuesta del servidor),
// encola el movimiento para sincronizar cuando vuelva la conexión.
export const createMovimiento = async (movimiento: MovimientoCreate): Promise<Movimiento> => {
  const enqueueAndReturn = async (): Promise<Movimiento> => {
    await enqueueOperation({ type: 'createMovimiento', payload: movimiento, createdAt: new Date().toISOString() });
    return {
      ...movimiento,
      id: -(Date.now()),
      user_id: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      categoria: null,
      user_category: null,
      presupuesto_item_id: movimiento.presupuesto_item_id ?? null,
    } as Movimiento;
  };

  if (!navigator.onLine) return enqueueAndReturn();

  try {
    const response = await api.post('/movimientos/', movimiento);
    return response.data;
  } catch (error) {
    // Solo encolar si realmente estamos offline.
    // Un 500 detrás de CORS también puede llegar como "sin response" en el navegador.
    if (axios.isAxiosError(error) && !error.response && !navigator.onLine) {
      return enqueueAndReturn();
    }
    throw error;
  }
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

// Buscar descripciones de movimientos existentes (autocomplete)
// GET /movimientos/descripciones/search?q=...&limit=...
export interface DescripcionSuggestion {
  descripcion: string;
  frecuencia: number;
}

export const searchDescripciones = async (q: string, limit: number = 10): Promise<DescripcionSuggestion[]> => {
  const response = await api.get('/movimientos/descripciones/search', { params: { q, limit } });
  return response.data;
};

// Eliminar una categoría personalizada
// DELETE /user-categories/{id}
export const deleteCategory = async (id: number): Promise<void> => {
  await api.delete(`/user-categories/${id}`);
};

export interface MovimientoAfectado {
  id: number;
  descripcion: string;
  fecha: string;
  importe: number;
  tipo: 'gasto' | 'ingreso';
}

// GET /user-categories/{id}/movimientos-afectados
export const getMovimientosAfectados = async (id: number): Promise<MovimientoAfectado[]> => {
  const response = await api.get(`/user-categories/${id}/movimientos-afectados`);
  return response.data;
};

// POST /user-categories/{id}/reasignar → reasigna movimientos y elimina la categoría
export const reasignarYEliminarCategoria = async (id: number, nueva_categoria_id: number): Promise<void> => {
  await api.post(`/user-categories/${id}/reasignar`, { nueva_categoria_id });
};

// Actualizar una categoría personalizada (campos parciales)
// PATCH /user-categories/{id} → envía campos parciales, devuelve UserCategory
export const updateUserCategory = async (
  id: number,
  patch: Partial<Pick<UserCategory, 'nombre' | 'monto_default' | 'tiene_monto_fijo' | 'color' | 'icon'>>
): Promise<UserCategory> => {
  const response = await api.put(`/user-categories/${id}`, patch);
  return response.data;
};

// Alias para compatibilidad hacia atrás (solo renombra)
// PUT /user-categories/{id} → envía {nombre}, devuelve UserCategory
export const updateCategory = async (id: number, nombre: string): Promise<UserCategory> => {
  const response = await api.put(`/user-categories/${id}`, { nombre });
  return response.data;
};

// Actualizar preferencias del usuario (ahorro_objetivo_default, etc.)
// PATCH /auth/me/preferences → devuelve User actualizado
export const updateUserPreferences = async (patch: { ahorro_objetivo_default?: number | null; porcentaje_ahorro_default?: number | null }): Promise<User> => {
  const response = await api.patch('/auth/me/preferences', patch);
  return response.data;
};

// ============== CICLO FINANCIERO (Daily Solvency) ==============

// GET /ciclos/activo → devuelve Ciclo activo con resumen, o null si no hay
export const getCicloActivo = async (): Promise<Ciclo | null> => {
  const response = await api.get('/ciclos/activo');
  if (response.status === 204) return null;
  return response.data;
};

// POST /ciclos/ → crea nuevo ciclo financiero
export const createCiclo = async (data: CicloCreate): Promise<Ciclo> => {
  const response = await api.post('/ciclos/', data);
  return response.data;
};

// PATCH /ciclos/{id} → actualiza fecha_fin y/o ahorro_objetivo
export const updateCiclo = async (id: number, data: Partial<CicloCreate>): Promise<Ciclo> => {
  const response = await api.patch(`/ciclos/${id}`, data);
  return response.data;
};

// POST /ciclos/{id}/presupuesto/ → confirma items del presupuesto para el ciclo
export const confirmarPresupuesto = async (
  cicloId: number,
  items: PresupuestoItemCreate[]
): Promise<Ciclo> => {
  const response = await api.post(`/ciclos/${cicloId}/presupuesto/`, { items });
  return response.data;
};

// DELETE /ciclos/{id} → cierra el ciclo activo
export const cerrarCiclo = async (id: number): Promise<void> => {
  await api.delete(`/ciclos/${id}`);
};

// PATCH /ciclos/{id}/reabrir → reactiva un ciclo cerrado
export const reabrirCiclo = async (id: number): Promise<Ciclo> => {
  const response = await api.patch(`/ciclos/${id}/reabrir`);
  return response.data;
};

// GET /ciclos/ultimo → último ciclo cerrado con resumen (para sugerencias de presupuesto)
export const getUltimoCiclo = async (): Promise<Ciclo | null> => {
  const response = await api.get('/ciclos/ultimo');
  if (response.status === 204) return null;
  return response.data;
};

// GET /ciclos/{id} → devuelve un ciclo específico con su resumen
export const getCiclo = async (id: number): Promise<Ciclo> => {
  const response = await api.get(`/ciclos/${id}`);
  return response.data;
};

// GET /ciclos/ → lista todos los ciclos del usuario (sin resumen)
export const getCiclos = async (): Promise<Ciclo[]> => {
  const response = await api.get('/ciclos/');
  return response.data;
};

// GET /ciclos/{id}/exportar → descarga TXT del ciclo
export const exportarCiclo = async (cicloId: number, fecha_inicio: string): Promise<void> => {
  const response = await api.get(`/ciclos/${cicloId}/exportar`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([response.data], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ciclo-${fecha_inicio.split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ============== GASTOS FIJOS ==============

// GET /gastos-fijos/ → lista gastos fijos del usuario autenticado
export const getGastosFijos = async (): Promise<GastoFijo[]> => {
  const response = await api.get('/gastos-fijos/');
  return response.data;
};

// PUT /gastos-fijos/{id} → actualiza activo, dia_vencimiento y/o dias_anticipacion
export const updateGastoFijo = async (id: number, patch: GastoFijoUpdate): Promise<GastoFijo> => {
  const response = await api.put(`/gastos-fijos/${id}`, patch);
  return response.data;
};

// ============== WISHLIST ==============

// GET /wishlist/ → lista items del usuario autenticado (paginado)
export const getWishlistItems = async (limit: number = 50, offset: number = 0): Promise<WishlistListResponse> => {
  const response = await api.get('/wishlist/', { params: { limit, offset } });
  return response.data;
};

// POST /wishlist/ → crea un item
export const createWishlistItem = async (data: WishlistItemCreate): Promise<WishlistItem> => {
  const response = await api.post('/wishlist/', data);
  return response.data;
};

// PATCH /wishlist/{id} → actualiza parcialmente un item
export const updateWishlistItem = async (id: number, data: WishlistItemUpdate): Promise<WishlistItem> => {
  const response = await api.patch(`/wishlist/${id}`, data);
  return response.data;
};

// DELETE /wishlist/{id} → elimina un item
export const deleteWishlistItem = async (id: number): Promise<void> => {
  await api.delete(`/wishlist/${id}`);
};

// ============== GOAL CONTRIBUTIONS ==============

// POST /wishlist/{id}/contribute → aporta fondos a una meta
export const contributeToGoal = async (id: number, data: GoalContributeRequest): Promise<WishlistItem> => {
  const response = await api.post(`/wishlist/${id}/contribute`, data);
  return response.data;
};

// POST /wishlist/{id}/withdraw → retira fondos de una meta
export const withdrawFromGoal = async (id: number, data: GoalWithdrawRequest): Promise<WishlistItem> => {
  const response = await api.post(`/wishlist/${id}/withdraw`, data);
  return response.data;
};

// GET /wishlist/{id}/contributions → lista contribuciones de una meta
export const getGoalContributions = async (id: number): Promise<GoalContribution[]> => {
  const response = await api.get(`/wishlist/${id}/contributions`);
  return response.data;
};

export default api;
