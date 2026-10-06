/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalDatabase, safeStorageGet, safeStorageSet } from './database';
import { SHEET_COLUMNS, parseSheetRows, toSheetRows } from './googleSheets';

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
 *
 * `sigs` adds each record's content ("id#hash"). Ids alone cannot see an edit
 * to a record that already exists: changing a crop cycle's partner split left
 * every id the same, so the pre-push check read "nothing changed locally",
 * adopted the cloud instead of pushing, and the next reload restored the old
 * split from the sheet.
 */
export interface SyncFingerprint {
  counts: Record<DiffKey, number>;
  ids: Record<DiffKey, string[]>;
  sigs: Record<DiffKey, string[]>;
}

function idsOf(list: any[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((r, i) => (r && r.id != null ? String(r.id) : `__noid_${i}`))
    .sort();
}

/** Rounds numbers so a value Sheets hands back re-formatted (it stores
 * USER_ENTERED cells as typed numbers) still matches what was written. */
function canonicalValue(val: any): any {
  if (typeof val === 'number') return Number.isFinite(val) ? Number(val.toPrecision(10)) : String(val);
  if (Array.isArray(val)) return val.map(canonicalValue);
  if (val && typeof val === 'object') {
    const out: Record<string, any> = {};
    Object.keys(val).sort().forEach(k => {
      const v = val[k];
      if (v === undefined || v === null || v === '') return;
      out[k] = canonicalValue(v);
    });
    return out;
  }
  return val;
}

/** 32-bit FNV-1a, so a stored fingerprint stays small. */
function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * One "id#hash" per record, hashed over the record as the sheet would hand it
 * back: only the columns that are pushed, put through the same write/read
 * path a real push and pull take. A freshly edited local record and its
 * pulled copy therefore hash alike, while local-only fields and type quirks
 * (TRUE vs true, "70" vs 70, '' vs undefined) never read as an edit.
 */
function sigsOf(key: DiffKey, list: any[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  const columns = SHEET_COLUMNS[key];
  const records = list.filter(Boolean);
  const asSheetReturnsThem = parseSheetRows<any>(toSheetRows(records, columns));
  const byId = new Map(asSheetReturnsThem.map(r => [String(r.id), r]));
  return list
    .map((r, i) => {
      const id = r && r.id != null ? String(r.id) : `__noid_${i}`;
      const content = byId.get(id) ?? r ?? null;
      return `${id}#${hashString(JSON.stringify(canonicalValue(content)))}`;
    })
    .sort();
}

export function makeSyncFingerprint(db: LocalDatabase): SyncFingerprint {
  const counts = {} as Record<DiffKey, number>;
  const ids = {} as Record<DiffKey, string[]>;
  const sigs = {} as Record<DiffKey, string[]>;
  DIFF_KEYS.forEach(key => {
    const list = (db as any)[key] as any[] | undefined;
    counts[key] = list?.length || 0;
    ids[key] = idsOf(list);
    sigs[key] = sigsOf(key, list);
  });
  return { counts, ids, sigs };
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True when `fp` holds any record the baseline did not, has dropped one,
 * or has edited one. */
function changedSince(fp: SyncFingerprint, baseline: SyncFingerprint): boolean {
  return DIFF_KEYS.some(key => !sameIds(fp.sigs[key] || [], baseline.sigs[key] || []));
}

/** True when every record in `subset` also appears, with the same content,
 * in `superset`. */
function isSubsetOf(subset: SyncFingerprint, superset: SyncFingerprint): boolean {
  return DIFF_KEYS.every(key => {
    const outer = new Set(superset.sigs[key] || []);
    return (subset.sigs[key] || []).every(sig => outer.has(sig));
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

/** True when both snapshots hold exactly the same records, by id and
 * content, in every tracked collection. Lets a caller skip a no-op adoption instead of
 * replacing state with an equal-but-new object and re-triggering its own
 * effects forever. */
export function holdsSameRecords(a: LocalDatabase, b: LocalDatabase): boolean {
  return !changedSince(makeSyncFingerprint(a), makeSyncFingerprint(b));
}

/**
 * How many records this device has added, edited or deleted since it last
 * agreed with the sheet — the changes a reload or a closed tab would leave
 * unsent. Zero when there is no baseline: with nothing to compare against,
 * any number shown would be a guess.
 */
export function countUnsyncedChanges(db: LocalDatabase, baseline: SyncFingerprint | null): number {
  if (!baseline) return 0;
  const local = makeSyncFingerprint(db);
  let changed = 0;
  DIFF_KEYS.forEach(key => {
    const before = new Map((baseline.sigs[key] || []).map(sig => [sig.slice(0, sig.lastIndexOf('#')), sig]));
    const now = new Map((local.sigs[key] || []).map(sig => [sig.slice(0, sig.lastIndexOf('#')), sig]));
    now.forEach((sig, id) => {
      if (before.get(id) !== sig) changed++; // added or edited
    });
    before.forEach((_, id) => {
      if (!now.has(id)) changed++; // deleted
    });
  });
  return changed;
}

// Pushed collections the fingerprint does not track. With nothing to compare
// them against, every push writes them.
const UNTRACKED_PUSH_KEYS = ['auditLogs', 'settlementClearances', 'notificationPreferences'];

/**
 * The collections a push has to write: each tracked one whose records differ
 * from the baseline — or from the sheet, when a fresh pull of it is at hand —
 * plus every untracked one. Anything the sheet might not already hold is
 * written; a collection is skipped only when it provably has not moved.
 *
 * Returns undefined, meaning "write every tab", when there is no baseline.
 */
export function collectionsToPush(
  db: LocalDatabase,
  baseline: SyncFingerprint | null,
  cloud?: LocalDatabase | null
): string[] | undefined {
  if (!baseline) return undefined;
  const local = makeSyncFingerprint(db);
  const cloudFp = cloud ? makeSyncFingerprint(cloud) : null;
  const changed = DIFF_KEYS.filter(key => {
    const before = baseline.sigs?.[key];
    if (!before || !sameIds(local.sigs[key], before)) return true;
    return !!cloudFp && !sameIds(local.sigs[key], cloudFp.sigs[key]);
  });
  return [...changed, ...UNTRACKED_PUSH_KEYS];
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
 * Comparison is by record id and content, and any difference at all counts as a change.
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
 * Fingerprints written by older formats are discarded: count-only ones carry
 * no record ids, and id-only ones cannot see an edit, so neither can answer
 * "is this record mine?" and the conservative no-baseline path is the safe
 * reading. The next successful sync rewrites it in the current format. */
export function getLastSyncedFingerprint(): SyncFingerprint | null {
  const raw = safeStorageGet(SYNC_FINGERPRINT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ids || !parsed.counts || !parsed.sigs) return null;
    return parsed as SyncFingerprint;
  } catch {
    return null;
  }
}

export function setLastSyncedFingerprint(db: LocalDatabase): void {
  safeStorageSet(SYNC_FINGERPRINT_KEY, JSON.stringify(makeSyncFingerprint(db)));
}
