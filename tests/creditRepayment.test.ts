import { describe, it, expect } from 'vitest';
import { buildSettlementLedger } from '../src/utils/calculations';
import { Field, Season, Member, Expense, CreditAccount, CreditRepayment } from '../src/types';

/**
 * Documents how a purchase made on a creditor's account reaches a season's
 * ledger: not when it is incurred, but as and when a member repays the
 * creditor — and then only in proportion to that creditor's credit volume
 * sitting in this season.
 */
const members: Member[] = [
  { id: 'mem_x', name: 'X' },
  { id: 'mem_y', name: 'Y' }
];

const fieldA: Field = {
  id: 'field_a',
  name: 'Field A',
  area: 2,
  shares: [
    { memberId: 'mem_x', percentage: 50 },
    { memberId: 'mem_y', percentage: 50 }
  ]
};

const fieldB: Field = { ...fieldA, id: 'field_b', name: 'Field B' };

const seasonA: Season = {
  id: 'season_a',
  fieldId: 'field_a',
  cropName: 'Paddy',
  startDate: '2026-06-01',
  isClosed: false
};

const seasonB: Season = { ...seasonA, id: 'season_b', fieldId: 'field_b', cropName: 'Cotton' };

const creditor: CreditAccount = { id: 'cred_1', name: 'Manure Vendor', type: 'Vendor' };

const manureOnCredit: Expense = {
  id: 'exp_manure',
  date: '2026-06-10',
  amount: 400,
  paidByMemberId: 'mem_x',
  category: 'Manure',
  targetType: 'single',
  targetFieldId: 'field_a',
  targetSeasonId: 'season_a',
  isCredit: true,
  creditAccountId: 'cred_1'
};

const repay = (amount: number): CreditRepayment => ({
  id: 'rep_1',
  creditAccountId: 'cred_1',
  memberId: 'mem_x',
  amount,
  date: '2026-07-01'
});

const paidBy = (memberId: string, expenses: Expense[], repayments: CreditRepayment[], seasons = [seasonA]) => {
  const summary = buildSettlementLedger(
    [fieldA, fieldB], seasons, members, expenses, [], [], [], [], [],
    seasons.map(s => s.id), [creditor], repayments
  );
  const ledgerA = summary.ledgers.find(l => l.seasonId === 'season_a')!;
  return ledgerA.statements.find(s => s.memberId === memberId)!.paidAmount;
};

const paidByX = (expenses: Expense[], repayments: CreditRepayment[], seasons = [seasonA]) => {
  const summary = buildSettlementLedger(
    [fieldA, fieldB], seasons, members, expenses, [], [], [], [], [],
    seasons.map(s => s.id), [creditor], repayments
  );
  const ledgerA = summary.ledgers.find(l => l.seasonId === 'season_a')!;
  return ledgerA.statements.find(s => s.memberId === 'mem_x')!.paidAmount;
};

describe('credit purchase then repayment', () => {
  it('credits nothing while the bill is unpaid', () => {
    // The creditor financed it, not X — so X has not funded anything yet.
    expect(paidByX([manureOnCredit], [])).toBe(0);
  });

  it('credits X with 300 of field A after X repays 300 of the 400', () => {
    // The question asked: manure of 400 bought on the creditor's account for
    // field A, X later pays 300. Field A should show X funded 300.
    expect(paidByX([manureOnCredit], [repay(300)])).toBe(300);
  });

  it('credits the full 400 once X settles the creditor completely', () => {
    expect(paidByX([manureOnCredit], [repay(400)])).toBe(400);
  });

  it('spreads a repayment across every season carrying that creditor debt', () => {
    // The same creditor also financed 600 on field B. A repayment is not tied
    // to a particular bill: it is apportioned by each season's share of that
    // creditor's total credit, so field A receives 400/1000 of the 300.
    const dieselOnCredit: Expense = {
      ...manureOnCredit,
      id: 'exp_diesel',
      amount: 600,
      category: 'Diesel',
      targetFieldId: 'field_b',
      targetSeasonId: 'season_b'
    };

    expect(paidByX([manureOnCredit, dieselOnCredit], [repay(300)], [seasonA, seasonB])).toBe(120);
  });
});

describe('who repays is who gets credited', () => {
  it('credits the repayer, not the member who ordered the goods', () => {
    // X placed the order on the vendor's account, but Y is the one who pays
    // the vendor. The funding belongs to Y.
    const paidByY: CreditRepayment = { ...repay(300), id: 'rep_y', memberId: 'mem_y' };

    expect(paidBy('mem_y', [manureOnCredit], [paidByY])).toBe(300);
    expect(paidBy('mem_x', [manureOnCredit], [paidByY])).toBe(0);
  });

  it('splits the credit when both partners chip in', () => {
    const repayments: CreditRepayment[] = [
      { ...repay(100), id: 'rep_x', memberId: 'mem_x' },
      { ...repay(300), id: 'rep_y', memberId: 'mem_y' }
    ];

    expect(paidBy('mem_x', [manureOnCredit], repayments)).toBe(100);
    expect(paidBy('mem_y', [manureOnCredit], repayments)).toBe(300);
  });
});
