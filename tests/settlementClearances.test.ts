import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLegacyClearances, normalizeClearanceKeys, LEGACY_CLEARANCE_KEYS } from '../src/utils/database';
import { parseSheetRows, toSheetRows } from '../src/utils/googleSheets';
import { SettlementClearance } from '../src/types';

const CLEARANCE_COLUMNS = ['id', 'scope', 'key', 'clearedAt'];

describe('settlement clearances', () => {
  beforeEach(() => {
    LEGACY_CLEARANCE_KEYS.forEach(key => localStorage.removeItem(key));
  });

  it('carries legacy per-device ticks over into database records', () => {
    localStorage.setItem('farmledger_cleared_debts', JSON.stringify(['s1,s2:mem_a:mem_b:4500']));
    localStorage.setItem('farmledger_cleared_sub_entries', JSON.stringify(['s1:mem_a:mem_b:2000']));

    const migrated = migrateLegacyClearances();

    expect(migrated).toHaveLength(2);
    expect(migrated).toContainEqual({
      id: 'debt|s1,s2:mem_a:mem_b',
      scope: 'debt',
      key: 's1,s2:mem_a:mem_b',
      clearedAt: ''
    });
    expect(migrated).toContainEqual({
      id: 'sub|s1:mem_a:mem_b',
      scope: 'sub',
      key: 's1:mem_a:mem_b',
      clearedAt: ''
    });
  });

  it('returns nothing when there is no legacy data', () => {
    expect(migrateLegacyClearances()).toEqual([]);
  });

  it('survives corrupt legacy data instead of throwing', () => {
    localStorage.setItem('farmledger_cleared_debts', '{not json');
    localStorage.setItem('farmledger_cleared_sub_entries', JSON.stringify(['ok:mem_a:mem_b:10', 42, '']));

    const migrated = migrateLegacyClearances();

    // The unparseable key yields nothing; the good key survives and the
    // non-string and empty entries are dropped.
    expect(migrated).toEqual([
      { id: 'sub|ok:mem_a:mem_b', scope: 'sub', key: 'ok:mem_a:mem_b', clearedAt: '' }
    ]);
  });

  it('keeps a debt and its same-named sub entry apart', () => {
    // With a single season selected, a combined debt key and a per-season sub
    // key are identical strings. The scope-prefixed id keeps them distinct.
    const key = 's1:mem_a:mem_b';
    const records: SettlementClearance[] = [
      { id: `debt|${key}`, scope: 'debt', key, clearedAt: '2026-09-22T00:00:00.000Z' },
      { id: `sub|${key}`, scope: 'sub', key, clearedAt: '2026-09-22T00:00:00.000Z' }
    ];

    const restored = parseSheetRows<SettlementClearance>(toSheetRows(records, CLEARANCE_COLUMNS));

    expect(restored).toHaveLength(2);
    expect(restored.filter(c => c.scope === 'debt').map(c => c.key)).toEqual([key]);
    expect(restored.filter(c => c.scope === 'sub').map(c => c.key)).toEqual([key]);
  });

  it('round-trips through a Sheets push and pull', () => {
    const records: SettlementClearance[] = [
      { id: 'debt|s1,s2:mem_a:mem_b', scope: 'debt', key: 's1,s2:mem_a:mem_b', clearedAt: '2026-09-22T10:30:00.000Z' }
    ];

    const restored = parseSheetRows<SettlementClearance>(toSheetRows(records, CLEARANCE_COLUMNS));

    expect(restored).toEqual(records);
  });
});

describe('normalizeClearanceKeys', () => {
  it('strips the amount from legacy keys so a tick survives a recompute', () => {
    // The debt that prompted this: a share edit changed ₹4,500 to ₹5,200 and
    // the settled transfer silently reappeared as outstanding.
    const stored = [
      { id: 'debt|s1,s2:mem_a:mem_b:4500', scope: 'debt' as const, key: 's1,s2:mem_a:mem_b:4500', clearedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'sub|s1:mem_a:mem_b:2000', scope: 'sub' as const, key: 's1:mem_a:mem_b:2000', clearedAt: '2026-09-01T00:00:00.000Z' }
    ];

    expect(normalizeClearanceKeys(stored)).toEqual([
      { id: 'debt|s1,s2:mem_a:mem_b', scope: 'debt', key: 's1,s2:mem_a:mem_b', clearedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'sub|s1:mem_a:mem_b', scope: 'sub', key: 's1:mem_a:mem_b', clearedAt: '2026-09-01T00:00:00.000Z' }
    ]);
  });

  it('is idempotent on keys that are already amount-free', () => {
    const current = [
      { id: 'sub|s1:mem_a:mem_b', scope: 'sub' as const, key: 's1:mem_a:mem_b', clearedAt: '2026-09-22T00:00:00.000Z' }
    ];

    expect(normalizeClearanceKeys(normalizeClearanceKeys(current))).toEqual(current);
  });

  it('collapses duplicates onto the earliest clearing', () => {
    // The same pair ticked, recomputed to a different figure, then ticked
    // again leaves two legacy rows that mean one settlement.
    const stored = [
      { id: 'sub|s1:mem_a:mem_b:4500', scope: 'sub' as const, key: 's1:mem_a:mem_b:4500', clearedAt: '2026-09-10T00:00:00.000Z' },
      { id: 'sub|s1:mem_a:mem_b:5200', scope: 'sub' as const, key: 's1:mem_a:mem_b:5200', clearedAt: '2026-09-01T00:00:00.000Z' }
    ];

    const normalized = normalizeClearanceKeys(stored);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].clearedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('leaves a member or season id that merely looks numeric alone', () => {
    // Only a 4th all-digit segment is an amount; a 3-segment key is current.
    const stored = [
      { id: 'sub|2026:mem_a:mem_b', scope: 'sub' as const, key: '2026:mem_a:mem_b', clearedAt: '' }
    ];

    expect(normalizeClearanceKeys(stored)[0].key).toBe('2026:mem_a:mem_b');
  });
});
