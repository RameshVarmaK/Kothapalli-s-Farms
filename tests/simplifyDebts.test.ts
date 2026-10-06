import { describe, it, expect } from 'vitest';
import { simplifyDebts } from '../src/utils/calculations';

describe('simplifyDebts', () => {
  it('pairs the biggest debtor with the biggest creditor across three partners', () => {
    const debts = simplifyDebts([
      { memberId: 'a', name: 'Anil', balance: 300 },
      { memberId: 'b', name: 'Bala', balance: -100 },
      { memberId: 'c', name: 'Chandu', balance: -200 },
    ]);
    expect(debts).toEqual([
      { fromId: 'c', fromName: 'Chandu', toId: 'a', toName: 'Anil', amount: 200 },
      { fromId: 'b', fromName: 'Bala', toId: 'a', toName: 'Anil', amount: 100 },
    ]);
  });

  it('ignores balances within 0.01 of zero', () => {
    expect(simplifyDebts([
      { memberId: 'a', name: 'Anil', balance: 0.01 },
      { memberId: 'b', name: 'Bala', balance: -0.01 },
    ])).toEqual([]);

    // A residue of 0.01 left after the first pairing is not settled.
    const debts = simplifyDebts([
      { memberId: 'a', name: 'Anil', balance: 100.01 },
      { memberId: 'b', name: 'Bala', balance: -100 },
    ]);
    expect(debts).toEqual([
      { fromId: 'b', fromName: 'Bala', toId: 'a', toName: 'Anil', amount: 100 },
    ]);
  });

  it('rounds each transfer to 2 decimals', () => {
    const debts = simplifyDebts([
      { memberId: 'a', name: 'Anil', balance: 33.336 },
      { memberId: 'b', name: 'Bala', balance: -33.334 },
    ]);
    expect(debts).toHaveLength(1);
    expect(debts[0].amount).toBe(33.33);
  });

  it('does not mutate the input positions', () => {
    const positions = [
      { memberId: 'a', name: 'Anil', balance: 300 },
      { memberId: 'b', name: 'Bala', balance: -100 },
      { memberId: 'c', name: 'Chandu', balance: -200 },
    ];
    const before = JSON.parse(JSON.stringify(positions));
    simplifyDebts(positions);
    expect(positions).toEqual(before);
  });
});
