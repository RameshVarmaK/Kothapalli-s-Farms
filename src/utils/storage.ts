import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { LocalDatabase } from './database';

interface FarmLedgerDB extends DBSchema {
  database: {
    key: string;
    value: LocalDatabase;
  };
}

const DB_NAME = 'FarmLedger';
const DB_VERSION = 1;
const STORE_NAME = 'database';

let dbInstance: IDBPDatabase<FarmLedgerDB> | null = null;

// Initialize IndexedDB
async function initDb(): Promise<IDBPDatabase<FarmLedgerDB>> {
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await openDB<FarmLedgerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      }
    });
    return dbInstance;
  } catch (err) {
    console.warn('IndexedDB initialization failed:', err);
    throw err;
  }
}

// Save database to IndexedDB (primary storage)
export async function saveToIndexedDB(data: LocalDatabase): Promise<void> {
  try {
    const db = await initDb();
    await db.put(STORE_NAME, data, 'farm_ledger');
  } catch (err) {
    console.warn('Failed to save to IndexedDB:', err);
    // Silently fail - localStorage will be used as fallback
  }
}

// Load database from IndexedDB
export async function loadFromIndexedDB(): Promise<LocalDatabase | null> {
  try {
    const db = await initDb();
    const data = await db.get(STORE_NAME, 'farm_ledger');
    return data || null;
  } catch (err) {
    console.warn('Failed to load from IndexedDB:', err);
    return null;
  }
}

// Clear IndexedDB
export async function clearIndexedDB(): Promise<void> {
  try {
    const db = await initDb();
    await db.clear(STORE_NAME);
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }
}

// Hybrid storage: try IndexedDB first, fallback to localStorage
export async function loadDatabaseHybrid(localStorageKey: string): Promise<LocalDatabase | null> {
  // Try IndexedDB first (preferred, larger quota)
  const idbData = await loadFromIndexedDB();
  if (idbData) return idbData;

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(localStorageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Failed to load from localStorage:', err);
  }

  return null;
}

// Hybrid save: save to both IndexedDB and localStorage for redundancy
export async function saveDatabaseHybrid(
  data: LocalDatabase,
  localStorageKey: string
): Promise<void> {
  // Save to IndexedDB (primary)
  await saveToIndexedDB(data);

  // Save to localStorage as fallback
  try {
    localStorage.setItem(localStorageKey, JSON.stringify(data));
  } catch (err) {
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, relying on IndexedDB');
    } else {
      console.warn('Failed to save to localStorage:', err);
    }
  }
}

// Get storage stats for monitoring
export async function getStorageStats(): Promise<{
  hasIndexedDB: boolean;
  hasLocalStorage: boolean;
  idbSize?: number;
  lsSize?: number;
}> {
  const stats: {
    hasIndexedDB: boolean;
    hasLocalStorage: boolean;
    idbSize?: number;
    lsSize?: number;
  } = {
    hasIndexedDB: false,
    hasLocalStorage: false
  };

  // Check IndexedDB
  try {
    const db = await initDb();
    const data = await db.get(STORE_NAME, 'farm_ledger');
    stats.hasIndexedDB = !!data;
    if (data) {
      stats.idbSize = JSON.stringify(data).length;
    }
  } catch (err) {
    // IndexedDB not available
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem('farm_ledger_database');
    stats.hasLocalStorage = !!stored;
    if (stored) {
      stats.lsSize = stored.length;
    }
  } catch (err) {
    // localStorage not available
  }

  return stats;
}
