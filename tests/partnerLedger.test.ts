import { describe, it, expect } from 'vitest';
import { buildSettlementLedger } from '../src/utils/calculations';
import { buildPartnerLedger } from '../src/utils/partnerLedger';

// Two partners, two fields, two cycles, and one of every kind of money
// movement — including common splits, stock, credit and a repayment — so the
// line-by-line detail has to reconcile with the engine's totals.
const members = [
  { id: 'm1', name: 'Ramesh' },
  { id: 'm2', name: 'Suresh' },
];
const fields = [
  { id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
  { id: 'f2', name: 'South', area: 1, shares: [{ memberId: 'm1', percentage: 100 }] },
];
const seasons = [
  { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false, shares: [{ memberId: 'm1', percentage: 70 }, { memberId: 'm2', percentage: 30 }] },
  { id: 's2', fieldId: 'f2', cropName: 'Cotton', startDate: '2026-07-01', isClosed: true, endDate: '2026-09-30' },
];
const expenses: any[] = [
  { id: 'e1', date: '2026-06-05', amount: 1000, paidByMemberId: 'm1', category: 'Seeds', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e2', date: '2026-06-10', amount: 900, paidByMemberId: 'm1', category: 'Tractor', targetType: 'common', allocations: [
    { fieldId: 'f1', seasonId: 's1', amount: 600 }, { fieldId: 'f2', seasonId: 's2', amount: 300 },
  ] },
  { id: 'e3', date: '2026-06-12', amount: 400, paidByMemberId: 'm2', category: 'Fertiliser', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e4', date: '2026-06-15', amount: 800, paidByMemberId: '', category: 'Pesticide', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1', isCredit: true, creditAccountId: 'c1' },
];
const labours: any[] = [
  { id: 'l1', date: '2026-06-20', workersCount: 4, wageRate: 500, totalCost: 2000, paidByMemberId: 'm1', targetType: 'common', allocations: [
    { fieldId: 'f1', seasonId: 's1', amount: 1500 }, { fieldId: 'f2', seasonId: 's2', amount: 500 },
  ] },
  { id: 'l2', date: '2026-07-02', workersCount: 2, wageRate: 400, totalCost: 800, paidByMemberId: 'm1', fieldId: 'f2', seasonId: 's2' },
];
const stockItems: any[] = [{ id: 'st1', name: 'Urea', type: 'Fertilizer', unit: 'bag', quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0 }];
const purchases: any[] = [
  { id: 'p1', stockItemId: 'st1', quantity: 10, totalCost: 3000, date: '2026-05-30', paidByMemberId: 'm1' },
  { id: 'p2', stockItemId: 'st1', quantity: 10, totalCost: 3000, date: '2026-05-31', paidByMemberId: 'm2' },
];
const usages: any[] = [
  { id: 'u1', stockItemId: 'st1', quantityUsed: 4, date: '2026-06-25', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'u2', stockItemId: 'st1', quantityUsed: 6, date: '2026-07-05', targetType: 'common', allocations: [
    { fieldId: 'f1', seasonId: 's1', quantity: 3, amount: 0 }, { fieldId: 'f2', seasonId: 's2', quantity: 3, amount: 0 },
  ] },
];
const revenues: any[] = [
  { id: 'r1', date: '2026-10-01', fieldId: 'f1', seasonId: 's1', crop: 'Paddy', quantity: 40, buyerName: 'Mill', saleAmount: 20000, receivedByMemberId: 'm2' },
  { id: 'r2', date: '2026-09-30', fieldId: 'f2', seasonId: 's2', crop: 'Cotton', quantity: 10, saleAmount: 9000, receivedByMemberId: 'm1' },
];
const creditAccounts: any[] = [{ id: 'c1', name: 'Agro Store', type: 'Vendor' }];
const creditRepayments: any[] = [{ id: 'cr1', creditAccountId: 'c1', memberId: 'm1', amount: 500, date: '2026-08-01' }];

const allSeasonIds = seasons.map(s => s.id);
const summary = buildSettlementLedger(
  fields as any, seasons as any, members, expenses, labours, revenues, usages, stockItems, purchases,
  allSeasonIds, creditAccounts, creditRepayments
);

const ledgerFor = (memberId: string, seasonIds: string[], extra: any = {}) =>
  buildPartnerLedger({
    memberId, seasonIds, summary, members, fields: fields as any, seasons: seasons as any,
    expenses, labours, revenues, usages, stockItems, purchases, creditAccounts, creditRepayments, ...extra,
  });

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('buildPartnerLedger', () => {
  it('matches the Settle engine total for the partner across all cycles', () => {
    const ledger = ledgerFor('m1', allSeasonIds);
    expect(ledger.totals.netPosition).toBeCloseTo(summary.membersTotalStatements.m1.netPosition, 2);
    expect(ledger.totals.paidIn).toBeCloseTo(summary.membersTotalStatements.m1.paidAmount, 2);
  });

  it('itemises lines that add up to what the partner paid in and received', () => {
    for (const memberId of ['m1', 'm2']) {
      for (const scope of [allSeasonIds, ['s1'], ['s2']]) {
        const ledger = ledgerFor(memberId, scope);
        expect(sum(ledger.lines.map(l => l.paidIn))).toBeCloseTo(ledger.totals.paidIn, 1);
        expect(sum(ledger.lines.map(l => l.received))).toBeCloseTo(ledger.totals.received, 1);
      }
    }
  });

  it('charges a common split only for its share in the selected cycle', () => {
    const ledger = ledgerFor('m1', ['s2']);
    const tractor = ledger.lines.find(l => l.id === 'e2')!;
    expect(tractor.paidIn).toBe(300);
    expect(tractor.isSplit).toBe(true);
    expect(tractor.cycles).toEqual(['Cotton · South']);
    // The Seeds bill belongs to Paddy only, so it is not in a Cotton report.
    expect(ledger.lines.find(l => l.id === 'e1')).toBeUndefined();
  });

  it('leaves out credit bills, which no partner paid, but counts the repayment', () => {
    const ledger = ledgerFor('m1', allSeasonIds);
    expect(ledger.lines.find(l => l.id === 'e4')).toBeUndefined();
    const repayment = ledger.lines.find(l => l.id === 'cr1')!;
    expect(repayment.kind).toBe('credit-repayment');
    expect(repayment.detail).toBe('Agro Store');
    expect(repayment.paidIn).toBeCloseTo(500, 2);
  });

  it('uses the season split over the field split', () => {
    const ledger = ledgerFor('m2', ['s1']);
    expect(ledger.cycles[0].sharePercentage).toBe(30);
  });

  it('keeps a cycle the partner has no stake in when their money went into it', () => {
    // Suresh owns none of Cotton, but urea he helped buy was used there.
    const cotton = ledgerFor('m2', allSeasonIds).cycles.find(c => c.seasonId === 's2')!;
    expect(cotton.sharePercentage).toBe(0);
    expect(cotton.paidAmount).toBeGreaterThan(0);
  });

  it('drops cycles where the partner has no stake and no money', () => {
    const withBystander = [...members, { id: 'm3', name: 'Mahesh' }];
    const summary3 = buildSettlementLedger(
      fields as any, seasons as any, withBystander, expenses, labours, revenues, usages, stockItems, purchases,
      allSeasonIds, creditAccounts, creditRepayments
    );
    const ledger = buildPartnerLedger({
      memberId: 'm3', seasonIds: allSeasonIds, summary: summary3, members: withBystander, fields: fields as any,
      seasons: seasons as any, expenses, labours, revenues, usages, stockItems, purchases, creditAccounts, creditRepayments,
    });
    expect(ledger.cycles).toEqual([]);
    expect(ledger.lines).toEqual([]);
  });

  it('lists who pays whom per cycle and whether the Settle tab ticked it off', () => {
    const before = ledgerFor('m2', ['s1']);
    const transfer = before.cycles[0].settlements[0];
    expect(transfer.counterpartyId).toBe('m1');
    expect(transfer.cleared).toBe(false);

    const key = transfer.direction === 'pays' ? 's1:m2:m1' : 's1:m1:m2';
    const after = ledgerFor('m2', ['s1'], {
      settlementClearances: [{ id: `sub|${key}`, scope: 'sub', key, clearedAt: '2026-10-02T00:00:00Z' }],
    });
    expect(after.cycles[0].settlements[0].cleared).toBe(true);
  });

  it('sorts lines by date', () => {
    const dates = ledgerFor('m1', allSeasonIds).lines.map(l => l.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('lists the stock this partner bought, separately from what was used', () => {
    const ledger = ledgerFor('m2', allSeasonIds);
    expect(ledger.stockPurchases.map(p => p.id)).toEqual(['p2']);
  });
});
