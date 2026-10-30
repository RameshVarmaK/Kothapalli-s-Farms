import { describe, expect, it } from 'vitest';
import { calculateCropProfitability, calculateDashboardStats, calculateFieldPerformance, calculateSeasonalTrends, seasonLedgers } from '../src/utils/analytics';
import { buildSettlementLedger } from '../src/utils/calculations';
import { formatMoney, formatSignedMoney, singularUnit } from '../src/utils/format';
import type { LocalDatabase } from '../src/utils/database';

// A ledger that exercises every cost path: a direct expense, an expense split
// across two seasons, direct and split labour, and stock drawn from inventory.
function sampleDb(): LocalDatabase {
  const db: any = {
    members: [
      { id: 'm1', name: 'A', phone: '' },
      { id: 'm2', name: 'B', phone: '' },
    ],
    fields: [
      { id: 'f1', name: 'Farm A', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
      { id: 'f2', name: 'Farm B', area: 3, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
    ],
    seasons: [
      { id: 's1', fieldId: 'f1', cropName: 'Mirchi', startDate: '2026-09-01', isClosed: false, shares: [] },
      { id: 's2', fieldId: 'f2', cropName: 'Kandhi', startDate: '2026-09-10', isClosed: false, shares: [] },
    ],
    expenses: [
      { id: 'e1', date: '2026-09-05', amount: 1000, category: 'Seeds', paidByMemberId: 'm1', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
      { id: 'e2', date: '2026-10-02', amount: 500, category: 'Spray', paidByMemberId: 'm2', targetType: 'common', commonAllocationRule: 'equal',
        allocations: [{ fieldId: 'f1', seasonId: 's1', amount: 250 }, { fieldId: 'f2', seasonId: 's2', amount: 250 }] },
    ],
    labours: [
      { id: 'l1', date: '2026-09-07', workersCount: 4, wageRate: 300, totalCost: 1200, paidByMemberId: 'm1', targetType: 'single', fieldId: 'f2', seasonId: 's2' },
      { id: 'l2', date: '2026-10-03', workersCount: 2, wageRate: 300, totalCost: 600, paidByMemberId: 'm2', targetType: 'common',
        allocations: [{ fieldId: 'f1', seasonId: 's1', amount: 300 }, { fieldId: 'f2', seasonId: 's2', amount: 300 }] },
    ],
    revenues: [],
    stockItems: [{ id: 'st1', name: 'Urea', type: 'fertilizer', unit: 'Bags', quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} }],
    purchases: [{ id: 'p1', stockItemId: 'st1', date: '2026-09-02', quantity: 10, totalCost: 2000, paidByMemberId: 'm1' }],
    usages: [{ id: 'u1', stockItemId: 'st1', date: '2026-09-20', quantityUsed: 4, targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' }],
    activities: [],
    auditLogs: [],
    creditAccounts: [],
    creditRepayments: [],
    settlementClearances: [],
    notificationPreferences: [],
    settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: false, linkedSpreadsheetId: '' },
  };
  return db as LocalDatabase;
}

describe('Reports analytics agree with the settlement engine', () => {
  const db = sampleDb();
  const engine = buildSettlementLedger(
    db.fields, db.seasons, db.members, db.expenses, db.labours, db.revenues,
    db.usages, db.stockItems, db.purchases, db.seasons.map(s => s.id), db.creditAccounts, db.creditRepayments
  );
  const engineTotal = engine.ledgers.reduce((sum, l) => sum + l.totalExpense, 0);

  it('counts stock drawn from inventory and labour split across fields', () => {
    // 1000 + 250 + 300 + 4 bags × ₹200 = 2350 for Mirchi; 1200 + 250 + 300 = 1750 for Kandhi.
    expect(engineTotal).toBe(4100);
    expect(calculateDashboardStats(db).totalExpenses).toBe(engineTotal);
  });

  it('gives every crop season the same expense figure as the Home tab card', () => {
    const byCrop = Object.fromEntries(calculateCropProfitability(db).map(c => [c.seasonId, c.expenses]));
    for (const ledger of seasonLedgers(db)) {
      expect(byCrop[ledger.seasonId]).toBe(ledger.totalExpense);
    }
    expect(byCrop.s1).toBe(2350);
    expect(byCrop.s2).toBe(1750);
  });

  it('sums field performance from the same ledgers', () => {
    const fields = calculateFieldPerformance(db);
    expect(fields.find(f => f.fieldId === 'f1')?.totalExpenses).toBe(2350);
    expect(fields.find(f => f.fieldId === 'f2')?.expensesPerAcre).toBeCloseTo(1750 / 3);
  });

  it('leaves margin and ROI undefined until something is sold', () => {
    const stats = calculateDashboardStats(db);
    expect(stats.profitMargin).toBeNull();
    expect(stats.averageROI).toBeNull();
    expect(calculateCropProfitability(db).every(c => c.profitMargin === null)).toBe(true);
    expect(calculateFieldPerformance(db).every(f => f.roi === null)).toBe(true);
  });

  it('reports a margin once revenue exists', () => {
    const sold = sampleDb();
    (sold as any).revenues = [{ id: 'r1', date: '2026-11-01', seasonId: 's1', fieldId: 'f1', cropName: 'Mirchi', quantity: 10, saleAmount: 4700, receivedByMemberId: 'm1' }];
    const stats = calculateDashboardStats(sold);
    expect(stats.totalRevenue).toBe(4700);
    expect(stats.netProfit).toBe(600);
    expect(stats.profitMargin).toBeCloseTo((600 / 4700) * 100);
  });

  it('puts wages and stock usage into the monthly trend', () => {
    const trends = calculateSeasonalTrends(db);
    const sept = trends.find(t => t.season.startsWith('Sep'));
    const oct = trends.find(t => t.season.startsWith('Oct'));
    // September: 1000 expense + 1200 labour + 800 stock; October: 500 + 600.
    expect(sept?.totalExpenses).toBe(3000);
    expect(oct?.totalExpenses).toBe(1100);
    expect(trends.map(t => t.season)).toEqual(['Sep 2026', 'Oct 2026']);
  });
});

describe('money formatting', () => {
  it('uses Indian grouping, whole rupees and a leading minus', () => {
    expect(formatMoney(253850)).toBe('₹2,53,850');
    expect(formatMoney(-83847.33)).toBe('-₹83,847');
    expect(formatMoney(0.4)).toBe('₹0');
    expect(formatSignedMoney(1234)).toBe('+₹1,234');
    expect(formatSignedMoney(-5)).toBe('-₹5');
  });

  it('singularises area units for per-unit labels', () => {
    expect(singularUnit('acres')).toBe('acre');
    expect(singularUnit('Hectares')).toBe('hectare');
    expect(singularUnit(undefined)).toBe('acre');
  });
});
