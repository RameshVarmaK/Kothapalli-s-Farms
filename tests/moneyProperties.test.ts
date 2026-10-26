import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateAllocations, simplifyDebts, buildSettlementLedger } from '../src/utils/calculations';
import type { Expense, Field, HarvestRevenue, Member, Season } from '../src/types';

/**
 * Property tests for the money math. The example tests pin known cases; these
 * hunt for the odd amount / split-count combinations nobody thought to write
 * down, since a cent that goes missing here shows up as a partner owing the
 * wrong sum.
 */

const cents = (min = 0, max = 100_000_000) => fc.integer({ min, max }).map(c => c / 100);
const targets = (n: number, areas: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ fieldId: `f${i}`, seasonId: `s${i}`, fieldArea: areas[i] ?? 1 }));
const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

describe('calculateAllocations', () => {
  it('equal split always adds up to the amount, to the cent', () => {
    fc.assert(
      fc.property(cents(), fc.integer({ min: 1, max: 40 }), (amount, n) => {
        const out = calculateAllocations(amount, 'equal', targets(n));
        expect(Math.abs(sum(out) - amount)).toBeLessThan(0.005);
      })
    );
  });

  it('area split always adds up to the amount, to the cent', () => {
    fc.assert(
      fc.property(
        cents(),
        fc.array(fc.integer({ min: 1, max: 100_000 }).map(a => a / 100), { minLength: 1, maxLength: 20 }),
        (amount, areas) => {
          const out = calculateAllocations(amount, 'area', targets(areas.length, areas));
          expect(Math.abs(sum(out) - amount)).toBeLessThan(0.005);
        }
      )
    );
  });

  it('never hands anyone a negative share of a positive amount', () => {
    fc.assert(
      fc.property(
        cents(),
        fc.array(fc.integer({ min: 1, max: 100_000 }).map(a => a / 100), { minLength: 1, maxLength: 20 }),
        fc.constantFrom('equal', 'area') as fc.Arbitrary<'equal' | 'area'>,
        (amount, areas, rule) => {
          const out = calculateAllocations(amount, rule, targets(areas.length, areas));
          for (const a of out) expect(a.amount).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it('keeps one allocation per target, in order', () => {
    fc.assert(
      fc.property(cents(), fc.integer({ min: 1, max: 30 }), (amount, n) => {
        const out = calculateAllocations(amount, 'equal', targets(n));
        expect(out.map(a => a.seasonId)).toEqual(targets(n).map(t => t.seasonId));
      })
    );
  });
});

describe('simplifyDebts', () => {
  it('moves exactly what is owed: paying every debt zeroes every balance', () => {
    fc.assert(
      fc.property(fc.array(cents(-5_000_000, 5_000_000), { minLength: 2, maxLength: 8 }), raw => {
        // Make the positions net to zero, as a real ledger does.
        const total = raw.reduce((s, x) => s + x, 0);
        const balances = [...raw.slice(0, -1), Number((raw[raw.length - 1] - total).toFixed(2))];
        const positions = balances.map((balance, i) => ({ memberId: `m${i}`, name: `M${i}`, balance }));
        const net = Object.fromEntries(positions.map(p => [p.memberId, p.balance]));

        for (const d of simplifyDebts(positions)) {
          expect(d.amount).toBeGreaterThan(0);
          net[d.fromId] += d.amount;
          net[d.toId] -= d.amount;
        }
        for (const left of Object.values(net)) expect(Math.abs(left)).toBeLessThanOrEqual(0.02);
      })
    );
  });

  it('needs at most one fewer transfer than there are people with a balance', () => {
    fc.assert(
      fc.property(fc.array(cents(-5_000_000, 5_000_000), { minLength: 2, maxLength: 8 }), raw => {
        const total = raw.reduce((s, x) => s + x, 0);
        const balances = [...raw.slice(0, -1), Number((raw[raw.length - 1] - total).toFixed(2))];
        const positions = balances.map((balance, i) => ({ memberId: `m${i}`, name: `M${i}`, balance }));
        const open = positions.filter(p => Math.abs(p.balance) > 0.01).length;
        expect(simplifyDebts(positions).length).toBeLessThanOrEqual(Math.max(open - 1, 0));
      })
    );
  });
});

describe('buildSettlementLedger', () => {
  const memberIds = ['m1', 'm2', 'm3'];
  const members: Member[] = memberIds.map(id => ({ id, name: id }));
  const season: Season = { id: 's1', fieldId: 'f1', cropName: 'Corn', startDate: '2025-01-01', isClosed: false };

  const split = fc
    .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }))
    .map(([a, b]) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return [lo, hi - lo, 100 - hi];
    });

  it('partner positions always net to zero, whoever paid and whatever the shares', () => {
    fc.assert(
      fc.property(
        split,
        fc.array(fc.record({ amount: cents(1, 5_000_000), payer: fc.constantFrom(...memberIds) }), { maxLength: 15 }),
        fc.array(fc.record({ amount: cents(1, 5_000_000), receiver: fc.constantFrom(...memberIds) }), { maxLength: 6 }),
        (pcts, spend, sales) => {
          const field: Field = {
            id: 'f1',
            name: 'Plot',
            area: 2,
            shares: memberIds.map((id, i) => ({ memberId: id, percentage: pcts[i] })),
          };
          const expenses: Expense[] = spend.map((e, i) => ({
            id: `e${i}`, date: '2025-01-05', amount: e.amount, paidByMemberId: e.payer,
            category: 'Inputs', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
          }));
          const revenues: HarvestRevenue[] = sales.map((r, i) => ({
            id: `r${i}`, date: '2025-06-01', fieldId: 'f1', seasonId: 's1', crop: 'Corn',
            quantity: 1, saleAmount: r.amount, receivedByMemberId: r.receiver,
          }));

          const summary = buildSettlementLedger([field], [season], members, expenses, [], revenues, [], [], [], ['s1'], [], []);
          const net = Object.values(summary.membersTotalStatements).reduce((s, m) => s + m.netPosition, 0);
          expect(Math.abs(net)).toBeLessThan(0.05);
          expect(summary.isBalanced).toBe(true);
        }
      )
    );
  });
});
