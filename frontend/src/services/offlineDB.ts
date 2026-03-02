// OFFLINE DB: Wrapper de IndexedDB usando la librería idb
// Stores: movimientos, categories, userCategories, user, pendingQueue

import { openDB, type IDBPDatabase } from 'idb';
import type { Movimiento, Category, UserCategory, User, MovimientoCreate } from '../types';

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

export async function saveMovimientos(items: Movimiento[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('movimientos', 'readwrite');
  await tx.store.clear();
  await Promise.all(items.map(m => tx.store.put(m)));
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
