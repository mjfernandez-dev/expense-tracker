// TIPOS: Definen la estructura de datos que usaremos en React
// Deben coincidir con los schemas de Pydantic del backend

// ============== TIPOS DE AUTENTICACIÓN ==============

// Usuario (coincide con UserRead del backend)
export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  alias_bancario: string | null;
  cvu: string | null;
}

// Datos para registrar usuario
export interface UserCreate {
  username: string;
  email: string;
  password: string;
}

// Datos para login
export interface LoginData {
  username: string;
  password: string;
}

// Respuesta del login (token JWT)
export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// Respuesta del endpoint de "olvidé mi contraseña"
export interface PasswordResetResponse {
  message: string;
  reset_token?: string; // Solo se devuelve en desarrollo para pruebas
}

// ============== TIPOS DE CATEGORÍAS ==============

// Categoría (coincide con CategoryRead del backend)
export interface Category {
  id: number;
  nombre: string;
  es_predeterminada: boolean;
}

// Categoría personalizada del usuario
export interface UserCategory {
  id: number;
  nombre: string;
  color: string;
  icon: string | null;
}

// Movimiento completo (coincide con MovimientoRead del backend)
export interface Movimiento {
  id: number;
  importe: number;
  fecha: string;  // DateTime viene como string en JSON
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
  gasto_fijo_id: number | null;      // ID del template de gasto fijo (si aplica)
  is_auto_generated: boolean;        // true si fue generado automáticamente
  es_inicio_ciclo: boolean;          // true si este ingreso inició un ciclo
  medio_pago: string | null;         // "efectivo"|"debito"|"credito"|"transferencia"|"otro"
}

// Datos para CREAR un movimiento (coincide con MovimientoCreate del backend)
export interface MovimientoCreate {
  importe: number;
  fecha: string;
  descripcion: string;
  nota: string | null;
  tipo: 'gasto' | 'ingreso';
  categoria_id: number | null;
  user_category_id: number | null;
  es_fijo?: boolean;         // Si true, crea un GastoFijo template asociado
  es_inicio_ciclo?: boolean; // Si true, este ingreso inicia un nuevo ciclo
  medio_pago?: string | null;
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
  max_importe: number | null;     // Máximo histórico (calculado)
  ultimo_importe: number | null;  // Importe del último mes (calculado)
  total_meses: number;            // Cantidad de meses registrados
}

// Alias de compatibilidad (para no romper imports existentes en split)
export type Expense = Movimiento;
export type ExpenseCreate = MovimientoCreate;

// ============== TIPOS DE CONTACTOS ==============

export interface Contact {
  id: number;
  owner_id: number;
  nombre: string;
  alias_bancario: string | null;
  cvu: string | null;
  linked_user_id: number | null;
  created_at: string;
}

export interface ContactCreate {
  nombre: string;
  alias_bancario: string | null;
  cvu: string | null;
  linked_user_id: number | null;
}

export interface QuickAddMemberData {
  nombre: string;
  alias_bancario: string | null;
  cvu: string | null;
}

// ============== TIPOS DE GRUPOS DIVIDIDOS ==============

export interface SplitGroupMember {
  id: number;
  group_id: number;
  contact_id: number | null;
  is_creator: boolean;
  display_name: string;
  contact: Contact | null;
}

export interface SplitGroup {
  id: number;
  nombre: string;
  descripcion: string | null;
  creator_id: number;
  is_active: boolean;
  created_at: string;
  members: SplitGroupMember[];
}

export interface SplitGroupCreate {
  nombre: string;
  descripcion: string | null;
  member_contact_ids: number[];
}

// ============== TIPOS DE GASTOS DIVIDIDOS ==============

export interface SplitExpenseParticipant {
  id: number;
  member_id: number;
  share_amount: number;
  member: SplitGroupMember;
}

export interface SplitExpense {
  id: number;
  group_id: number;
  descripcion: string;
  importe: number;
  paid_by_member_id: number;
  fecha: string;
  created_at: string;
  paid_by: SplitGroupMember;
  participants: SplitExpenseParticipant[];
}

export interface SplitExpenseCreate {
  descripcion: string;
  importe: number;
  paid_by_member_id: number;
  fecha: string | null;
  participant_member_ids: number[];
}

// ============== TIPOS DE BALANCES ==============

export interface MemberBalance {
  member_id: number;
  display_name: string;
  total_paid: number;
  total_share: number;
  net_balance: number;
  contact: Contact | null;
}

export interface DebtTransfer {
  from_member_id: number;
  from_display_name: string;
  to_member_id: number;
  to_display_name: string;
  amount: number;
  to_alias_bancario: string | null;
  to_cvu: string | null;
  paid_amount: number;
}

export interface GroupBalanceSummary {
  group_id: number;
  group_name: string;
  total_expenses: number;
  balances: MemberBalance[];
  simplified_debts: DebtTransfer[];
}

// ============== TIPOS DE CICLO FINANCIERO (Daily Solvency) ==============

export interface CicloGastoFijoItem {
  id: number;
  ciclo_id: number;
  gasto_fijo_id: number | null;
  monto_confirmado: number;
  confirmado: boolean;
  descripcion_override: string | null;
  gasto_fijo: GastoFijo | null;
}

export interface CicloResumen {
  ciclo_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_restantes: number;
  total_ingresos: number;
  ahorro_objetivo: number;
  gastos_fijos_confirmados: number;
  saldo_disponible_total: number;
  total_gastos: number;
  saldo_disponible_actual: number;
  daily_cap: number;
  gasto_hoy: number;
  daily_cap_porcentaje_usado: number;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  gastos_fijos: CicloGastoFijoItem[];
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
  fecha_fin: string;
  ahorro_objetivo: number;
}

export interface CicloGastoFijoItemCreate {
  gasto_fijo_id: number | null;
  monto_confirmado: number;
  confirmado: boolean;
  descripcion_override?: string | null;
}
