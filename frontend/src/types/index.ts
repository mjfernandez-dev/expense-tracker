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

// Gasto completo (coincide con ExpenseRead del backend)
export interface Expense {
  id: number;
  importe: number;
  fecha: string;  // DateTime viene como string en JSON
  descripcion: string;
  nota: string | null;  // Puede ser null
  categoria_id: number;
  categoria: Category;  // Relación: incluye categoría completa
}

// Datos para CREAR un gasto (coincide con ExpenseCreate del backend)
// No incluye 'id' ni 'categoria' porque aún no existen
export interface ExpenseCreate {
  importe: number;
  fecha: string;
  descripcion: string;
  nota: string | null;
  categoria_id: number;
}

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
  payment_status: string | null;
  payment_id: number | null;
}

export interface GroupBalanceSummary {
  group_id: number;
  group_name: string;
  total_expenses: number;
  balances: MemberBalance[];
  simplified_debts: DebtTransfer[];
}

// ============== TIPOS DE PAGOS (MERCADO PAGO) ==============

export interface PaymentCreate {
  group_id: number;
  from_member_id: number;
  to_member_id: number;
  amount: number;
}

export interface PaymentPreferenceResponse {
  payment_id: number;
  init_point: string;
}

export interface Payment {
  id: number;
  group_id: number;
  from_member_id: number;
  to_member_id: number;
  amount: number;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  status: string;
  created_at: string;
}