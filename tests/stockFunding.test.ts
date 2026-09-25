import { describe, it, expect } from 'vitest';
import { computeStockLevels, splitStockCostByFunder } from '../src/utils/calculations';
import { StockItem, StockPurchase } from '../src/types';

const item: StockItem = {
  id: 'stock_urea',
  name: 'Urea',
  type: 'Fertilizer',
  unit: 'kg',
  quantityOnHand: 0,
  weightedAverageCost: 0,
  totalCostSpent: 0,
  fundingByMember: {}
};

const purchase = (over: Partial<StockPurchase>): StockPurchase => ({
  id: 'p1',
  stockItemId: 'stock_urea',
  quantity: 100,
  totalCost: 10000,
  date: '2026-06-01',
  paidByMemberId: 'mem_x',
  ...over
});

describe('stock funding', () => {
  it('credits the whole consumed cost to the sole cash funder', () => {
    // X buys the stock, field A later consumes half of it.
    const [computed] = computeStockLevels([item], [purchase({})], []);

    expect(computed.fundingByMember).toEqual({ mem_x: 10000 });

    const consumedCost = 50 * computed.weightedAverageCost;
    const { shares, onCredit } = splitStockCostByFunder(computed, consumedCost);

    expect(shares).toEqual([{ memberId: 'mem_x', amount: 5000 }]);
    expect(onCredit).toBe(0);
  });

  it('splits a consumed cost by each member share of the pool', () => {
    const [computed] = computeStockLevels(
      [item],
      [
        purchase({ id: 'p1', paidByMemberId: 'mem_x', totalCost: 2500, quantity: 25 }),
        purchase({ id: 'p2', paidByMemberId: 'mem_y', totalCost: 7500, quantity: 75, date: '2026-06-05' })
      ],
      []
    );

    const { shares } = splitStockCostByFunder(computed, 1000);
    const byMember = Object.fromEntries(shares.map(s => [s.memberId, s.amount]));

    // Pooled, not lot-by-lot: 25% / 75% of every consumption.
    expect(byMember.mem_x).toBeCloseTo(250, 6);
    expect(byMember.mem_y).toBeCloseTo(750, 6);
  });

  it('does not credit a member for a purchase made on credit', () => {
    // Regression test: a credit purchase was counted as that member's own
    // contribution, so they were paid once as funder and again when their
    // repayment to the creditor was attributed.
    const [computed] = computeStockLevels(
      [item],
      [purchase({ isCredit: true, creditAccountId: 'cred_1' })],
      []
    );

    expect(computed.fundingByMember).toEqual({});
    // The cost is still real and still raises the item's value.
    expect(computed.totalCostSpent).toBe(10000);

    const { shares, onCredit } = splitStockCostByFunder(computed, 4000);

    expect(shares).toEqual([]);
    expect(onCredit).toBe(4000);
  });

  it('attributes only the cash-funded portion when a pool mixes cash and credit', () => {
    const [computed] = computeStockLevels(
      [item],
      [
        purchase({ id: 'p1', paidByMemberId: 'mem_x', totalCost: 6000, quantity: 60 }),
        purchase({ id: 'p2', paidByMemberId: 'mem_y', totalCost: 4000, quantity: 40, date: '2026-06-05', isCredit: true })
      ],
      []
    );

    const { shares, onCredit } = splitStockCostByFunder(computed, 1000);

    expect(shares).toEqual([{ memberId: 'mem_x', amount: 600 }]);
    expect(onCredit).toBe(400);
  });

  it('returns nothing for an unknown item or a zero cost', () => {
    expect(splitStockCostByFunder(undefined, 500)).toEqual({ shares: [], onCredit: 0 });
    expect(splitStockCostByFunder(item, 0)).toEqual({ shares: [], onCredit: 0 });
  });
});
