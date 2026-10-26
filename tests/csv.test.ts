import { describe, expect, it } from 'vitest';
import { csvCell, ledgerToCsv, toCsv } from '../src/utils/csv';
import type { LedgerItem } from '../src/utils/moneyLedger';

describe('csv', () => {
  it('quotes cells holding commas, quotes or line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('keeps typed text from running as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1234')).toBe("'+1234");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves real numbers alone, negatives included', () => {
    expect(csvCell(-250.5)).toBe('-250.5');
    expect(toCsv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2');
  });

  it('writes one row per ledger entry with a header', () => {
    const items = [
      { id: 'e1', type: 'expense', date: '2025-01-05', description: 'Seed, hybrid', subtext: '', amount: 1500, party: 'Ramesh', fieldSeasonName: 'Corn (Plot A)', rawRecord: {} },
      { id: 'r1', type: 'revenue', date: '2025-06-01', description: 'Harvest Sale: Corn', subtext: '', amount: 9000, party: 'Subba', fieldSeasonName: 'Corn (Plot A)', rawRecord: {} },
    ] as unknown as LedgerItem[];
    expect(ledgerToCsv(items).split('\r\n')).toEqual([
      'Date,Type,Description,Field / Crop cycle,Paid by / Received by,Amount',
      '2025-01-05,Expense,"Seed, hybrid",Corn (Plot A),Ramesh,1500',
      '2025-06-01,Harvest sale,Harvest Sale: Corn,Corn (Plot A),Subba,9000',
    ]);
  });
});
