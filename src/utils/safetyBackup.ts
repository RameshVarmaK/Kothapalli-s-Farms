/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalDatabase, downloadFile, recordsOf, safeStorageGet, safeStorageRemove, safeStorageSet } from './database';
import { logWarning } from './errorLogging';

/**
 * A copy of the data an action is about to overwrite, kept on this device.
 *
 * Resolving a sync conflict, pulling from the sheet and restoring a backup
 * all replace one side's records wholesale. If the user picked the wrong
 * side, the other side's copy is otherwise gone. These copies are the way
 * back: Settings lists them and downloads one as an ordinary backup JSON that
 * "Restore Backup" accepts.
 */

const INDEX_KEY = 'farm_ledger_safety_index';
const COPY_PREFIX = 'farm_ledger_safety_copy_';
const MAX_COPIES = 5;

/** The reasons copies are taken. Fixed strings so Settings can translate them. */
export const SAFETY_REASONS = {
  deviceBeforeSheet: 'This device, before it took the sheet’s version',
  sheetBeforeOverwrite: 'The sheet, before this device’s version replaced it',
  deviceBeforeRestore: 'This device, before a backup file was restored',
} as const;

export interface SafetyCopyInfo {
  id: string;
  savedAt: string;
  /** Why it was taken, in plain words for the list. */
  reason: string;
  /** Records held, for a rough sense of what is in it. */
  records: number;
}

const COLLECTIONS_COUNTED = [
  'members', 'fields', 'seasons', 'expenses', 'labours', 'revenues',
  'stockItems', 'purchases', 'usages', 'creditAccounts', 'creditRepayments',
] as const;

function countRecords(db: LocalDatabase): number {
  return COLLECTIONS_COUNTED.reduce((sum, key) => sum + (recordsOf(db, key)?.length || 0), 0);
}

function readIndex(): SafetyCopyInfo[] {
  const raw = safeStorageGet(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(index: SafetyCopyInfo[]): void {
  safeStorageSet(INDEX_KEY, JSON.stringify(index));
}

/** Newest first. */
export function listSafetyCopies(): SafetyCopyInfo[] {
  return readIndex();
}

/** Keeps `db` as a safety copy. Never throws: a full or blocked storage must
 * not stop the action the copy was for. */
export function saveSafetyCopy(reason: string, db: LocalDatabase): void {
  try {
    if (countRecords(db) === 0) return; // nothing to lose
    const savedAt = new Date().toISOString();
    const id = `${Date.now()}`;
    const payload = JSON.stringify(db);

    let index = readIndex();
    const store = () => safeStorageSet(COPY_PREFIX + id, payload);
    // Storage is small; if it is full, give up the oldest copies one at a time.
    while (!store() && index.length > 0) {
      const oldest = index[index.length - 1];
      safeStorageRemove(COPY_PREFIX + oldest.id);
      index = index.slice(0, -1);
    }
    if (!safeStorageGet(COPY_PREFIX + id)) {
      logWarning('safety_copy_not_saved', 'Storage is full; no safety copy was kept', { reason });
      writeIndex(index);
      return;
    }

    index = [{ id, savedAt, reason, records: countRecords(db) }, ...index];
    index.slice(MAX_COPIES).forEach(old => safeStorageRemove(COPY_PREFIX + old.id));
    writeIndex(index.slice(0, MAX_COPIES));
  } catch (err) {
    logWarning('safety_copy_failed', err instanceof Error ? err.message : String(err), { reason });
  }
}

export function getSafetyCopy(id: string): LocalDatabase | null {
  const raw = safeStorageGet(COPY_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalDatabase;
  } catch {
    return null;
  }
}

/** Saves one copy as a backup file that "Restore Backup" accepts. */
export function downloadSafetyCopy(id: string): boolean {
  const copy = getSafetyCopy(id);
  const info = readIndex().find(c => c.id === id);
  if (!copy || !info) return false;
  const stamp = info.savedAt.slice(0, 16).replace(/[:T]/g, '-');
  downloadFile(JSON.stringify(copy, null, 2), `farmledger_safety_copy_${stamp}.json`, 'application/json');
  return true;
}

/** Removes every copy: they hold the previous account's records, so they go
 * wherever the local database does. */
export function clearSafetyCopies(): void {
  readIndex().forEach(c => safeStorageRemove(COPY_PREFIX + c.id));
  safeStorageRemove(INDEX_KEY);
}
