// OFFLINE DB: Wrapper de IndexedDB usando la librería idb
// Stores: movimientos, categories, userCategories, user, pendingQueue

import { openDB, type IDBPDatabase } from 'idb';
import type { Movimiento, Category, UserCategory, User, MovimientoCreate } from '../types';
import { isDateInMonthRange, type MonthRange } from '../utils/movimientoMonthRange';

interface FinanzaDB {
  movimientos:    { key: number; value: Movimiento };
  categories:     { key: number; value: Category };
  userCategories: { key: number; value: UserCategory };
  user:           { key: string; value: User };
  pendingQueue:   { key: number; value: PendingOperation };
}

export interface PendingOperation {
  id?: number;
  type: 'createMovimiento';
  payload: MovimientoCreate;
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase<FinanzaDB>> | null = null;

function getDB(): Promise<IDBPDatabase<FinanzaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FinanzaDB>('finanza-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('movimientos'))    db.createObjectStore('movimientos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('categories'))     db.createObjectStore('categories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('userCategories')) db.createObjectStore('userCategories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('user'))           db.createObjectStore('user');
        if (!db.objectStoreNames.contains('pendingQueue'))   db.createObjectStore('pendingQueue', { keyPath: 'id', autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

// ============ MOVIMIENTOS ============

/**
 * Guarda los movimientos carta por carta (keyPath `id`), no reemplaza el store.
 *
 * El store es un espejo acumulado: la UI consulta mes a mes, así que un `clear()` en cada
 * respuesta dejaría cacheado solo el último mes visitado y el modo offline volvería a ver
 * un solo mes. Cuando la consulta trae un rango, además se purgan las entradas que caen
 * dentro de ese rango y no vinieron en la respuesta: para esa ventana el servidor es la
 * fuente de verdad (refleja altas, ediciones y borrados).
 */
export async function saveMovimientos(items: Movimiento[], rango?: MonthRange): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('movimientos', 'readwrite');
  if (rango) {
    const cacheados = await tx.store.getAll();
    const recibidos = new Set(items.map((m) => m.id));
    const obsoletos = cacheados.filter((m) => !recibidos.has(m.id) && isDateInMonthRange(m.fecha, rango));
    await Promise.all(obsoletos.map((m) => tx.store.delete(m.id)));
  }
  await Promise.all(items.map((m) => tx.store.put(m)));
  await tx.done;
}

export async function getCachedMovimientos(): Promise<Movimiento[]> {
  return (await getDB()).getAll('movimientos');
}

// ============ CATEGORIES ============

export async function saveCategories(items: Category[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  await tx.store.clear();
  await Promise.all(items.map(c => tx.store.put(c)));
  await tx.done;
}

export async function getCachedCategories(): Promise<Category[]> {
  return (await getDB()).getAll('categories');
}

// ============ USER CATEGORIES ============

export async function saveUserCategories(items: UserCategory[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('userCategories', 'readwrite');
  await tx.store.clear();
  await Promise.all(items.map(c => tx.store.put(c)));
  await tx.done;
}

export async function getCachedUserCategories(): Promise<UserCategory[]> {
  return (await getDB()).getAll('userCategories');
}

// ============ USER ============

export async function saveUser(user: User): Promise<void> {
  await (await getDB()).put('user', user, 'current');
}

export async function getCachedUser(): Promise<User | undefined> {
  return (await getDB()).get('user', 'current');
}

export async function clearCachedUser(): Promise<void> {
  await (await getDB()).delete('user', 'current');
}

// ============ PENDING QUEUE ============

export async function enqueueOperation(op: Omit<PendingOperation, 'id'>): Promise<number> {
  return (await getDB()).add('pendingQueue', op as PendingOperation) as Promise<number>;
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  return (await getDB()).getAll('pendingQueue');
}

export async function removePendingOperation(id: number): Promise<void> {
  await (await getDB()).delete('pendingQueue', id);
}

export async function getPendingCount(): Promise<number> {
  return (await getDB()).count('pendingQueue');
}
