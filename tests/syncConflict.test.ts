import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifySync,
  hasDataDiverged,
  makeSyncFingerprint,
  getLastSyncedFingerprint,
  setLastSyncedFingerprint,
} from '../src/utils/syncConflict';
import { LocalDatabase } from '../src/utils/database';
import { Member } from '../src/types';

function makeMembers(count: number): Member[] {
  return Array.from({ length: count }, (_, i) => ({ id: `m${i}`, name: `Member ${i}` }));
}

function makeDb(overrides: Partial<LocalDatabase> = {}): LocalDatabase {
  return {
    members: [],
    fields: [],
    seasons: [],
    activities: [],
    expenses: [],
    labours: [],
    stockItems: [],
    purchases: [],
    usages: [],
    revenues: [],
    auditLogs: [],
    settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: true },
    ...overrides,
  };
}

describe('classifySync', () => {
  it('adopts cloud silently when there is no baseline and data matches', () => {
    const db = makeDb({ members: makeMembers(2) });
    expect(classifySync(db, db, null)).toBe('adopt-cloud');
  });

  it('without a baseline, falls back to flagging a big divergence as a conflict', () => {
    // No baseline (first sync ever in this browser) means we can't tell
    // staleness apart from a real conflict, so this preserves the original
    // conservative behavior.
    const cloud = makeDb({ members: makeMembers(5) });
    const local = makeDb({ members: makeMembers(1) });
    expect(classifySync(cloud, local, null)).toBe('conflict');
  });

  it('adopts cloud when local has not changed since the baseline, no matter how far cloud has moved', () => {
    // Regression test: this is the "opened the app after a while" scenario.
    // The local browser cache is stale but has no pending edits of its own —
    // the cloud simply has more data now. That must not prompt the user.
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(2) }));
    const local = makeDb({ members: makeMembers(2) }); // unchanged since baseline
    const cloud = makeDb({ members: makeMembers(9) }); // lots of activity elsewhere
    expect(classifySync(cloud, local, baseline)).toBe('adopt-cloud');
  });

  it('keeps local when cloud has not changed since the baseline but local has pending edits', () => {
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(2) }));
    const local = makeDb({ members: makeMembers(5) }); // unsynced local additions
    const cloud = makeDb({ members: makeMembers(2) }); // cloud unchanged
    expect(classifySync(cloud, local, baseline)).toBe('keep-local');
  });

  it('flags a real conflict only when both sides changed since the baseline', () => {
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(2) }));
    const local = makeDb({ members: makeMembers(5) }); // local added entries
    const cloud = makeDb({ members: makeMembers(8) }); // cloud also gained entries independently
    expect(classifySync(cloud, local, baseline)).toBe('conflict');
  });

  it('tolerates a difference of exactly 1 record as normal, not a conflict', () => {
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(2) }));
    const local = makeDb({ members: makeMembers(3) });
    const cloud = makeDb({ members: makeMembers(3) });
    expect(classifySync(cloud, local, baseline)).toBe('adopt-cloud');
  });
});

describe('hasDataDiverged', () => {
  it('is false for identical data', () => {
    const db = makeDb({ members: makeMembers(3) });
    expect(hasDataDiverged(db, db)).toBe(false);
  });

  it('is true when a tracked collection differs by more than 1', () => {
    const a = makeDb({ members: makeMembers(1) });
    const b = makeDb({ members: makeMembers(4) });
    expect(hasDataDiverged(a, b)).toBe(true);
  });
});

describe('sync fingerprint persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing has been recorded yet', () => {
    expect(getLastSyncedFingerprint()).toBeNull();
  });

  it('round-trips a fingerprint through storage', () => {
    const db = makeDb({ members: makeMembers(3), fields: [{ id: 'f1', name: 'F', area: 1, shares: [] }] });
    setLastSyncedFingerprint(db);
    expect(getLastSyncedFingerprint()).toEqual(makeSyncFingerprint(db));
  });
});
