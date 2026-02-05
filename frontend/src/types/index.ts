// TIPOS: Definen la estructura de datos que usaremos en React
// Deben coincidir con los schemas de Pydantic del backend

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