import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  allocateToBills,
  attributeRepayments,
  billKey,
  billOutstanding,
  creditBills,
  paidOnBill,
} from '../src/utils/creditBills';
import { buildSettlementLedger } from '../src/utils/calculations';
import type { CreditAccount, CreditRepayment, Expense, Field, Labour, Member, Season } from '../src/types';

const members: Member[] = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
const field = (id: string): Field => ({ id, name: id, area: 2, shares: [{ memberId: 'x', percentage: 50 }, { memberId: 'y', percentage: 50 }] });
const season = (id: string, fieldId: string): Season => ({ id, fieldId, cropName: id, startDate: '2026-06-01', isClosed: false });
const creditor: CreditAccount = { id: 'c1', name: 'Palem labour', type: 'Labour' };

const bill = (id: string, amount: number, seasonId: string, date = '2026-06-10'): Expense => ({
  id, date, amount, paidByMemberId: '', category: id, targetType: 'single',
  targetFieldId: seasonId === 's1' ? 'f1' : 'f2', targetSeasonId: seasonId, isCredit: true, creditAccountId: 'c1',
});
const repay = (id: string, memberId: string, amount: number, billAllocations?: CreditRepayment['billAllocations'], date = '2026-07-01'): CreditRepayment =>
  ({ id, creditAccountId: 'c1', memberId, amount, date, billAllocations });

const attribute = (expenses: Expense[], repayments: CreditRepayment[], labours: Labour[] = []) => {
  const bills = creditBills('c1', expenses, labours);
  return { bills, attribution: attributeRepayments(bills, repayments) };
};
const paid = (a: ReturnType<typeof attribute>, id: string, memberId: string) =>
  a.attribution.get(billKey('expense', id))?.get(memberId) ?? 0;

describe('attributeRepayments', () => {
  it('settles the oldest bill first when a payment names none', () => {
    const a = attribute([bill('b1', 400, 's1', '2026-06-01'), bill('b2', 600, 's2', '2026-06-05')], [repay('r1', 'x', 300)]);
    expect(paid(a, 'b1', 'x')).toBe(300);
    expect(paid(a, 'b2', 'x')).toBe(0);
  });

  it('carries an untagged payment on to the next bill once the oldest is cleared', () => {
    const a = attribute([bill('b1', 400, 's1', '2026-06-01'), bill('b2', 600, 's2', '2026-06-05')], [repay('r1', 'x', 700)]);
    expect(paid(a, 'b1', 'x')).toBe(400);
    expect(paid(a, 'b2', 'x')).toBe(300);
  });

  it('applies untagged payments in the order they were made', () => {
    const a = attribute(
      [bill('b1', 400, 's1', '2026-06-01'), bill('b2', 600, 's2', '2026-06-05')],
      [repay('late', 'y', 300, undefined, '2026-07-20'), repay('early', 'x', 300, undefined, '2026-07-10')]
    );
    expect(paid(a, 'b1', 'x')).toBe(300);
    expect(paid(a, 'b1', 'y')).toBe(100);
    expect(paid(a, 'b2', 'y')).toBe(200);
  });

  it('puts a ticked payment on that bill alone', () => {
    const a = attribute([bill('b1', 400, 's1'), bill('b2', 600, 's2')], [repay('r1', 'x', 300, [{ billKey: 'expense:b2', amount: 300 }])]);
    expect(paid(a, 'b1', 'x')).toBe(0);
    expect(paid(a, 'b2', 'x')).toBe(300);
  });

  it('sends untagged money to what is still unpaid, not to a bill already settled', () => {
    // X settles b1 in full by ticking it; Y's untagged payment must then go to b2.
    const a = attribute(
      [bill('b1', 400, 's1', '2026-06-01'), bill('b2', 600, 's2', '2026-06-05')],
      [repay('r1', 'x', 400, [{ billKey: 'expense:b1', amount: 400 }]), repay('r2', 'y', 300)]
    );
    expect(paid(a, 'b1', 'y')).toBe(0);
    expect(paid(a, 'b2', 'y')).toBeCloseTo(300);
  });

  it('lets a ticked payment win its bill even when an untagged one was made earlier', () => {
    const a = attribute(
      [bill('b1', 400, 's1'), bill('b2', 400, 's2')],
      [repay('early', 'y', 400, undefined, '2026-06-20'), repay('late', 'x', 400, [{ billKey: 'expense:b1', amount: 400 }], '2026-07-20')]
    );
    expect(paid(a, 'b1', 'x')).toBe(400);
    expect(paid(a, 'b2', 'y')).toBeCloseTo(400);
    expect(paid(a, 'b1', 'y')).toBeCloseTo(0);
  });

  it('never puts more on a bill than it is for; the excess goes to the next oldest', () => {
    const a = attribute([bill('b1', 100, 's1', '2026-06-01'), bill('b2', 900, 's2', '2026-06-05')], [repay('r1', 'x', 500, [{ billKey: 'expense:b1', amount: 500 }])]);
    expect(paid(a, 'b1', 'x')).toBe(100);
    expect(paid(a, 'b2', 'x')).toBeCloseTo(400);
  });

  it('ignores a ticked bill that no longer exists, treating that money as untagged', () => {
    const a = attribute([bill('b1', 400, 's1')], [repay('r1', 'x', 300, [{ billKey: 'expense:gone', amount: 300 }])]);
    expect(paid(a, 'b1', 'x')).toBeCloseTo(300);
  });

  it('counts a labour bill alongside expenses', () => {
    const labour: Labour = {
      id: 'l1', date: '2026-06-12', targetType: 'single', fieldId: 'f1', seasonId: 's1', workersCount: 4, wageRate: 300,
      totalCost: 1200, paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
    } as Labour;
    const a = attribute([bill('b1', 800, 's1')], [repay('r1', 'x', 1200, [{ billKey: 'labour:l1', amount: 1200 }])], [labour]);
    expect(a.attribution.get('labour:l1')?.get('x')).toBe(1200);
    expect(paid(a, 'b1', 'x')).toBe(0);
  });

  it('reports what is still owed on each bill', () => {
    const a = attribute([bill('b1', 400, 's1'), bill('b2', 600, 's2')], [repay('r1', 'x', 400, [{ billKey: 'expense:b1', amount: 400 }])]);
    expect(billOutstanding(a.bills[0], a.attribution)).toBe(0);
    expect(billOutstanding(a.bills[1], a.attribution)).toBe(600);
  });

  it('places every rupee that fits, and never more on a bill than it is for', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 500_000 }).map(c => c / 100), { minLength: 1, maxLength: 6 }),
        fc.array(
          fc.record({
            member: fc.constantFrom('x', 'y'),
            amount: fc.integer({ min: 100, max: 300_000 }).map(c => c / 100),
            ticks: fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 3 }),
          }),
          { maxLength: 8 }
        ),
        (amounts, payments) => {
          const expenses = amounts.map((amt, i) => bill(`b${i}`, amt, i % 2 ? 's2' : 's1', `2026-06-${10 + i}`));
          const repayments = payments.map((p, i) =>
            repay(`r${i}`, p.member, p.amount, p.ticks.map(t => ({ billKey: `expense:b${t}`, amount: p.amount })))
          );
          const { bills, attribution } = attribute(expenses, repayments);
          bills.forEach(b => expect(paidOnBill(attribution, b.key)).toBeLessThanOrEqual(b.amount + 1e-6));
          const placed = bills.reduce((sum, b) => sum + paidOnBill(attribution, b.key), 0);
          const repaid = repayments.reduce((sum, r) => sum + r.amount, 0);
          const billed = bills.reduce((sum, b) => sum + b.amount, 0);
          expect(placed).toBeCloseTo(Math.min(repaid, billed), 6);
        }
      )
    );
  });
});

describe('paying a creditor before the bills exist', () => {
  const advance = [repay('r1', 'x', 3000, undefined, '2026-02-01')];

  it('keeps the advance out of every bill while there are none', () => {
    const { bills, attribution } = attribute([], advance);
    expect(bills).toEqual([]);
    expect(attribution.size).toBe(0);
  });

  it('puts it on a bill added later, but never past what that bill costs', () => {
    const a = attribute([bill('mar', 1000, 's1', '2026-03-01')], advance);
    expect(paid(a, 'mar', 'x')).toBe(1000);
    expect(billOutstanding(a.bills[0], a.attribution)).toBe(0);
  });

  it('settles the oldest bills added later first', () => {
    const a = attribute([bill('mar', 1000, 's1', '2026-03-01'), bill('apr', 5000, 's2', '2026-04-01')], advance);
    expect(paid(a, 'mar', 'x')).toBe(1000);
    expect(paid(a, 'apr', 'x')).toBe(2000);
    expect(billOutstanding(a.bills[0], a.attribution)).toBe(0);
  });

  it('can be pointed at specific bills afterwards by editing the payment', () => {
    const edited = [repay('r1', 'x', 3000, [{ billKey: 'expense:mar', amount: 1000 }, { billKey: 'expense:apr', amount: 2000 }], '2026-02-01')];
    const a = attribute([bill('mar', 1000, 's1', '2026-03-01'), bill('apr', 5000, 's2', '2026-04-01')], edited);
    expect(paid(a, 'mar', 'x')).toBe(1000);
    expect(paid(a, 'apr', 'x')).toBe(2000);
  });

  it('does not credit a partner in the ledger for more than a cycle cost', () => {
    const summary = buildSettlementLedger(
      [field('f1')], [season('s1', 'f1')], members, [bill('mar', 1000, 's1', '2026-03-01')], [], [], [], [], [], ['s1'], [creditor], advance
    );
    const statement = summary.ledgers[0].statements.find(st => st.memberId === 'x')!;
    expect(statement.paidAmount).toBe(1000);
  });
});

describe('allocateToBills', () => {
  const bills = creditBills('c1', [bill('b1', 400, 's1', '2026-06-01'), bill('b2', 600, 's2', '2026-06-05'), bill('b3', 500, 's1', '2026-06-09')], []);
  const owed = (key: string) => bills.find(b => b.key === key)!.amount;

  it('fills the ticked bills oldest first, each up to what it owes', () => {
    const r = allocateToBills(700, ['expense:b3', 'expense:b1', 'expense:b2'], bills, owed);
    expect(r.allocations).toEqual([
      { billKey: 'expense:b1', amount: 400 },
      { billKey: 'expense:b2', amount: 300 },
    ]);
    expect(r.leftover).toBe(0);
  });

  it('leaves what the ticked bills cannot take', () => {
    const r = allocateToBills(1000, ['expense:b1'], bills, owed);
    expect(r.allocations).toEqual([{ billKey: 'expense:b1', amount: 400 }]);
    expect(r.leftover).toBe(600);
  });

  it('allocates nothing when nothing is ticked', () => {
    expect(allocateToBills(500, [], bills, owed)).toEqual({ allocations: [], leftover: 500 });
  });
});

describe('settlement ledger with ticked bills', () => {
  const fields = [field('f1'), field('f2')];
  const seasons = [season('s1', 'f1'), season('s2', 'f2')];
  const expenses = [bill('b1', 400, 's1', '2026-06-01'), bill('b2', 600, 's2', '2026-06-05')];
  const fundedIn = (seasonId: string, repayments: CreditRepayment[]) => {
    const summary = buildSettlementLedger(fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], [creditor], repayments);
    return summary.ledgers.find(l => l.seasonId === seasonId)!.statements.find(s => s.memberId === 'x')!.paidAmount;
  };

  it('credits the cycle of the bill the payment was ticked against', () => {
    const tagged = [repay('r1', 'x', 300, [{ billKey: 'expense:b2', amount: 300 }])];
    expect(fundedIn('s2', tagged)).toBe(300);
    expect(fundedIn('s1', tagged)).toBe(0);
  });

  it('credits the oldest bill\u2019s cycle first for a payment that ticked nothing', () => {
    const untagged = [repay('r1', 'x', 300)];
    expect(fundedIn('s1', untagged)).toBe(300);
    expect(fundedIn('s2', untagged)).toBe(0);
    expect(fundedIn('s2', [repay('r1', 'x', 700)])).toBe(300);
  });
});

describe('sheet round trip', () => {
  it('keeps the bills a repayment was ticked against', async () => {
    const { SHEET_COLUMNS, toSheetRows, parseSheetRows } = await import('../src/utils/googleSheets');
    const rep = repay('r1', 'x', 700, [{ billKey: 'expense:b1', amount: 400 }, { billKey: 'labour:l9', amount: 300 }]);

    const [back] = parseSheetRows<CreditRepayment>(toSheetRows([rep], SHEET_COLUMNS.creditRepayments));
    expect(back.billAllocations).toEqual(rep.billAllocations);
    expect(back.amount).toBe(700);
  });

  it('reads a repayment from a sheet that has no such column yet', async () => {
    const { parseSheetRows } = await import('../src/utils/googleSheets');
    const oldSheet = [
      ['id', 'creditAccountId', 'memberId', 'amount', 'date', 'notes'],
      ['r1', 'c1', 'x', 300, '2026-07-01', ''],
    ];
    const [rep] = parseSheetRows<CreditRepayment>(oldSheet);
    expect(rep.amount).toBe(300);
    expect(rep.billAllocations).toBeUndefined();
  });

  it('treats an edit to the ticked bills as a change, so it syncs', async () => {
    const { countUnsyncedChanges, makeSyncFingerprint } = await import('../src/utils/syncConflict');
    const base: any = {
      members: [], fields: [], seasons: [], activities: [], expenses: [], labours: [], stockItems: [], purchases: [],
      usages: [], revenues: [], auditLogs: [], settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: true },
      creditRepayments: [repay('r1', 'x', 300)],
    };
    const edited = { ...base, creditRepayments: [repay('r1', 'x', 300, [{ billKey: 'expense:b1', amount: 300 }])] };
    expect(countUnsyncedChanges(edited, makeSyncFingerprint(base))).toBe(1);
  });
});

describe('a bill paid by more than one partner', () => {
  const jointlyPaid = [
    repay('rx', 'x', 600, [{ billKey: 'expense:b1', amount: 600 }], '2026-06-20'),
    repay('ry', 'y', 400, [{ billKey: 'expense:b1', amount: 400 }], '2026-06-25'),
  ];
  const twoBills = [bill('b1', 1000, 's1', '2026-06-01'), bill('b2', 500, 's2', '2026-06-05')];

  it('keeps what each partner paid towards it', () => {
    const a = attribute(twoBills, jointlyPaid);
    expect(paid(a, 'b1', 'x')).toBe(600);
    expect(paid(a, 'b1', 'y')).toBe(400);
    expect(billOutstanding(a.bills[0], a.attribution)).toBe(0);
    expect(paid(a, 'b2', 'x') + paid(a, 'b2', 'y')).toBe(0);
  });

  it('credits each partner for their own share in the cycle ledger', () => {
    const summary = buildSettlementLedger(
      [field('f1'), field('f2')], [season('s1', 'f1'), season('s2', 'f2')], members, twoBills, [], [], [], [], [],
      ['s1', 's2'], [creditor], jointlyPaid
    );
    const s1 = summary.ledgers.find(l => l.seasonId === 's1')!;
    expect(s1.statements.find(st => st.memberId === 'x')!.paidAmount).toBe(600);
    expect(s1.statements.find(st => st.memberId === 'y')!.paidAmount).toBe(400);
  });

  it('gives the later payer only what is left when both ticked more than the bill needs', () => {
    // Both tick the ₹1,000 bill with ₹700. X is first and fills ₹700; Y's
    // ₹700 can only put ₹300 there, and the other ₹400 goes to the next bill.
    const a = attribute(twoBills, [
      repay('rx', 'x', 700, [{ billKey: 'expense:b1', amount: 700 }], '2026-06-20'),
      repay('ry', 'y', 700, [{ billKey: 'expense:b1', amount: 700 }], '2026-06-25'),
    ]);
    expect(paid(a, 'b1', 'x')).toBe(700);
    expect(paid(a, 'b1', 'y')).toBe(300);
    expect(paid(a, 'b2', 'y')).toBe(400);
  });

  it('is split fairly when the bill also takes an untagged payment from a third party', () => {
    const a = attribute(twoBills, [
      jointlyPaid[0],
      repay('ry', 'y', 700, undefined, '2026-06-25'), // nothing ticked: oldest first
    ]);
    expect(paid(a, 'b1', 'x')).toBe(600);
    expect(paid(a, 'b1', 'y')).toBe(400); // finishes the bill
    expect(paid(a, 'b2', 'y')).toBe(300); // the rest moves on
  });
});

describe('advancesByPartner', () => {
  it('is each partner’s payments to creditors that no bill has claimed', async () => {
    const { advancesByPartner } = await import('../src/utils/creditBills');
    const { total, byMember } = advancesByPartner([], [], [repay('r1', 'x', 3000), repay('r2', 'y', 1000)]);
    expect(total).toBe(4000);
    expect(byMember.get('x')).toBe(3000);
    expect(byMember.get('y')).toBe(1000);
  });

  it('shrinks as bills are added, oldest payment first, and disappears once covered', async () => {
    const { advancesByPartner } = await import('../src/utils/creditBills');
    const payments = [repay('r1', 'x', 3000, undefined, '2026-02-01'), repay('r2', 'y', 1000, undefined, '2026-02-10')];

    const partly = advancesByPartner([bill('b1', 3500, 's1', '2026-03-01')], [], payments);
    expect(partly.byMember.get('x') ?? 0).toBe(0); // x's earlier payment went first
    expect(partly.byMember.get('y')).toBeCloseTo(500);
    expect(partly.total).toBeCloseTo(500);

    const covered = advancesByPartner([bill('b1', 4000, 's1', '2026-03-01')], [], payments);
    expect(covered.total).toBe(0);
  });

  it('counts the part of an over-ticked payment that no bill can take', async () => {
    const { advancesByPartner } = await import('../src/utils/creditBills');
    const { byMember } = advancesByPartner(
      [bill('b1', 1000, 's1')], [],
      [repay('r1', 'x', 1800, [{ billKey: 'expense:b1', amount: 1800 }])]
    );
    expect(byMember.get('x')).toBeCloseTo(800);
  });

  it('is nothing when every payment sits on a bill', async () => {
    const { advancesByPartner } = await import('../src/utils/creditBills');
    expect(advancesByPartner([bill('b1', 1000, 's1')], [], [repay('r1', 'x', 1000)]).total).toBe(0);
  });
});
