import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { moneyEntryRejection } from '../src/utils/validation';
import { Expense, Labour, HarvestRevenue } from '../src/types';

/**
 * Editing a money entry must refuse whatever adding it would refuse.
 *
 * The decision lives in moneyEntryRejection, tested directly below. That
 * the app's edit handlers actually ask it is checked against
 * src/app/ledgerActions.ts as source, where AppShell's handlers live.
 */
const actionsSource = readFileSync(resolve(__dirname, '../src/app/ledgerActions.ts'), 'utf8');

const expense: Expense = {
  id: 'exp1',
  date: '2024-01-15',
  amount: 1000,
  paidByMemberId: 'm1',
  category: 'Seeds',
  targetType: 'single',
  targetFieldId: 'f1',
  targetSeasonId: 's1'
};

const labour: Labour = {
  id: 'lab1',
  date: '2024-01-15',
  fieldId: 'f1',
  seasonId: 's1',
  description: 'Weeding',
  workersCount: 5,
  wageRate: 200,
  totalCost: 1000,
  paidByMemberId: 'm1'
};

const revenue: HarvestRevenue = {
  id: 'rev1',
  date: '2024-06-15',
  fieldId: 'f1',
  seasonId: 's1',
  crop: 'Rice',
  quantity: 100,
  saleAmount: 50000,
  receivedByMemberId: 'm1'
};

describe('moneyEntryRejection', () => {
  it('lets valid entries through', () => {
    expect(moneyEntryRejection({ kind: 'expense', record: expense })).toBeNull();
    expect(moneyEntryRejection({ kind: 'labour', record: labour })).toBeNull();
    expect(moneyEntryRejection({ kind: 'revenue', record: revenue })).toBeNull();
  });

  it('refuses an expense edited to amount 0 and no payer', () => {
    const rejection = moneyEntryRejection({
      kind: 'expense',
      record: { ...expense, amount: 0, paidByMemberId: '' }
    });
    expect(rejection?.title).toBe('Invalid Expense');
    expect(rejection?.logEvent).toBe('expense_validation_failed');
    expect(rejection?.message).toContain('greater than 0');
    expect(rejection?.message).toContain('Member who paid is required');
  });

  it('refuses a legacy labour entry saved without a description of the work', () => {
    const { description: _omitted, ...legacy } = labour;
    const rejection = moneyEntryRejection({ kind: 'labour', record: legacy as Labour });
    expect(rejection?.title).toBe('Invalid Labour Entry');
    expect(rejection?.logEvent).toBe('labour_validation_failed');
    expect(rejection?.message).toBe('Describe the work that was done');
  });

  it('refuses a revenue edited to no crop and no receiver', () => {
    const rejection = moneyEntryRejection({
      kind: 'revenue',
      record: { ...revenue, crop: ' ', receivedByMemberId: '' }
    });
    expect(rejection?.title).toBe('Invalid Revenue Entry');
    expect(rejection?.logEvent).toBe('revenue_validation_failed');
    expect(rejection?.message).toContain('Crop name is required');
    expect(rejection?.message).toContain('Member who received payment is required');
  });
});

describe('App edit handlers', () => {
  const handlerBody = (name: string): string => {
    const start = actionsSource.indexOf(`const ${name} = (`);
    expect(start).toBeGreaterThan(-1);
    const end = actionsSource.indexOf('\n  };\n', start);
    return actionsSource.slice(start, end);
  };

  for (const [handler, kind, record] of [
    ['handleEditExpense', 'expense', 'updatedExp'],
    ['handleEditLabour', 'labour', 'updatedLab'],
    ['handleEditRevenue', 'revenue', 'updatedRev']
  ]) {
    it(`${handler} refuses an invalid ${kind} before saving it`, () => {
      const body = handlerBody(handler);
      const guard = body.indexOf(
        `if (refuseInvalidMoneyEntry({ kind: '${kind}', record: ${record} })) return false;`
      );
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(body.indexOf('setDb('));
    });
  }
});
