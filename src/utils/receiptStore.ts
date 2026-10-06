/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File bytes of receipts that are not in Google Drive yet.
 *
 * They are kept in their own small IndexedDB store, keyed by attachment id,
 * and never in the main database: that is saved to localStorage (about 5 MB
 * in all), and a few photos waiting offline would fill it and stop every
 * entry on the device from being saved. The expense itself only carries the
 * attachment's metadata with `pending: true`.
 *
 * When IndexedDB isn't available, stashReceiptData returns false and callers
 * keep the bytes inline on the attachment, as before.
 */

export interface ReceiptStoreEntry {
  id: string;
  data: string;
  savedAt: number;
}

export interface ReceiptStoreBackend {
  put(entry: ReceiptStoreEntry): Promise<void>;
  get(id: string): Promise<ReceiptStoreEntry | undefined>;
  delete(id: string): Promise<void>;
  list(): Promise<{ id: string; savedAt: number }[]>;
}

const DB_NAME = 'farmledger-receipts';
const STORE = 'pending';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function indexedDbBackend(): ReceiptStoreBackend | null {
  if (typeof indexedDB === 'undefined') return null;
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!opened) {
      opened = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('Receipt store blocked'));
      });
      // A failed open is retried on the next call rather than cached.
      opened.catch(() => { opened = null; });
    }
    return opened;
  };
  const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    const tx = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Receipt store transaction aborted'));
    });
    done.catch(() => { /* surfaced by the awaits below */ });
    const result = await request(run(tx.objectStore(STORE)));
    await done;
    return result;
  };
  return {
    async put(entry) { await withStore('readwrite', s => s.put(entry)); },
    async get(id) { return (await withStore('readonly', s => s.get(id))) as ReceiptStoreEntry | undefined; },
    async delete(id) { await withStore('readwrite', s => s.delete(id)); },
    async list() {
      const all = (await withStore('readonly', s => s.getAll())) as ReceiptStoreEntry[];
      return all.map(e => ({ id: e.id, savedAt: e.savedAt }));
    },
  };
}

let backend: ReceiptStoreBackend | null | undefined;

function getBackend(): ReceiptStoreBackend | null {
  if (backend === undefined) backend = indexedDbBackend();
  return backend;
}

/** Test hook: swap the storage (null = unavailable; undefined = default). */
export function setReceiptStoreBackend(next: ReceiptStoreBackend | null | undefined): void {
  backend = next;
}

/** An in-memory backend, for tests. */
export function createMemoryReceiptStore(): ReceiptStoreBackend & { entries: Map<string, ReceiptStoreEntry> } {
  const entries = new Map<string, ReceiptStoreEntry>();
  return {
    entries,
    async put(entry) { entries.set(entry.id, { ...entry }); },
    async get(id) { return entries.get(id); },
    async delete(id) { entries.delete(id); },
    async list() { return [...entries.values()].map(e => ({ id: e.id, savedAt: e.savedAt })); },
  };
}

/** Keeps a pending receipt's bytes. False when there is no store (or the
 * write failed), in which case the caller keeps them inline. */
export async function stashReceiptData(id: string, data: string): Promise<boolean> {
  const store = getBackend();
  if (!store) return false;
  try {
    await store.put({ id, data, savedAt: Date.now() });
    return true;
  } catch (err) {
    console.warn('Could not keep receipt on this device:', err);
    return false;
  }
}

export async function loadReceiptData(id: string): Promise<string | undefined> {
  const store = getBackend();
  if (!store) return undefined;
  try {
    return (await store.get(id))?.data;
  } catch {
    return undefined;
  }
}

export async function dropReceiptData(id: string): Promise<void> {
  const store = getBackend();
  if (!store) return;
  try {
    await store.delete(id);
  } catch (err) {
    console.warn('Could not remove a stored receipt:', err);
  }
}

export async function listStoredReceipts(): Promise<{ id: string; savedAt: number }[]> {
  const store = getBackend();
  if (!store) return [];
  try {
    return await store.list();
  } catch {
    return [];
  }
}
