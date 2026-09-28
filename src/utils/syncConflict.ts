/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalDatabase, safeStorageGet, safeStorageSet } from './database';

// Every collection that holds user-entered records. All of them must be
// tracked: a fingerprint that ignores a collection makes edits to it
// invisible to the reconciler, which then silently adopts cloud data and
// discards them. `auditLogs` is deliberately excluded — it is derived,
// append-only and trimmed to 500, so it is never the thing being protected.
const DIFF_KEYS = [
  'members',
  'fields',
  'seasons',
  'activities',
  'expenses',
  'labours',
  'revenues',
  'stockItems',
  'purchases',
  'usages',
  'creditAccounts',
  'creditRepayments',
] as const;

type DiffKey = (typeof DIFF_KEYS)[number];

// The four collections the original count-diff heuristic watched. Only the
// no-baseline fallback still uses them, to keep that path's behavior
// unchanged.
const LEGACY_DIFF_KEYS: DiffKey[] = ['members', 'fields', 'seasons', 'expenses'];

/**
 * Record identity per collection, not just a count. Counts alone cannot tell
 * "I added one record" apart from "someone else added one record", which is
 * exactly the ambiguity that used to cost users their entry.
 */
export interface SyncFingerprint {
  counts: Record<DiffKey, number>;
  ids: Record<DiffKey, string[]>;
}

function idsOf(list: any[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((r, i) => (r && r.id != null ? String(r.id) : `__noid_${i}`))
    .sort();
}

export function makeSyncFingerprint(db: LocalDatabase): SyncFingerprint {
  const counts = {} as Record<DiffKey, number>;
  const ids = {} as Record<DiffKey, string[]>;
  DIFF_KEYS.forEach(key => {
    const list = (db as any)[key] as any[] | undefined;
    counts[key] = list?.length || 0;
    ids[key] = idsOf(list);
  });
  return { counts, ids };
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True when `fp` holds any record the baseline did not, or has dropped one. */
function changedSince(fp: SyncFingerprint, baseline: SyncFingerprint): boolean {
  return DIFF_KEYS.some(key => !sameIds(fp.ids[key] || [], baseline.ids[key] || []));
}

/** True when every record in `subset` also appears in `superset`. */
function isSubsetOf(subset: SyncFingerprint, superset: SyncFingerprint): boolean {
  return DIFF_KEYS.every(key => {
    const outer = new Set(superset.ids[key] || []);
    return (subset.ids[key] || []).every(id => outer.has(id));
  });
}

/** Same threshold the original heuristic used: a difference of more than 1
 * record in any of the four core collections. Only the no-baseline fallback
 * relies on this now. */
export function hasDataDiverged(a: LocalDatabase, b: LocalDatabase): boolean {
  const fa = makeSyncFingerprint(a);
  const fb = makeSyncFingerprint(b);
  return LEGACY_DIFF_KEYS.some(key => Math.abs(fa.counts[key] - fb.counts[key]) > 1);
}

/** True when both snapshots hold exactly the same records, by id, in every
 * tracked collection. Lets a caller skip a no-op adoption instead of
 * replacing state with an equal-but-new object and re-triggering its own
 * effects forever. */
export function holdsSameRecords(a: LocalDatabase, b: LocalDatabase): boolean {
  return !changedSince(makeSyncFingerprint(a), makeSyncFingerprint(b));
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
 * Comparison is by record id, and any difference at all counts as a change.
 * A tolerance here is not a nicety, it is data loss: a user who has just
 * added a single record has local state the cloud does not have yet, and
 * treating that as "unchanged" lets the background reconciler overwrite it.
 *
 * Without a baseline (first sync ever in this browser, or storage was
 * cleared) there's no way to make that distinction, so this falls back to
 * the original conservative behavior.
 */
export function classifySync(
  cloudData: LocalDatabase,
  currentDb: LocalDatabase,
  baseline: SyncFingerprint | null
): SyncDecision {
  if (!baseline) {
    return hasDataDiverged(cloudData, currentDb) ? 'conflict' : 'adopt-cloud';
  }

  const localFp = makeSyncFingerprint(currentDb);
  const cloudFp = makeSyncFingerprint(cloudData);

  const localChanged = changedSince(localFp, baseline);
  const cloudChanged = changedSince(cloudFp, baseline);

  if (!localChanged) return 'adopt-cloud';
  if (!cloudChanged) return 'keep-local';

  // Both moved. Ids let us check whether that is a real disagreement or just
  // this browser seeing its own push come back (or a teammate's work that
  // already contains ours).
  if (isSubsetOf(localFp, cloudFp)) return 'adopt-cloud';
  if (isSubsetOf(cloudFp, localFp)) return 'keep-local';
  return 'conflict';
}

const SYNC_FINGERPRINT_KEY = 'farm_ledger_last_synced_fingerprint';

/** Reads the fingerprint of the database state this browser last confirmed
 * matches the cloud (set after a successful push or cloud adoption).
 * Fingerprints written by the older count-only format are discarded: they
 * carry no record ids, so they cannot answer "is this record mine?" and the
 * conservative no-baseline path is the safe reading. The next successful
 * sync rewrites it in the current format. */
export function getLastSyncedFingerprint(): SyncFingerprint | null {
  const raw = safeStorageGet(SYNC_FINGERPRINT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ids || !parsed.counts) return null;
    return parsed as SyncFingerprint;
  } catch {
    return null;
  }
}

export function setLastSyncedFingerprint(db: LocalDatabase): void {
  safeStorageSet(SYNC_FINGERPRINT_KEY, JSON.stringify(makeSyncFingerprint(db)));
}
