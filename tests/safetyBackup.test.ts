import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAFETY_REASONS,
  clearSafetyCopies,
  getSafetyCopy,
  listSafetyCopies,
  saveSafetyCopy,
} from '../src/utils/safetyBackup';
import type { LocalDatabase } from '../src/utils/database';

const makeDb = (members: number): LocalDatabase => ({
  members: Array.from({ length: members }, (_, i) => ({ id: `m${i}`, name: `Member ${i}` })),
  fields: [], seasons: [], activities: [], expenses: [], labours: [], stockItems: [],
  purchases: [], usages: [], revenues: [], auditLogs: [],
  settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: true },
});

describe('safety copies', () => {
  beforeEach(() => localStorage.clear());

  it('keeps what was about to be overwritten, newest first', async () => {
    saveSafetyCopy(SAFETY_REASONS.deviceBeforeSheet, makeDb(2));
    await new Promise(r => setTimeout(r, 2));
    saveSafetyCopy(SAFETY_REASONS.sheetBeforeOverwrite, makeDb(3));

    const list = listSafetyCopies();
    expect(list.map(c => c.records)).toEqual([3, 2]);
    expect(list[0].reason).toBe(SAFETY_REASONS.sheetBeforeOverwrite);
    expect(getSafetyCopy(list[1].id)?.members).toHaveLength(2);
  });

  it('skips an empty database, which has nothing to lose', () => {
    saveSafetyCopy(SAFETY_REASONS.deviceBeforeSheet, makeDb(0));
    expect(listSafetyCopies()).toEqual([]);
  });

  it('keeps only the five most recent and removes the rest from storage', async () => {
    for (let i = 1; i <= 7; i++) {
      saveSafetyCopy(SAFETY_REASONS.deviceBeforeSheet, makeDb(i));
      await new Promise(r => setTimeout(r, 2));
    }
    const list = listSafetyCopies();
    expect(list).toHaveLength(5);
    expect(list.map(c => c.records)).toEqual([7, 6, 5, 4, 3]);
    const copyKeys = Object.keys(localStorage).filter(k => k.startsWith('farm_ledger_safety_copy_'));
    expect(copyKeys).toHaveLength(5);
  });

  it('is cleared with the rest of the local data', () => {
    saveSafetyCopy(SAFETY_REASONS.deviceBeforeSheet, makeDb(2));
    clearSafetyCopies();
    expect(listSafetyCopies()).toEqual([]);
    expect(Object.keys(localStorage).filter(k => k.includes('safety'))).toEqual([]);
  });

  it('never throws when storage refuses the write', () => {
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => saveSafetyCopy(SAFETY_REASONS.deviceBeforeSheet, makeDb(2))).not.toThrow();
    } finally {
      refuse.mockRestore();
    }
    expect(listSafetyCopies()).toEqual([]);
  });
});
