import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LocalDatabase } from '../src/utils/database';

// The Sheets and auth modules are the only things that talk to Google.
// googleSheets keeps its real column helpers: the sync fingerprint is built
// from them, so replacing them would change what "unchanged" means.
const sheets = vi.hoisted(() => ({ cloud: null as any, pull: vi.fn(), push: vi.fn() }));
vi.mock('../src/utils/googleSheets', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/utils/googleSheets')>()),
  pullDataFromSpreadsheet: sheets.pull,
  pushDataToSpreadsheet: sheets.push,
}));
const clearToken = vi.hoisted(() => vi.fn());
vi.mock('../src/utils/auth', () => ({ clearGoogleAccessToken: clearToken }));
vi.mock('../src/utils/googlePicker', () => ({ pickSpreadsheet: vi.fn() }));

import { useSheetSync } from '../src/hooks/useSheetSync';
import { getLastSyncedFingerprint, setLastSyncedFingerprint, countUnsyncedChanges } from '../src/utils/syncConflict';
import { listSafetyCopies, getSafetyCopy } from '../src/utils/safetyBackup';

const SHEET = 'sheet-abc-123';

const makeDb = (extra: Partial<LocalDatabase> = {}): LocalDatabase => ({
  members: [{ id: 'm1', name: 'Ramesh' }],
  fields: [], seasons: [], activities: [], expenses: [], labours: [], stockItems: [],
  purchases: [], usages: [], revenues: [], auditLogs: [],
  settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: true, linkedSpreadsheetId: SHEET },
  ...extra,
});

const expense = (id: string) =>
  ({ id, date: '2025-01-05', amount: 100, paidByMemberId: 'm1', category: 'Seed', targetType: 'common' }) as any;

const baseline = makeDb();
const localEdit = makeDb({ expenses: [expense('e-local')] });
const cloudEdit = makeDb({ members: [...baseline.members, { id: 'm2', name: 'Cloud partner' }] });

function mount(local: LocalDatabase) {
  return renderHook(() => {
    const [db, setDb] = useState<LocalDatabase | null>(local);
    const [token, setToken] = useState<string | null>('token');
    const [, setFetchError] = useState<string | null>(null);
    const sync = useSheetSync({ db, setDb, accessToken: token, setAccessToken: setToken, setFetchError });
    return { db, sync };
  });
}

/** Lets the debounce, the pre-push pull and the push all run. React only
 * schedules the next timer once an act() scope closes, so time is advanced
 * in separate scopes: one to commit the first render, one for the wait, one
 * to commit what the wait caused. */
const settle = async (ms = 2000) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};

describe('useSheetSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearToken.mockClear();
    sheets.cloud = baseline;
    sheets.pull.mockReset().mockImplementation(async () => sheets.cloud);
    sheets.push.mockReset().mockImplementation(async (_t: string, _id: string, data: LocalDatabase) => {
      sheets.cloud = data; // the sheet now holds what was written
    });
    setLastSyncedFingerprint(baseline);
  });
  afterEach(() => vi.useRealTimers());

  it('pushes only the collections that changed, then records the new baseline', async () => {
    const { result } = mount(localEdit);
    await settle();

    expect(sheets.push).toHaveBeenCalledTimes(1);
    const [, sheetId, pushed, collections] = sheets.push.mock.calls[0];
    expect(sheetId).toBe(SHEET);
    expect(pushed.expenses).toHaveLength(1);
    expect(collections).toContain('expenses');
    expect(collections).not.toContain('members');
    expect(countUnsyncedChanges(localEdit, getLastSyncedFingerprint())).toBe(0);
    expect(result.current.sync.syncErrorKind).toBeNull();
  });

  it('stops and asks when both sides changed, instead of overwriting the sheet', async () => {
    sheets.cloud = cloudEdit;
    const { result } = mount(localEdit);
    await settle();

    expect(result.current.sync.conflictData.isOpen).toBe(true);
    expect(sheets.push).not.toHaveBeenCalled();
  });

  describe('resolving a conflict', () => {
    async function conflicted() {
      sheets.cloud = cloudEdit;
      const hook = mount(localEdit);
      await settle();
      expect(hook.result.current.sync.conflictData.isOpen).toBe(true);
      return hook;
    }

    it('"keep mine" writes this device’s records to the sheet and keeps them through the next poll', async () => {
      const { result } = await conflicted();
      await act(async () => { await result.current.sync.handleResolveConflict('local'); });

      expect(sheets.push).toHaveBeenCalledTimes(1);
      expect(sheets.push.mock.calls[0][2].expenses).toHaveLength(1);
      expect(result.current.sync.conflictData.isOpen).toBe(false);

      await settle(46_000); // past the 45s background poll
      expect(result.current.db?.expenses.map(e => e.id)).toEqual(['e-local']);
    });

    it('"merge" writes every record from both sides', async () => {
      const { result } = await conflicted();
      await act(async () => { await result.current.sync.handleResolveConflict('merge'); });

      const pushed: LocalDatabase = sheets.push.mock.calls[0][2];
      expect(pushed.members.map(m => m.id).sort()).toEqual(['m1', 'm2']);
      expect(pushed.expenses.map(e => e.id)).toEqual(['e-local']);
      expect(result.current.db?.expenses).toHaveLength(1);
    });

    it('"use the sheet" takes the cloud data and does not write', async () => {
      const { result } = await conflicted();
      await act(async () => { await result.current.sync.handleResolveConflict('cloud'); });
      await settle();

      expect(sheets.push).not.toHaveBeenCalled();
      expect(result.current.db?.members.map(m => m.id).sort()).toEqual(['m1', 'm2']);
      expect(result.current.db?.expenses).toHaveLength(0);
    });

    it('keeps a copy of the sheet before "keep mine" overwrites it', async () => {
      const { result } = await conflicted();
      await act(async () => { await result.current.sync.handleResolveConflict('local'); });

      const [copy] = listSafetyCopies();
      expect(getSafetyCopy(copy.id)?.members.map(m => m.id).sort()).toEqual(['m1', 'm2']);
    });

    it('keeps a copy of this device before "use the sheet" overwrites it', async () => {
      const { result } = await conflicted();
      await act(async () => { await result.current.sync.handleResolveConflict('cloud'); });

      const [copy] = listSafetyCopies();
      expect(getSafetyCopy(copy.id)?.expenses.map(e => e.id)).toEqual(['e-local']);
    });

    it('leaves the changes unsynced when the write fails, so they are retried', async () => {
      const { result } = await conflicted();
      sheets.push.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await act(async () => { await result.current.sync.handleResolveConflict('local'); });

      expect(result.current.sync.syncingState).toBe('failed');
      expect(countUnsyncedChanges(localEdit, getLastSyncedFingerprint())).toBeGreaterThan(0);
    });
  });

  describe('failures', () => {
    it('retries a flaky connection on its own after a pause', async () => {
      sheets.push.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { result } = mount(localEdit);
      await settle();

      expect(result.current.sync.syncingState).toBe('failed');
      expect(result.current.sync.syncErrorKind).not.toBeNull();

      await settle(11_000); // first backoff is 10s
      expect(sheets.push).toHaveBeenCalledTimes(2);
      expect(result.current.sync.syncErrorKind).toBeNull();
      expect(countUnsyncedChanges(localEdit, getLastSyncedFingerprint())).toBe(0);
    });

    it('does not keep retrying an expired sign-in', async () => {
      sheets.push.mockRejectedValue(new Error('Request failed with status 401'));
      const { result } = mount(localEdit);
      await settle();
      await settle(10 * 60_000);

      expect(result.current.sync.syncErrorKind).toBe('auth');
      expect(clearToken).toHaveBeenCalled();
      expect(sheets.push).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useSheetSync audit history', () => {
  const log = (id: string, timestamp: string) =>
    ({ id, timestamp, actionType: 'create', entityType: 'Expense', entityId: id, description: id }) as any;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sheets.pull.mockReset().mockImplementation(async () => sheets.cloud);
    sheets.push.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the sheet’s older audit entries when this device pushes its latest 500', async () => {
    const withOldLog = makeDb({ auditLogs: [log('old', '2024-01-01T00:00:00Z')] });
    sheets.cloud = withOldLog;
    setLastSyncedFingerprint(withOldLog);
    const { result } = mount(makeDb({ expenses: [expense('e-local')], auditLogs: [log('new', '2025-06-01T00:00:00Z')] }));
    await settle();

    expect(sheets.push).toHaveBeenCalledTimes(1);
    expect(sheets.push.mock.calls[0][2].auditLogs.map((l: any) => l.id)).toEqual(['new', 'old']);
    expect(result.current.sync.syncErrorKind).toBeNull();
  });
});

describe('useSheetSync with a stale local copy, under React StrictMode', () => {
  // StrictMode runs state updaters twice in development. The sync code used to
  // save to storage and move its baseline from inside such an updater, so on
  // the second run the baseline had already moved on and a stale local copy
  // looked like "records deleted here": the app kept the stale copy, believed
  // it had unsynced changes, and its next push would have erased the sheet's
  // newer records.
  const stale = makeDb({ expenses: [expense('e-old')] });
  const newer = makeDb({ expenses: [expense('e-old'), expense('e-partner-added')] });

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearToken.mockClear();
    sheets.cloud = newer; // a partner added a record while this device was away
    sheets.pull.mockReset().mockImplementation(async () => sheets.cloud);
    sheets.push.mockReset().mockImplementation(async (_t: string, _id: string, data: LocalDatabase) => { sheets.cloud = data; });
    setLastSyncedFingerprint(stale); // this device last agreed with the sheet before that
  });
  afterEach(() => vi.useRealTimers());

  function mountStrict(local: LocalDatabase) {
    return renderHook(
      () => {
        const [db, setDb] = useState<LocalDatabase | null>(local);
        const [token, setToken] = useState<string | null>('token');
        const [, setFetchError] = useState<string | null>(null);
        const sync = useSheetSync({ db, setDb, accessToken: token, setAccessToken: setToken, setFetchError });
        return { db, sync };
      },
      { wrapper: StrictMode }
    );
  }

  it('adopts the sheet\u2019s newer records instead of keeping the stale copy', async () => {
    const { result } = mountStrict(stale);
    await settle();
    expect(result.current.db?.expenses.map(e => e.id).sort()).toEqual(['e-old', 'e-partner-added']);
  });

  it('does not count the sheet\u2019s newer records as deletions made here', async () => {
    const { result } = mountStrict(stale);
    await settle();
    expect(countUnsyncedChanges(result.current.db!, getLastSyncedFingerprint())).toBe(0);
  });

  it('never pushes the stale copy over the sheet', async () => {
    mountStrict(stale);
    await settle(10_000);
    expect(sheets.push).not.toHaveBeenCalled();
    expect(sheets.cloud.expenses.map((e: any) => e.id).sort()).toEqual(['e-old', 'e-partner-added']);
  });

  it('does the same when the background poll finds newer records', async () => {
    sheets.cloud = stale;
    setLastSyncedFingerprint(stale);
    const { result } = mountStrict(stale);
    await settle();
    sheets.cloud = newer; // a partner adds a record while this tab is open
    await settle(46_000); // past the 45s poll
    expect(result.current.db?.expenses.map(e => e.id).sort()).toEqual(['e-old', 'e-partner-added']);
    expect(sheets.push).not.toHaveBeenCalled();
  });
});
