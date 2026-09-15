/**
 * Additional test scenarios for production robustness.
 * Run with: npm run test:calculations (includes these tests)
 *
 * These cover scenarios identified in FUNCTIONALITY_REVIEW.md
 */

import {
  buildSettlementLedger,
  calculateAllocations,
} from '../src/utils/calculations';
import type {
  Member,
  Field,
  Season,
  Expense,
  HarvestRevenue,
  CreditAccount,
  CreditRepayment,
} from '../src/types';

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

// ========== Fixtures ==========

const M = (id: string, name: string): Member => ({ id, name });

const F = (id: string, name: string, area: number, shares: { id: string; pct: number }[]): Field => ({
  id,
  name,
  area,
  shares: shares.map(s => ({ memberId: s.id, percentage: s.pct })),
});

const S = (id: string, fieldId: string, cropName: string): Season => ({
  id,
  fieldId,
  cropName,
  startDate: '2025-01-01',
  isClosed: false,
});

// ========== NEW TESTS ==========

// Test 1: Negative Expense (Refund Scenario)
test('buildSettlementLedger: negative expense (refund) reduces total cost', () => {
  const members = [M('m1', 'Farmer A'), M('m2', 'Farmer B')];
  const fields = [F('f1', 'Plot 1', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Wheat')];

  const expenses: Expense[] = [
    // Original purchase: ₹1000
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: 'm1', category: 'Seeds',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
    // Refund: -₹200 (vendor gave partial refund)
    { id: 'e2', date: '2025-01-15', amount: -200, paidByMemberId: 'm1', category: 'Refund',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];

  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], [], []
  );

  // Net expense should be ₹800 (1000 - 200)
  const ledger = summary.ledgers[0];
  approxEqual(ledger.totalDirectExpense, 800, 0.01, 'net expense after refund');
  approxEqual(ledger.totalExpense, 800, 0.01, 'total expense');

  // m1 paid 1000 - 200 = 800, entitled to -400 (50% of -800 profit)
  // Net = -400 - (0 - 800) = 400
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 400, 0.5, 'm1 net with refund');

  // m2: entitled to -400, paid 0
  // Net = -400 - (0 - 0) = -400
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -400, 0.5, 'm2 net with refund');

  // Zero-sum check
  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'zero-sum with refund');
});

// Test 2: Loss Season (Zero Revenue)
test('buildSettlementLedger: loss season (zero revenue) distributes loss equally', () => {
  const members = [M('m1', 'A'), M('m2', 'B'), M('m3', 'C')];
  const fields = [F('f1', 'Plot', 1, [
    { id: 'm1', pct: 33.33 },
    { id: 'm2', pct: 33.33 },
    { id: 'm3', pct: 33.34 },
  ])];
  const seasons = [S('s1', 'f1', 'Cotton (Failed)')];

  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 3000, paidByMemberId: 'm1', category: 'Costs',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];

  // No revenue (crop failed)
  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], [], []
  );

  const ledger = summary.ledgers[0];
  approxEqual(ledger.totalRevenue, 0, 0.01, 'zero revenue');
  approxEqual(ledger.netProfit, -3000, 0.01, 'negative profit (loss)');

  // Loss split 3 ways: -1000 each
  approxEqual(summary.membersTotalStatements['m1'].entitledAmount, -1000, 0.5, 'm1 entitled to loss');
  approxEqual(summary.membersTotalStatements['m2'].entitledAmount, -1000, 0.5, 'm2 entitled to loss');
  approxEqual(summary.membersTotalStatements['m3'].entitledAmount, -1000, 0.5, 'm3 entitled to loss');

  // m1 paid 3000, so net = -1000 - (0 - 3000) = 2000 (gets compensated)
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 2000, 0.5, 'm1 net (paid all)');

  // m2, m3 paid nothing, so net = -1000 - (0 - 0) = -1000 (owe)
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -1000, 0.5, 'm2 net (paid nothing)');
  approxEqual(summary.membersTotalStatements['m3'].netPosition, -1000, 0.5, 'm3 net (paid nothing)');

  // Zero-sum
  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.1, 'loss season zero-sum');
  assert(summary.isBalanced, 'loss season must be balanced');
});

// Test 3: Partial Credit Repayment (Multiple Repayments)
test('buildSettlementLedger: partial credit repayment with multiple installments', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'P', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Crop')];

  const creditAccounts: CreditAccount[] = [{ id: 'c1', name: 'Vendor', type: 'Vendor' }];

  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: '', category: 'Credit',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
      isCredit: true, creditAccountId: 'c1' },
  ];

  // Two partial repayments totaling 600 (400 outstanding)
  const creditRepayments: CreditRepayment[] = [
    { id: 'rep1', creditAccountId: 'c1', memberId: 'm1', amount: 300, date: '2025-02-01' },
    { id: 'rep2', creditAccountId: 'c1', memberId: 'm2', amount: 300, date: '2025-03-01' },
  ];

  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1'], creditAccounts, creditRepayments
  );

  // Expense is ₹1000, profit = -₹1000, each entitled to -₹500
  // m1 repaid ₹300 → net = -500 - (0 - 300) = -200
  // m2 repaid ₹300 → net = -500 - (0 - 300) = -200
  approxEqual(summary.membersTotalStatements['m1'].netPosition, -200, 0.5, 'm1 after 300 repay');
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -200, 0.5, 'm2 after 300 repay');

  // Outstanding credit (400) shows as ledger discrepancy
  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, -400, 0.1, 'outstanding credit shows as -400 discrepancy');
});

// Test 4: Multiple Common Allocations Across Seasons
test('buildSettlementLedger: common allocation expense across 3 seasons', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [
    F('f1', 'Field1', 2, [{ id: 'm1', pct: 100 }]),
    F('f2', 'Field2', 1, [{ id: 'm2', pct: 100 }]),
  ];
  const seasons = [S('s1', 'f1', 'Crop1'), S('s2', 'f2', 'Crop2')];

  // Common equipment cost split by area: f1=2 acres, f2=1 acre (2:1 ratio)
  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 3000, paidByMemberId: 'm1', category: 'Tractor',
      targetType: 'common', commonAllocationRule: 'area',
      allocations: [
        { fieldId: 'f1', seasonId: 's1', amount: 2000 },  // 2/3 of 3000
        { fieldId: 'f2', seasonId: 's2', amount: 1000 },  // 1/3 of 3000
      ] },
  ];

  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], [], []
  );

  // m1 entitled: s1 -2000 (2/3 area), s2 0 (no share) → total -2000
  // m1 paid: 3000
  // net = -2000 - (0 - 3000) = 1000
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 1000, 0.5, 'm1 common alloc');

  // m2 entitled: s2 -1000 (1/3 area), s1 0 (no share) → total -1000
  // m2 paid: 0
  // net = -1000 - (0 - 0) = -1000
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -1000, 0.5, 'm2 common alloc');

  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'common alloc zero-sum');
});

// Test 5: Very Large Numbers (Rupees in Lakhs)
test('buildSettlementLedger: large amounts (₹1 lakh+) maintain accuracy', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Rice')];

  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 500000, paidByMemberId: 'm1', category: 'Major',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];

  const revenues: HarvestRevenue[] = [
    { id: 'r1', date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'Rice',
      quantity: 1, saleAmount: 1000000, receivedByMemberId: 'm2' },
  ];

  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], revenues, [], [], [], ['s1'], [], []
  );

  const ledger = summary.ledgers[0];
  approxEqual(ledger.netProfit, 500000, 0.01, 'large profit');

  // Each entitled to ₹250,000
  approxEqual(summary.membersTotalStatements['m1'].entitledAmount, 250000, 0.5, 'm1 large amount');
  approxEqual(summary.membersTotalStatements['m2'].entitledAmount, 250000, 0.5, 'm2 large amount');

  // m1: entitled ₹250k, paid ₹500k → net = ₹250k - (₹0 - ₹500k) = ₹750k
  approxEqual(summary.membersTotalStatements['m1'].netPosition, 750000, 1, 'm1 large net');

  // m2: entitled ₹250k, received ₹1M → net = ₹250k - (₹1M - ₹0) = -₹750k
  approxEqual(summary.membersTotalStatements['m2'].netPosition, -750000, 1, 'm2 large net');

  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 1, 'large amount zero-sum');
});

// Test 6: Negative Revenue (Loss/Damage After Sale)
test('buildSettlementLedger: negative revenue (sale reversal) is treated as cost', () => {
  const members = [M('m1', 'A'), M('m2', 'B')];
  const fields = [F('f1', 'Plot', 1, [{ id: 'm1', pct: 50 }, { id: 'm2', pct: 50 }])];
  const seasons = [S('s1', 'f1', 'Wheat')];

  const expenses: Expense[] = [
    { id: 'e1', date: '2025-01-01', amount: 1000, paidByMemberId: 'm1', category: 'Costs',
      targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  ];

  const revenues: HarvestRevenue[] = [
    { id: 'r1', date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'Wheat',
      quantity: 1, saleAmount: 2000, receivedByMemberId: 'm2' },
    // Reversal: buyer returned goods
    { id: 'r2', date: '2025-06-15', fieldId: 'f1', seasonId: 's1', crop: 'Wheat',
      quantity: 1, saleAmount: -500, receivedByMemberId: 'm2' },
  ];

  const summary = buildSettlementLedger(
    fields, seasons, members, expenses, [], revenues, [], [], [], ['s1'], [], []
  );

  const ledger = summary.ledgers[0];
  approxEqual(ledger.totalRevenue, 1500, 0.01, 'net revenue after reversal');
  approxEqual(ledger.netProfit, 500, 0.01, 'profit with reversal');

  // Each entitled to ₹250
  approxEqual(summary.membersTotalStatements['m1'].entitledAmount, 250, 0.5, 'm1 entitled');
  approxEqual(summary.membersTotalStatements['m2'].entitledAmount, 250, 0.5, 'm2 entitled');

  const netSum = Object.values(summary.membersTotalStatements)
    .reduce((s, m) => s + m.netPosition, 0);
  approxEqual(netSum, 0, 0.05, 'reversal zero-sum');
});

// ========== Export for runner ==========
export { tests };
