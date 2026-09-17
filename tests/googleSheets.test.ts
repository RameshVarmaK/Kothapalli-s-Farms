import { describe, it, expect } from 'vitest';
import { parseSheetRows } from '../src/utils/googleSheets';

describe('parseSheetRows', () => {
  it('parses lowercase true/false into booleans', () => {
    const rows = [
      ['id', 'isClosed'],
      ['s1', 'false'],
      ['s2', 'true'],
    ];
    const items = parseSheetRows<{ id: string; isClosed: boolean }>(rows);
    expect(items[0].isClosed).toBe(false);
    expect(items[1].isClosed).toBe(true);
  });

  it('parses uppercase TRUE/FALSE into booleans (Google Sheets FORMATTED_VALUE render option)', () => {
    // Regression test: a season freshly created with isClosed=false round-tripped through
    // a Sheets pull came back as the string "FALSE" (truthy), showing every open season as
    // "Closed" in the UI. Google Sheets renders boolean cells as uppercase TRUE/FALSE by
    // default, not the lowercase strings this app writes.
    const rows = [
      ['id', 'isClosed'],
      ['s1', 'FALSE'],
      ['s2', 'TRUE'],
    ];
    const items = parseSheetRows<{ id: string; isClosed: boolean }>(rows);
    expect(items[0].isClosed).toBe(false);
    expect(items[1].isClosed).toBe(true);
  });

  it('parses mixed-case True/False into booleans', () => {
    const rows = [
      ['id', 'isCredit'],
      ['e1', 'True'],
      ['e2', 'False'],
    ];
    const items = parseSheetRows<{ id: string; isCredit: boolean }>(rows);
    expect(items[0].isCredit).toBe(true);
    expect(items[1].isCredit).toBe(false);
  });

  it('still parses numeric strings as numbers', () => {
    const rows = [
      ['id', 'amount'],
      ['e1', '1000'],
    ];
    const items = parseSheetRows<{ id: string; amount: number }>(rows);
    expect(items[0].amount).toBe(1000);
  });

  it('still restores JSON-stringified arrays/objects', () => {
    const rows = [
      ['id', 'shares'],
      ['f1', JSON.stringify([{ memberId: 'm1', percentage: 100 }])],
    ];
    const items = parseSheetRows<{ id: string; shares: unknown }>(rows);
    expect(items[0].shares).toEqual([{ memberId: 'm1', percentage: 100 }]);
  });

  it('leaves ordinary text untouched', () => {
    const rows = [
      ['id', 'cropName'],
      ['s1', 'Rice'],
    ];
    const items = parseSheetRows<{ id: string; cropName: string }>(rows);
    expect(items[0].cropName).toBe('Rice');
  });

  it('skips rows without a valid id', () => {
    const rows = [
      ['id', 'cropName'],
      ['', 'Rice'],
      ['s1', 'Wheat'],
    ];
    const items = parseSheetRows<{ id: string; cropName: string }>(rows);
    expect(items).toHaveLength(1);
    expect(items[0].cropName).toBe('Wheat');
  });
});
