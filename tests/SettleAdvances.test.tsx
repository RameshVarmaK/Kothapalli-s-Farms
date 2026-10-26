import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SettleTab } from '../src/components/SettleTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import type { CreditAccount, CreditRepayment, Expense } from '../src/types';

afterEach(() => cleanup());

const members = [{ id: 'm1', name: 'Ramesh ' }, { id: 'm2', name: 'Ganapathi' }];
const fields = [{ id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] }];
const seasons = [{ id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false }];
const creditAccounts: CreditAccount[] = [{ id: 'c1', name: 'Tractor Co', type: 'Other' }];
const advance = (id: string, memberId: string, amount: number): CreditRepayment =>
  ({ id, creditAccountId: 'c1', memberId, amount, date: '2026-05-01' });

function renderSettle(creditRepayments: CreditRepayment[], expenses: Expense[] = []) {
  render(
    <LanguageProvider>
      <SettleTab
        fields={fields} seasons={seasons as any} members={members} expenses={expenses} labours={[]} revenues={[]}
        usages={[]} stockItems={[]} purchases={[]} currency="₹" creditAccounts={creditAccounts}
        creditRepayments={creditRepayments}
      />
    </LanguageProvider>
  );
}
const section = () => screen.queryByText('Advances paid, not yet on any bill')?.closest('div.bg-white') as HTMLElement | null;

describe('Settle tab: advances paid to creditors', () => {
  it('lists each partner’s advance and the total', () => {
    renderSettle([advance('r1', 'm1', 3000), advance('r2', 'm2', 1000)]);
    const box = within(section()!);
    expect(box.getByText('Ramesh')).toBeTruthy();
    expect(box.getByText('₹3,000')).toBeTruthy();
    expect(box.getByText('Ganapathi')).toBeTruthy();
    expect(box.getByText('₹1,000')).toBeTruthy();
    expect(box.getByText('₹4,000')).toBeTruthy(); // total
    expect(screen.getByText(/added to the right cycles by itself/)).toBeTruthy();
  });

  it('shows only what a later bill has not yet absorbed', () => {
    const bill: Expense = {
      id: 'b1', date: '2026-06-10', amount: 2500, paidByMemberId: '', category: 'Diesel', targetType: 'single',
      targetFieldId: 'f1', targetSeasonId: 's1', isCredit: true, creditAccountId: 'c1',
    };
    renderSettle([advance('r1', 'm1', 3000)], [bill]);
    expect(within(section()!).getAllByText('₹500').length).toBeGreaterThan(0);
  });

  it('is absent when there are no advances', () => {
    renderSettle([]);
    expect(screen.queryByText("Advances paid, not yet on any bill")).toBeNull();
  });
});
