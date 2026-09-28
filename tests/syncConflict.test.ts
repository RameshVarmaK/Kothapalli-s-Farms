import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifySync,
  hasDataDiverged,
  holdsSameRecords,
  makeSyncFingerprint,
  getLastSyncedFingerprint,
  setLastSyncedFingerprint,
} from '../src/utils/syncConflict';
import { LocalDatabase } from '../src/utils/database';
import { Member } from '../src/types';

function makeMembers(count: number, prefix = 'm'): Member[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, name: `Member ${i}` }));
}

/** Baseline records plus `added` further records carrying ids unique to
 * `prefix` — i.e. work done independently of whatever the other side did. */
function makeMembersAfter(baseCount: number, added: number, prefix: string): Member[] {
  return [...makeMembers(baseCount), ...makeMembers(added, prefix)];
}

/** Generic id-bearing records, for collections whose exact shape doesn't
 * matter to the fingerprint (it only reads `id`). */
function makeRecords(count: number, prefix = 'r'): any[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}` }));
}

function makeExpenses(count: number, prefix = 'exp'): any[] {
  return makeRecords(count, prefix);
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
    // Each side added records the other has never seen — distinct ids, not
    // just different counts. That is the only situation the user must be
    // asked about, because neither side's data is recoverable from the other.
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(2) }));
    const local = makeDb({ members: makeMembersAfter(2, 3, 'local') });
    const cloud = makeDb({ members: makeMembersAfter(2, 6, 'cloud') });
    expect(classifySync(cloud, local, baseline)).toBe('conflict');
  });

  it('adopts cloud when cloud already contains everything local has', () => {
    // This browser pushed, then saw its own write come back on the next
    // poll alongside a teammate's additions. Nothing of ours is at risk.
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(2) }));
    const local = makeDb({ members: makeMembersAfter(2, 1, 'local') });
    const cloud = makeDb({ members: [...makeMembersAfter(2, 1, 'local'), ...makeMembers(3, 'cloud')] });
    expect(classifySync(cloud, local, baseline)).toBe('adopt-cloud');
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

describe('regression: a freshly added entry must never be silently discarded', () => {
  // The bug: the baseline comparison tolerated a difference of up to 1
  // record and only watched members/fields/seasons/expenses. A user who
  // added one entry therefore read as "unchanged since last sync", so the
  // 45s background reconciler classified the pull as 'adopt-cloud' and
  // replaced local state with cloud data that predated the entry — after
  // the success toast had already been shown.

  it('keeps local after a single expense is added but not yet pushed', () => {
    const baseline = makeSyncFingerprint(makeDb({ expenses: makeExpenses(4) }));
    const local = makeDb({ expenses: makeExpenses(5) }); // user just saved one
    const cloud = makeDb({ expenses: makeExpenses(4) }); // push hasn't landed
    expect(classifySync(cloud, local, baseline)).toBe('keep-local');
  });

  it('keeps local after a single member is added but not yet pushed', () => {
    const baseline = makeSyncFingerprint(makeDb({ members: makeMembers(4) }));
    const local = makeDb({ members: makeMembers(5) });
    const cloud = makeDb({ members: makeMembers(4) });
    expect(classifySync(cloud, local, baseline)).toBe('keep-local');
  });

  it.each([
    'labours',
    'revenues',
    'purchases',
    'usages',
    'stockItems',
    'activities',
    'creditAccounts',
    'creditRepayments',
  ] as const)('tracks the %s collection, which the count fingerprint ignored entirely', key => {
    const baseline = makeSyncFingerprint(makeDb({ [key]: makeRecords(2) } as any));
    const local = makeDb({ [key]: makeRecords(3) } as any);
    const cloud = makeDb({ [key]: makeRecords(2) } as any);
    expect(classifySync(cloud, local, baseline)).toBe('keep-local');
  });

  it('keeps local when many unsynced records exist in an untracked collection', () => {
    const baseline = makeSyncFingerprint(makeDb({ labours: [] }));
    const local = makeDb({ labours: makeRecords(50) as any });
    const cloud = makeDb({ labours: [] });
    expect(classifySync(cloud, local, baseline)).toBe('keep-local');
  });

  it('still adopts cloud when this browser genuinely has no pending edits', () => {
    const baseline = makeSyncFingerprint(makeDb({ expenses: makeExpenses(4) }));
    const local = makeDb({ expenses: makeExpenses(4) });
    const cloud = makeDb({ expenses: makeExpenses(9) });
    expect(classifySync(cloud, local, baseline)).toBe('adopt-cloud');
  });
});

describe('fingerprint format migration', () => {
  beforeEach(() => localStorage.clear());

  it('discards a legacy count-only fingerprint rather than misreading it', () => {
    // Old format was a flat { members: 2, fields: 0, ... }. Read as a
    // baseline it would report every collection as unchanged, which is the
    // exact failure being fixed — so it must be treated as "no baseline".
    localStorage.setItem(
      'farm_ledger_last_synced_fingerprint',
      JSON.stringify({ members: 2, fields: 1, seasons: 1, expenses: 4 })
    );
    expect(getLastSyncedFingerprint()).toBeNull();
  });

  it('ignores malformed stored fingerprints', () => {
    localStorage.setItem('farm_ledger_last_synced_fingerprint', 'not json');
    expect(getLastSyncedFingerprint()).toBeNull();
  });
});

describe('joining a ledger shared by another partner', () => {
  // A second farm partner signs in on their own phone and links the sheet
  // the owner shared with them. Their device has little or nothing of its
  // own; the sheet has the whole farm's history. The push that follows must
  // never be allowed to write their empty state over it.

  const ownersLedger = () =>
    makeDb({
      members: makeMembers(4),
      fields: makeRecords(3, 'field') as any,
      seasons: makeRecords(6, 'season') as any,
      expenses: makeExpenses(120),
      labours: makeRecords(80, 'lab') as any,
    });

  it('classifies the first look at a shared sheet as adopt-cloud, not a push', () => {
    // Baseline is the joining device's own (empty) sheet.
    const baseline = makeSyncFingerprint(makeDb());
    const local = makeDb();
    expect(classifySync(ownersLedger(), local, baseline)).toBe('adopt-cloud');
  });

  it('never returns keep-local when the joining device has nothing of its own', () => {
    // keep-local is the only decision that lets the caller push, so this is
    // the property that protects the shared sheet.
    const baseline = makeSyncFingerprint(makeDb());
    expect(classifySync(ownersLedger(), makeDb(), baseline)).not.toBe('keep-local');
  });

  it('flags a conflict rather than pushing when the joiner does have unsynced records', () => {
    // They tried the app offline first and made a couple of entries. Those
    // must not be silently dropped, and must not overwrite the shared sheet
    // either — the user gets asked.
    const baseline = makeSyncFingerprint(makeDb());
    const local = makeDb({ expenses: makeExpenses(2, 'mine') });
    expect(classifySync(ownersLedger(), local, baseline)).toBe('conflict');
  });

  it('treats the shared ledger as settled once it has been adopted', () => {
    // After adoption the baseline is the shared sheet itself, so ordinary
    // syncing resumes: no repeated prompts, no repeated adoption.
    const adopted = ownersLedger();
    const baseline = makeSyncFingerprint(adopted);
    expect(classifySync(ownersLedger(), adopted, baseline)).toBe('adopt-cloud');
    expect(holdsSameRecords(ownersLedger(), adopted)).toBe(true);
  });

  it('lets the joiner push once they have added a record of their own', () => {
    const adopted = ownersLedger();
    const baseline = makeSyncFingerprint(adopted);
    const local = { ...adopted, expenses: [...adopted.expenses, { id: 'exp-new' } as any] };
    expect(classifySync(ownersLedger(), local, baseline)).toBe('keep-local');
  });
});

describe('holdsSameRecords', () => {
  it('is true for snapshots holding the same records', () => {
    expect(holdsSameRecords(makeDb({ expenses: makeExpenses(3) }), makeDb({ expenses: makeExpenses(3) }))).toBe(true);
  });

  it('is false when one side has a record the other lacks', () => {
    expect(holdsSameRecords(makeDb({ expenses: makeExpenses(3) }), makeDb({ expenses: makeExpenses(4) }))).toBe(false);
  });

  it('ignores ordering', () => {
    const a = makeDb({ expenses: makeExpenses(3) });
    const b = makeDb({ expenses: [...makeExpenses(3)].reverse() });
    expect(holdsSameRecords(a, b)).toBe(true);
  });

  it('notices a swap that leaves the count unchanged', () => {
    // The case a count-based comparison is blind to.
    const a = makeDb({ expenses: makeExpenses(3, 'a') });
    const b = makeDb({ expenses: makeExpenses(3, 'b') });
    expect(holdsSameRecords(a, b)).toBe(false);
  });
});
