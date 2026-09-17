/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalDatabase, safeStorageGet, safeStorageSet } from './database';

// Only these collections are compared — matches the original count-diff
// conflict heuristic. A lightweight fingerprint (record counts only) is
// enough to tell "did this collection change since the baseline" without
// persisting a full duplicate snapshot of the database.
const DIFF_KEYS = ['members', 'fields', 'seasons', 'expenses'] as const;

export type SyncFingerprint = Record<(typeof DIFF_KEYS)[number], number>;

export function makeSyncFingerprint(db: LocalDatabase): SyncFingerprint {
  const fp = {} as SyncFingerprint;
  DIFF_KEYS.forEach(key => {
    fp[key] = db[key]?.length || 0;
  });
  return fp;
}

function countsDiverged(a: SyncFingerprint, b: SyncFingerprint): boolean {
  return DIFF_KEYS.some(key => Math.abs(a[key] - b[key]) > 1);
}

/** Same threshold used everywhere else: a difference of more than 1 record
 * in any tracked collection between two full database snapshots. */
export function hasDataDiverged(a: LocalDatabase, b: LocalDatabase): boolean {
  return countsDiverged(makeSyncFingerprint(a), makeSyncFingerprint(b));
}

export type SyncDecision = 'adopt-cloud' | 'keep-local' | 'conflict';

/**
 * Decides how to reconcile a fresh cloud pull against the current local
 * database.
 *
 * `baseline` is a fingerprint of the database state this browser last knew
 * to be in agreement with the cloud (recorded right after a successful push
 * or after adopting a cloud pull). It lets us tell "the cloud simply moved
 * on while this browser sat idle" apart from "both sides changed and now
 * genuinely disagree" — the local cache going stale over time is not itself
 * a conflict, and should just silently adopt the cloud data.
 *
 * Without a baseline (first sync ever in this browser, or storage was
 * cleared) there's no way to make that distinction, so this falls back to
 * the original conservative behavior: any large enough difference between
 * cloud and local is treated as a conflict.
 */
export function classifySync(
  cloudData: LocalDatabase,
  currentDb: LocalDatabase,
  baseline: SyncFingerprint | null
): SyncDecision {
  if (!baseline) {
    return hasDataDiverged(cloudData, currentDb) ? 'conflict' : 'adopt-cloud';
  }

  const localChanged = countsDiverged(makeSyncFingerprint(currentDb), baseline);
  const cloudChanged = countsDiverged(makeSyncFingerprint(cloudData), baseline);

  if (!localChanged) return 'adopt-cloud';
  if (!cloudChanged) return 'keep-local';
  return 'conflict';
}

const SYNC_FINGERPRINT_KEY = 'farm_ledger_last_synced_fingerprint';

/** Reads the fingerprint of the database state this browser last confirmed
 * matches the cloud (set after a successful push or cloud adoption). */
export function getLastSyncedFingerprint(): SyncFingerprint | null {
  const raw = safeStorageGet(SYNC_FINGERPRINT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setLastSyncedFingerprint(db: LocalDatabase): void {
  safeStorageSet(SYNC_FINGERPRINT_KEY, JSON.stringify(makeSyncFingerprint(db)));
}
