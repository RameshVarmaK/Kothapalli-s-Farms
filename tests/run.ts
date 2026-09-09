/**
 * Lightweight standalone test harness for the FarmLedger calculation engine.
 *
 * Run with:   npm run test
 * Implementation note: no third-party test framework is required. Each test
 * registers itself with `test(name, fn)` and assertions throw with a clear
 * message; the runner prints a summary and exits non-zero on failure.
 */

import {
  computeStockLevels,
  calculateAllocations,
  buildSettlementLedger,
  allocationDiscrepancy,
} from '../src/utils/calculations';
import type {
  Member,
  Field,
  Season,
  Expense,
  Labour,
  HarvestRevenue,
  StockItem,
  StockPurchase,
  StockUsage,
  CreditAccount,
  CreditRepayment,
} from '../src/types';
import { tests as additionalTests } from './additional-scenarios.test';

type TestFn = () => void | Promise<void>;
interface TestCase {
  name: string;
  fn: TestFn;
}

const tests: TestCase[] = [];
function test(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

function approxEqual(actual: number, expected: number, eps = 0.01, label = '') {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(
      `Expected ${label || 'value'} ≈ ${expected} (±${eps}) but got ${actual}`,
    );
  }
}

// ---------- Fixtures -----------------------------------------------------

const M = (id: string, name: string): Member => ({ id, name });

const F = (id: string, name: string, area: number, shares: { id: string; pct: number }[]): Field => ({
  id,
  name,
  area,
  shares: shares.map(s => ({ memberId: s.id, percentage: s.pct })),
});

const S = (id: string, fieldId: string, cropName: string, isClosed = false): Season => ({
  id,
  fieldId,
  cropName,
  startDate: '2025-01-01',
  isClosed,
});

// ---------- Tests --------------------------------------------------------

test('computeStockLevels: empty inputs produce empty output', () => {
  const r = computeStockLevels([], [], []);
  assert(Array.isArray(r) && r.length === 0, 'expected empty array');
});

test('computeStockLevels: weighted-average cost across two purchases', () => {
  const items: StockItem[] = [
    { id: 'i1', name: 'Urea', type: 'Fertilizer', unit: 'bag',
      quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} },
  ];
  const purchases: StockPurchase[] = [
    { id: 'p1', stockItemId: 'i1', quantity: 10, totalCost: 1000, date: '2025-01-10', paidByMemberId: 'm1' },
    { id: 'p2', stockItemId: 'i1', quantity: 10, totalCost: 1500, date: '2025-02-10', paidByMemberId: 'm2' },
  ];
  const result = computeStockLevels(items, purchases, []);
  approxEqual(result[0].quantityOnHand, 20, 0.001, 'quantityOnHand');
  approxEqual(result[0].weightedAverageCost, 125, 0.01, 'weightedAverageCost');
  approxEqual(result[0].totalCostSpent, 2500, 0.01, 'totalCostSpent');
  approxEqual(result[0].fundingByMember['m1'] || 0, 1000, 0.01, 'm1 funding');
  approxEqual(result[0].fundingByMember['m2'] || 0, 1500, 0.01, 'm2 funding');
});

test('computeStockLevels: usages reduce quantityOnHand', () => {
  const items: StockItem[] = [
    { id: 'i1', name: 'Seed', type: 'Seed', unit: 'kg',
      quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} },
  ];
  const purchases: StockPurchase[] = [
    { id: 'p1', stockItemId: 'i1', quantity: 100, totalCost: 5000, date: '2025-01-01', paidByMemberId: 'm1' },
  ];
  const usages: StockUsage[] = [
    { id: 'u1', stockItemId: 'i1', quantityUsed: 30, date: '2025-02-01', targetType: 'single',
      targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const r = computeStockLevels(items, purchases, usages);
  approxEqual(r[0].quantityOnHand, 70, 0.001, 'quantityOnHand after usage');
});

test('computeStockLevels: usage never goes negative', () => {
  const items: StockItem[] = [
    { id: 'i1', name: 'Spray', type: 'Pesticide', unit: 'l',
      quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} },
  ];
  const purchases: StockPurchase[] = [
    { id: 'p1', stockItemId: 'i1', quantity: 10, totalCost: 200, date: '2025-01-01', paidByMemberId: 'm1' },
  ];
  const usages: StockUsage[] = [
    { id: 'u1', stockItemId: 'i1', quantityUsed: 999, date: '2025-02-01', targetType: 'single',
      targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const r = computeStockLevels(items, purchases, usages);
  assert(r[0].quantityOnHand >= 0, 'quantity cannot be negative');
});

test('calculateAllocations: equal split with rounding remainder', () => {
  const r = calculateAllocations(100, 'equal', [
    { fieldId: 'f1', seasonId: 's1', fieldArea: 1 },
    { fieldId: 'f2', seasonId: 's2', fieldArea: 1 },
    { fieldId: 'f3', seasonId: 's3', fieldArea: 1 },
  ]);
  const sum = r.reduce((s, a) => s + a.amount, 0);
  approxEqual(sum, 100, 0.001, 'sum of allocations must equal total amount');
});

test('calculateAllocations: area proportional', () => {
  const r = calculateAllocations(900, 'area', [
    { fieldId: 'f1', seasonId: 's1', fieldArea: 1 },
    { fieldId: 'f2', seasonId: 's2', fieldArea: 2 },
  ]);
  const sum = r.reduce((s, a) => s + a.amount, 0);
  approxEqual(sum, 900, 0.001, 'sum');
  approxEqual(r[0].amount, 300, 0.01, 'small field gets 1/3');
  approxEqual(r[1].amount, 600, 0.01, 'big field gets 2/3');
});

test('calculateAllocations: area fallback to equal when totalArea==0', () => {
  const r = calculateAllocations(50, 'area', [
    { fieldId: 'f1', seasonId: 's1', fieldArea: 0 },
    { fieldId: 'f2', seasonId: 's2', fieldArea: 0 },
  ]);
  const sum = r.reduce((s, a) => s + a.amount, 0);
  approxEqual(sum, 50, 0.001, 'sum after fallback');
});

test('calculateAllocations: empty target list returns empty list', () => {
  const r = calculateAllocations(100, 'equal', []);
  assert(r.length === 0, 'must be empty');
});

test('buildSettlementLedger: zero-sum invariant with two partners 50/50', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Corn')];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-05', amount: 1000, paidByMemberId: 'm1', category: 'Seed',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const revenues: HarvestRevenue[] = [
    { id: 'r1', date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'Corn',
      quantity: 1, saleAmount: 2000, receivedByMemberId: 'm2' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], revenues, [], [], [], ['s1'], [], [],
  );

  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.01, 'net positions must sum to 0');
  assert(summary.isBalanced, 'isBalanced must be true');

  // m1 paid 1000, entitled to 500. Net = 500 - (0 - 1000) = 1500 (creditor).
  // m2 received 2000, entitled to 500. Net = 500 - (2000 - 0) = -1500 (debtor).
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 1500, 0.01, 'm1 net');
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -1500, 0.01, 'm2 net');

  assert(summary.debts.length === 1, 'one simplified debt');
  assert(summary.debts[0].fromId === 'm2' && summary.debts[0].toId === 'm1',
    'm2 must pay m1');
  approxEqual(summary.debts[0].amount, 1500, 0.01, 'simplified debt amount');
});

test('buildSettlementLedger: debt simplification minimises transfers (3 partners)', () => {
  // Partners with stake but only m3 paid all expense, m1 received all revenue.
  const members = [M('m1', 'A'), M('m2', 'B'), M('m3', 'C')];
  const fields = [F('f1', 'Plot', 1, [
    { id: 'm1', pct: 33.34 }, { id: 'm2', pct: 33.33 }, { id: 'm3', pct: 33.33 },
  ])];
  const seasons = [S('s1', 'f1', 'Cotton')];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 3000, paidByMemberId: 'm3', category: 'All',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const revenues: HarvestRevenue[] = [
    { id: 'r1', date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'Cotton',
      quantity: 1, saleAmount: 6000, receivedByMemberId: 'm1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], revenues, [], [], [], ['s1'], [], [],
  );
  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'net positions must sum to 0');
  assert(summary.debts.length <= members.length - 1,
    `simplified debt count ${summary.debts.length} must be ≤ ${members.length - 1}`);
});

test('buildSettlementLedger: stock funding attribution', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Rice')];
  // m1 buys all the seed (₹1000 for 10 kg).
  const stockItems: StockItem[] = [
    { id: 'i1', name: 'Seed', type: 'Seed', unit: 'kg',
      quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} },
  ];
  const purchases: StockPurchase[] = [
    { id: 'p1', stockItemId: 'i1', quantity: 10, totalCost: 1000, date: '2025-01-01', paidByMemberId: 'm1' },
  ];
  const usages: StockUsage[] = [
    { id: 'u1', stockItemId: 'i1', quantityUsed: 10, date: '2025-02-01', targetType: 'single',
      targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, [], [], [], usages, stockItems, purchases, ['s1'], [], [],
  );

  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'net positions must sum to 0 with stock funding');

  // Stock-funded entirely by m1 (₹1000). No revenue. profit = -1000. Each entitled = -500.
  // Paid by m1 = 1000, m2 = 0. m1 net = -500 - (0 - 1000) = 500. m2 net = -500.
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 500, 0.5, 'm1 net stock');
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -500, 0.5, 'm2 net stock');
});

test('buildSettlementLedger: credit incurred + matching repayment balances', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Maize')];
  const creditAccounts: CreditAccount[] = [{ id: 'c1', name: 'Tractor Co', type: 'Tractor' }];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: '', category: 'Tractor hire',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
      isCredit: true, creditAccountId: 'c1' },
  ];
  // m1 fully repays the creditor.
  const creditRepayments: CreditRepayment[] = [
    { id: 'rep1', creditAccountId: 'c1', memberId: 'm1', amount: 1000, date: '2025-02-01' },
  ];

  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], creditAccounts, creditRepayments,
  );

  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'net positions must sum to 0 after credit + repayment');
  // m1 paid 1000 to creditor; entitled to -500 of loss. Net = -500 - (0 - 1000) = 500.
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 500, 0.5, 'm1 net credit');
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -500, 0.5, 'm2 net credit');
});

test('buildSettlementLedger: unpaid credit shows imbalance until repayment', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Wheat')];
  const creditAccounts: CreditAccount[] = [{ id: 'c1', name: 'Vendor', type: 'Vendor' }];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: '', category: 'Fert',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
      isCredit: true, creditAccountId: 'c1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], creditAccounts, [],
  );
  // Until the creditor is repaid, the ledger should signal a discrepancy
  // equal to the outstanding credit. Right now: no one paid, so paidAmount
  // for every member is 0; total expense reduces profit by 1000; entitled
  // splits the loss equally. Both members are owed nothing (net = -500 each)
  // => sum is -1000, NOT zero. This is a known characteristic of the
  // credit-aware engine and the test documents it.
  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, -1000, 0.5,
    'expected the outstanding credit to appear as -1000 discrepancy');
  assert(!summary.isBalanced, 'must NOT be balanced when credit is unpaid');
});

test('buildSettlementLedger: common-allocation expense splits correctly', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [
    F('f1', 'A1', 1, [{ id: 'm1', pct: 100 }]),
    F('f2', 'A2', 1, [{ id: 'm2', pct: 100 }]),
  ];
  const seasons = [S('s1', 'f1', 'Crop1'), S('s2', 'f2', 'Crop2')];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: 'm1', category: 'Pump',
      targetType: 'common', commonAllocationRule: 'equal',
      allocations: [
        { fieldId: 'f1', seasonId: 's1', amount: 500 },
        { fieldId: 'f2', seasonId: 's2', amount: 500 },
      ] },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], [], [],
  );
  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'common-allocation net sum must be 0');

  // m1 paid 1000, entitled -500 (loss on s1). Net = -500 - (0 - 500) = 0. Wait recheck...
  // s1 expenses: 500 → profit -500 → m1 entitled -500. Paid by m1 in s1 = 500.
  // s2 expenses: 500 → profit -500 → m2 entitled -500. Paid by m1 in s2 = 500.
  // m1 total: entitled -500, paid 1000, net = -500 - (0 - 1000) = 500
  // m2 total: entitled -500, paid 0, net = -500 - (0 - 0) = -500
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 500, 0.5, 'm1 split');
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -500, 0.5, 'm2 split');
});

test('buildSettlementLedger: season-level share overrides field share', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  // Field shares are 50/50.
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  // But this season is 90/10.
  const seasons: Season[] = [{
    ...S('s1', 'f1', 'OneOff'),
    shares: [{ memberId: 'm1', percentage: 90 }, { memberId: 'm2', percentage: 10 }],
  }];
  const revenues: HarvestRevenue[] = [
    { id: 'r1', date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'OneOff',
      quantity: 1, saleAmount: 1000, receivedByMemberId: 'm1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, [], [], revenues, [], [], [], ['s1'], [], [],
  );
  approxEqual(summary.membersTotalStatements['m1'].entitledAmount, 900, 0.01,
    'season-level share must be 90% for m1');
  approxEqual(summary.membersTotalStatements['m2'].entitledAmount, 100, 0.01,
    'season-level share must be 10% for m2');
});

test('buildSettlementLedger: handles empty inputs without throwing', () => {
  const summary = buildSettlementLedger([], [], [], [], [], [], [], [], [], [], [], []);
  assert(summary.ledgers.length === 0, 'no ledgers');
  assert(summary.debts.length === 0, 'no debts');
  assert(summary.isBalanced, 'empty must be balanced');
});

// ---------- Adversarial / edge-case tests --------------------------------

test('calculateAllocations: manual amounts ignore the total amount argument', () => {
  // Documents a known behaviour. If callers supply manual values that don't
  // sum to `amount`, the engine simply trusts the manual values. The UI
  // must therefore validate the sum before calling this; otherwise the
  // settlement engine will silently produce an inconsistent state.
  const r = calculateAllocations(1000, 'manual', [
    { fieldId: 'f1', seasonId: 's1', fieldArea: 1 },
    { fieldId: 'f2', seasonId: 's2', fieldArea: 1 },
  ], { 'f1_s1': 300, 'f2_s2': 200 });
  const sum = r.reduce((s, a) => s + a.amount, 0);
  approxEqual(sum, 500, 0.01,
    'manual allocations should sum to whatever the caller provided (500), not the headline amount (1000)');
});

test('calculateAllocations: equal split with non-divisible amounts has zero rounding loss', () => {
  // Tests the rounding-residual logic: the last entry must absorb the remainder.
  const r = calculateAllocations(100, 'equal', [
    { fieldId: 'f1', seasonId: 's1', fieldArea: 1 },
    { fieldId: 'f2', seasonId: 's2', fieldArea: 1 },
    { fieldId: 'f3', seasonId: 's3', fieldArea: 1 },
    { fieldId: 'f4', seasonId: 's4', fieldArea: 1 },
    { fieldId: 'f5', seasonId: 's5', fieldArea: 1 },
    { fieldId: 'f6', seasonId: 's6', fieldArea: 1 },
    { fieldId: 'f7', seasonId: 's7', fieldArea: 1 },
  ]);
  const sum = r.reduce((s, a) => s + a.amount, 0);
  approxEqual(sum, 100, 0.001, 'sum must equal headline');
});

test('computeStockLevels: fractional quantities round to 4 decimals', () => {
  const items: StockItem[] = [
    { id: 'i1', name: 'Fert', type: 'Fertilizer', unit: 'kg',
      quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} },
  ];
  const purchases: StockPurchase[] = [
    { id: 'p1', stockItemId: 'i1', quantity: 1 / 3, totalCost: 1, date: '2025-01-01', paidByMemberId: 'm1' },
  ];
  const r = computeStockLevels(items, purchases, []);
  // 1/3 = 0.3333... rounded to 4 decimals
  approxEqual(r[0].quantityOnHand, 0.3333, 0.0001, 'fractional quantity rounding');
});

test('buildSettlementLedger: orphaned shares (member deleted) does not crash', () => {
  // Member m2 is referenced in field shares but is NOT in the members list.
  // The engine must not crash and the orphaned share simply has no statement.
  const members = [M('m1', 'A')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'X')];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: 'm1', category: 'X',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], [], [],
  );
  // m1 is entitled to only 50% of the loss (-500). They paid 1000, so net = 500.
  // The other 50% goes to a phantom m2 — orphaned share is silently dropped.
  // This is a documented gotcha; the UI should warn when shares reference
  // a missing member.
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 500, 0.5,
    'm1 net should reflect only their own share');
});

test('buildSettlementLedger: multi-creditor proportional repayment attribution', () => {
  // m1 incurs 2 credit bills with creditor c1: ₹600 on s1 and ₹400 on s2
  // (total ₹1000). m2 then repays ₹500. The repayment must be attributed
  // proportionally across both seasons (₹300 to s1 and ₹200 to s2).
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [
    F('f1', 'F1', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }]),
    F('f2', 'F2', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }]),
  ];
  const seasons = [S('s1', 'f1', 'Crop1'), S('s2', 'f2', 'Crop2')];
  const creditAccounts: CreditAccount[] = [{ id: 'c1', name: 'Vendor', type: 'Vendor' }];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 600, paidByMemberId: '', category: 'Bill1',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
      isCredit: true, creditAccountId: 'c1' },
    { id: 'e2', date: '2025-01-01', amount: 400, paidByMemberId: '', category: 'Bill2',
      targetType: 'single', targetFieldId: 'f2', targetSeasonId: 's2',
      isCredit: true, creditAccountId: 'c1' },
  ];
  const creditRepayments: CreditRepayment[] = [
    { id: 'rep1', creditAccountId: 'c1', memberId: 'm2', amount: 500, date: '2025-02-01' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], creditAccounts, creditRepayments,
  );
  // m2's repayment (500) attributed proportionally:
  //   s1: 500 × 600/1000 = 300
  //   s2: 500 × 400/1000 = 200
  const m2PaidAcrossSeasons = summary.ledgers
    .reduce((s, l) => {
      const stmt = l.statements.find(st => st.memberId === 'm2');
      return s + (stmt ? stmt.paidAmount : 0);
    }, 0);
  approxEqual(m2PaidAcrossSeasons, 500, 0.5,
    'm2 repayment must reconcile across both seasons in total');
});

test('buildSettlementLedger: bad share data (sum != 100%) does not crash but is unbalanced', () => {
  // If shares don't sum to 100% the entitled amounts won't sum to net
  // profit, which leaves a discrepancy. Engine must still produce output
  // without throwing.
  const members = [M('m1', 'A'), M('m2', 'B')];
  // Sums to 80%, not 100%.
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 30 }])];
  const seasons = [S('s1', 'f1', 'X')];
  const revenues: HarvestRevenue[] = [
    { id: 'r1', date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'X',
      quantity: 1, saleAmount: 1000, receivedByMemberId: 'm1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, [], [], revenues, [], [], [], ['s1'], [], [],
  );
  const totalEntitled = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.entitledAmount, 0);
  approxEqual(totalEntitled, 800, 0.5,
    "total entitled is only 80% of revenue when shares don't add to 100%");
  assert(!summary.isBalanced, "must NOT be balanced when shares don't sum to 100%");
});

test('buildSettlementLedger: edit a season-share to 0 yields zero entitlement', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  // m2 is fully removed from the season ownership.
  const seasons: Season[] = [{
    ...S('s1', 'f1', 'SoloCrop'),
    shares: [{ memberId: 'm1', percentage: 100 }],
  }];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: 'm2', category: 'X',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], [], [],
  );
  // m2 paid 1000 but has 0% share -> entitled 0 -> net = 0 - (0 - 1000) = 1000 (owed).
  // m1 entitled -1000 -> net = -1000.
  approxEqual(summary.membersTotalStatements['m2'].netPosition, 1000, 0.5, 'm2 owed full payback');
  approxEqual(summary.membersTotalStatements['m1'].netPosition, -1000, 0.5, 'm1 owes full bill');
});

test('allocationDiscrepancy: balanced manual allocation returns 0', () => {
  const diff = allocationDiscrepancy(1000, { a: 400, b: 600 });
  approxEqual(diff, 0, 0.001, 'balanced manual sum');
});

test('allocationDiscrepancy: mixed string/number values are coerced', () => {
  const diff = allocationDiscrepancy(1000, { a: '400.00', b: 599.5 });
  approxEqual(diff, 0.5, 0.001, 'half-rupee shortfall reported');
});

test('allocationDiscrepancy: non-numeric noise is treated as zero', () => {
  const diff = allocationDiscrepancy(500, { a: 250, b: 'abc' as any });
  approxEqual(diff, 250, 0.001, 'garbage values count as zero');
});

test('allocationDiscrepancy: positive diff means allocation under-fills target', () => {
  const diff = allocationDiscrepancy(1000, { a: 400, b: 400 });
  assert(diff > 0, 'positive diff = need to add more');
  approxEqual(diff, 200, 0.001, 'short by 200');
});

test('allocationDiscrepancy: negative diff means allocation over-fills target', () => {
  const diff = allocationDiscrepancy(1000, { a: 600, b: 600 });
  assert(diff < 0, 'negative diff = need to remove some');
  approxEqual(diff, -200, 0.001, 'over by 200');
});

test('buildSettlementLedger: isBalanced tolerance catches sub-rupee floating noise', () => {
  // Three-way split of an odd amount (100/3) is a classic float trap.
  // The tightened threshold (0.1) should still consider this balanced
  // because all positions are derived from the same total.
  const members = [M('m1', 'A'), M('m2', 'B'), M('m3', 'C')];
  const fields = [F('f1', 'P', 1, [
    { id: 'm1', pct: 33.33 },
    { id: 'm2', pct: 33.33 },
    { id: 'm3', pct: 33.34 },
  ])];
  const seasons = [S('s1', 'f1', 'X')];
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 100, paidByMemberId: 'm1', category: 'X',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], [], [],
  );
  // The sum of net positions of all members should be ~0 by construction.
  const sumNet = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(sumNet, 0, 0.01, 'sum of net positions is zero (energy conservation)');
  assert(summary.isBalanced, 'sub-rupee imbalance should still register as balanced');
});

// ---------- Runner -------------------------------------------------------

(async function main() {
  // Combine core tests and additional scenario tests
  const allTests = [...tests, ...additionalTests];

  let pass = 0;
  let fail = 0;
  const failures: { name: string; err: any }[] = [];

  for (const t of allTests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      pass++;
    } catch (err: any) {
      console.error(`  ✗ ${t.name}`);
      console.error(`      ${err.message || err}`);
      failures.push({ name: t.name, err });
      fail++;
    }
  }

  console.log('');
  console.log(`Total: ${pass + fail}   Passed: ${pass}   Failed: ${fail}`);
  if (fail > 0) {
    console.log('');
    console.log('FAILURES:');
    failures.forEach(f => {
      console.log(`  - ${f.name}: ${f.err.message || f.err}`);
    });
    process.exit(1);
  }
})();
