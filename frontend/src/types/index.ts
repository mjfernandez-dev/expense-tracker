// TIPOS: Definen la estructura de datos que usaremos en React
// Deben coincidir con los schemas de Pydantic del backend

// ============== TIPOS DE AUTENTICACIÓN ==============

export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  ahorro_objetivo_default?: number | null;
  porcentaje_ahorro_default?: number | null;
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  user: User;
}

export interface PasswordResetResponse {
  message: string;
  reset_token?: string;
}

// ============== TIPOS DE CATEGORÍAS ==============

export interface Category {
  id: number;
  nombre: string;
  es_predeterminada: boolean;
}

export interface UserCategory {
  id: number;
  nombre: string;
  color: string;
  icon: string | null;
  monto_default?: number | null;
  tiene_monto_fijo?: boolean;
}

// ============== TIPOS DE MOVIMIENTOS ==============

export interface Movimiento {
  id: number;
  importe: number;
  fecha: string;
  descripcion: string;
  nota: string | null;
  tipo: 'gasto' | 'ingreso';
  categoria_id: number | null;
  user_category_id: number | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  categoria: Category | null;
  user_category: UserCategory | null;
  presupuesto_item_id: number | null;
  es_inicio_ciclo: boolean;
  is_auto_generated: boolean;
  gasto_fijo_id: number | null;
  medio_pago: string | null;
  clasificacion: 'necesidad' | 'deseo' | null;
}

export interface MovimientoCreate {
  importe: number;
  fecha: string;
  descripcion: string;
  nota: string | null;
  tipo: 'gasto' | 'ingreso';
  categoria_id: number | null;
  user_category_id: number | null;
  presupuesto_item_id?: number | null;
  es_inicio_ciclo?: boolean;
  medio_pago?: string | null;
  clasificacion?: 'necesidad' | 'deseo' | null;
}

// ============== TIPOS DE GASTO FIJO ==============

export interface GastoFijo {
  id: number;
  user_id: number;
  descripcion: string;
  categoria_id: number | null;
  user_category_id: number | null;
  activo: boolean;
  created_at: string;
  categoria: Category | null;
  user_category: UserCategory | null;
  max_importe: number | null;
  ultimo_importe: number | null;
  total_meses: number;
  dia_vencimiento: number | null;
  dias_anticipacion: number | null;
}

export interface GastoFijoUpdate {
  activo?: boolean;
  dia_vencimiento?: number | null;
  dias_anticipacion?: number | null;
}

// ============== TIPOS DE PRESUPUESTO POR CICLO ==============

export interface PresupuestoItem {
  id: number;
  ciclo_id: number;
  categoria_id: number | null;
  user_category_id: number | null;
  monto_estimado: number;
  monto_ejecutado: number;
  monto_pendiente: number;
  confirmado: boolean;
  descripcion: string | null;
  estado: 'pendiente' | 'parcial' | 'efectivado' | string;
}

export interface PresupuestoItemCreate {
  categoria_id: number | null;
  user_category_id: number | null;
  monto_estimado: number;
  confirmado: boolean;
  descripcion?: string | null;
}

export interface CicloResumen {
  ciclo_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_restantes: number;
  total_ingresos: number;
  ahorro_objetivo: number;
  gastos_fijos_confirmados: number;
  gastos_fijos_pendientes: number;
  gastos_fijos_efectivizados: number;
  saldo_disponible_total: number;
  total_gastos: number;
  gastos_no_planificados: number;
  saldo_disponible_actual: number;
  daily_cap: number;
  gasto_hoy: number;
  daily_cap_porcentaje_usado: number;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  presupuesto_items: PresupuestoItem[];
}

export interface Ciclo {
  id: number;
  user_id: number;
  movimiento_origen_id: number | null;
  fecha_inicio: string;
  fecha_fin: string;
  ahorro_objetivo: number;
  activo: boolean;
  created_at: string;
  resumen: CicloResumen | null;
}

export interface CicloCreate {
  movimiento_origen_id?: number;
  fecha_inicio?: string;
  fecha_fin: string;
  ahorro_objetivo: number;
}
