import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CreditsTab } from '../src/components/CreditsTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import type { CreditAccount, CreditRepayment, Expense } from '../src/types';

afterEach(() => cleanup());

const members = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Ganapathi' }];
const creditAccounts: CreditAccount[] = [{ id: 'c1', name: 'Palem labour', type: 'Labour' }];
const bill = (id: string, category: string, amount: number, date: string): Expense => ({
  id, date, amount, paidByMemberId: '', category, targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
  isCredit: true, creditAccountId: 'c1',
});
const expenses = [bill('b1', 'Weeding', 400, '2026-06-01'), bill('b2', 'Transplanting', 600, '2026-06-05')];

function setup(creditRepayments: CreditRepayment[] = []) {
  const onAdd = vi.fn();
  const onUpdate = vi.fn();
  render(
    <LanguageProvider>
      <CreditsTab
        creditAccounts={creditAccounts}
        creditRepayments={creditRepayments}
        expenses={expenses}
        labours={[]}
        members={members}
        seasons={[{ id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false }]}
        fields={[{ id: 'f1', name: 'North', area: 2, shares: [] }]}
        currency="₹"
        onAddCreditAccount={vi.fn()}
        onEditCreditAccount={vi.fn()}
        onAddCreditRepayment={onAdd}
        onUpdateCreditRepayment={onUpdate}
        onDeleteCreditAccount={vi.fn()}
        onDeleteCreditRepayment={vi.fn()}
      />
    </LanguageProvider>
  );
  return { onAdd, onUpdate };
}

const openPaymentForm = () => fireEvent.click(screen.getByText('Record Part Payment'));
const amountField = () => screen.getByPlaceholderText('Enter amount...') as HTMLInputElement;

describe('Credits tab: choosing which bills a payment settles', () => {
  it('lists the unpaid bills with what each still owes', () => {
    setup();
    openPaymentForm();
    const form = screen.getByRole('dialog');
    expect(within(form).getByLabelText(/Weeding/)).toBeTruthy();
    expect(within(form).getByText('₹400 due')).toBeTruthy();
    expect(within(form).getByText('₹600 due')).toBeTruthy();
  });

  it('stores the ticked bill and how much of the payment goes to it', () => {
    const { onAdd } = setup();
    openPaymentForm();
    fireEvent.click(screen.getByLabelText(/Transplanting/));
    fireEvent.change(amountField(), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Record Repayment'));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].billAllocations).toEqual([{ billKey: 'expense:b2', amount: 500 }]);
    expect(onAdd.mock.calls[0][0].amount).toBe(500);
  });

  it('fills the oldest ticked bill first and carries the rest to the next', () => {
    const { onAdd } = setup();
    openPaymentForm();
    fireEvent.click(screen.getByLabelText(/Transplanting/));
    fireEvent.click(screen.getByLabelText(/Weeding/));
    fireEvent.change(amountField(), { target: { value: '700' } });
    fireEvent.click(screen.getByText('Record Repayment'));

    expect(onAdd.mock.calls[0][0].billAllocations).toEqual([
      { billKey: 'expense:b1', amount: 400 },
      { billKey: 'expense:b2', amount: 300 },
    ]);
  });

  it('records no bills when none is ticked, leaving the payment spread over the account', () => {
    const { onAdd } = setup();
    openPaymentForm();
    fireEvent.change(amountField(), { target: { value: '300' } });
    fireEvent.click(screen.getByText('Record Repayment'));

    expect(onAdd.mock.calls[0][0].billAllocations).toBeUndefined();
  });

  it('offers to pay the full amount due on the ticked bills', () => {
    const { onAdd } = setup();
    openPaymentForm();
    fireEvent.click(screen.getByLabelText(/Weeding/));
    fireEvent.click(screen.getByText(/Pay the full ₹400 due on the ticked bills/));
    expect(amountField().value).toBe('400');
    fireEvent.click(screen.getByText('Record Repayment'));
    expect(onAdd.mock.calls[0][0].billAllocations).toEqual([{ billKey: 'expense:b1', amount: 400 }]);
  });

  it('warns when the payment is more than the ticked bills owe', () => {
    setup();
    openPaymentForm();
    fireEvent.click(screen.getByLabelText(/Weeding/));
    fireEvent.change(amountField(), { target: { value: '1000' } });
    expect(screen.getByText(/₹600 is more than the ticked bills owe/)).toBeTruthy();
  });

  it('stops offering a bill once it is settled', () => {
    setup([{
      id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 400, date: '2026-06-20',
      billAllocations: [{ billKey: 'expense:b1', amount: 400 }],
    }]);
    openPaymentForm();
    const form = screen.getByRole('dialog');
    expect(within(form).queryByLabelText(/Weeding/)).toBeNull();
    expect(within(form).getByLabelText(/Transplanting/)).toBeTruthy();
  });

  it('shows each bill’s standing and who paid it', () => {
    setup([{
      id: 'r1', creditAccountId: 'c1', memberId: 'm2', amount: 400, date: '2026-06-20',
      billAllocations: [{ billKey: 'expense:b1', amount: 400 }],
    }]);
    expect(screen.getByText('Settled')).toBeTruthy();
    expect(screen.getByText(/Paid by Ganapathi ₹400/)).toBeTruthy();
    expect(screen.getByText('₹600 due')).toBeTruthy();
  });

  it('reopens an edited payment with its bills ticked, and can change them', () => {
    const { onUpdate } = setup([{
      id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 400, date: '2026-06-20',
      billAllocations: [{ billKey: 'expense:b1', amount: 400 }],
    }]);
    fireEvent.click(screen.getAllByTitle('Edit payment record')[0]);
    const form = screen.getByRole('dialog');
    expect((within(form).getByLabelText(/Weeding/) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(form).getByLabelText(/Weeding/)); // untick
    fireEvent.click(within(form).getByText('Save Changes'));
    expect(onUpdate.mock.calls[0][0].billAllocations).toBeUndefined();
  });
});

describe('Credits tab: paying a creditor ahead of the bills', () => {
  const advance: CreditRepayment[] = [{ id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 1500, date: '2026-05-01' }];

  it('shows an overpaid creditor as an advance, not a negative balance', () => {
    const onlyOne = [expenses[0]]; // 400 of bills against 1,500 paid
    render(
      <LanguageProvider>
        <CreditsTab
          creditAccounts={creditAccounts} creditRepayments={advance} expenses={onlyOne} labours={[]} members={members}
          seasons={[]} fields={[]} currency="₹"
          onAddCreditAccount={vi.fn()} onEditCreditAccount={vi.fn()} onAddCreditRepayment={vi.fn()}
          onUpdateCreditRepayment={vi.fn()} onDeleteCreditAccount={vi.fn()} onDeleteCreditRepayment={vi.fn()}
        />
      </LanguageProvider>
    );
    expect(screen.getAllByText('Advance paid').length).toBeGreaterThan(0);
    expect(screen.getByText('Paid ahead of the bills. It goes onto bills as they are added.')).toBeTruthy();
    expect(screen.queryByText(/-/, { selector: 'p.text-sm' })).toBeNull();
  });
});

describe('Credits tab: a bill paid by several partners', () => {
  it('shows every partner who paid it, with their amounts', () => {
    setup([
      { id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 250, date: '2026-06-20', billAllocations: [{ billKey: 'expense:b1', amount: 250 }] },
      { id: 'r2', creditAccountId: 'c1', memberId: 'm2', amount: 150, date: '2026-06-22', billAllocations: [{ billKey: 'expense:b1', amount: 150 }] },
    ]);
    expect(screen.getByText('Settled')).toBeTruthy();
    expect(screen.getByText('Paid by Ramesh ₹250, Ganapathi ₹150')).toBeTruthy();
  });

  it('lets a second partner pay what is left of a part-paid bill', () => {
    const { onAdd } = setup([
      { id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 250, date: '2026-06-20', billAllocations: [{ billKey: 'expense:b1', amount: 250 }] },
    ]);
    openPaymentForm();
    const form = screen.getByRole('dialog');
    expect(within(form).getByText('₹150 due')).toBeTruthy(); // Weeding: 400 less Ramesh's 250
    fireEvent.change(within(form).getByLabelText(/Paid By/), { target: { value: 'm2' } });
    fireEvent.click(within(form).getByLabelText(/Weeding/));
    fireEvent.click(within(form).getByText(/Pay the full ₹150 due/));
    fireEvent.click(within(form).getByText('Record Repayment'));

    expect(onAdd.mock.calls[0][0]).toMatchObject({ memberId: 'm2', amount: 150, billAllocations: [{ billKey: 'expense:b1', amount: 150 }] });
  });

  it('shows payments made before any bill exists as an advance that will go onto bills', () => {
    const paidWithNoBills: CreditRepayment[] = [{ id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 1500, date: '2026-05-01' }];
    render(
      <LanguageProvider>
        <CreditsTab
          creditAccounts={creditAccounts} creditRepayments={paidWithNoBills} expenses={[]} labours={[]} members={members}
          seasons={[]} fields={[]} currency="₹"
          onAddCreditAccount={vi.fn()} onEditCreditAccount={vi.fn()} onAddCreditRepayment={vi.fn()}
          onUpdateCreditRepayment={vi.fn()} onDeleteCreditAccount={vi.fn()} onDeleteCreditRepayment={vi.fn()}
        />
      </LanguageProvider>
    );
    expect(screen.getAllByText('Advance paid').length).toBeGreaterThan(0);
    expect(screen.getByText('Paid ahead of the bills. It goes onto bills as they are added.')).toBeTruthy();
  });
});
