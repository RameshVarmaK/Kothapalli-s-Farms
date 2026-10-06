import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyTab } from '../src/components/MoneyTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, Member, Expense } from '../src/types';

const fields: Field[] = [
  { id: 'f1', name: 'North Field', area: 5, shares: [{ memberId: 'm1', percentage: 100 }] },
];
const members: Member[] = [{ id: 'm1', name: 'Ramesh' }];

// NOTE: do not assert on a bare <select>'s DOM `.value` here. When a controlled
// select's `value` prop doesn't match any of its own <option>s, the browser (and
// happy-dom) silently renders/reports the first option anyway — so reading
// `.value` off the DOM node can't tell a real selection apart from the
// desynced-state bug this suite exists to catch. Only submitting the form and
// checking what the component's own state actually produced is a valid check.
// The save handlers return whether the parent accepted the record; the
// components gate their success toast on it. `vi.fn()` alone returns
// undefined, which correctly reads as a rejection — so mocks here must say
// they accepted.
function renderMoneyTab(seasons: Season[], onAddExpense = vi.fn((_expense: Expense) => true)) {
  render(
    <LanguageProvider>
      <MoneyTab
        expenses={[]}
        labours={[]}
        revenues={[]}
        fields={fields}
        seasons={seasons}
        members={members}
        activities={[]}
        currency="₹"
        creditAccounts={[]}
        onAddExpense={onAddExpense}
        onEditExpense={vi.fn(() => true)}
        onDeleteExpense={vi.fn()}
        onAddLabour={vi.fn(() => true)}
        onEditLabour={vi.fn(() => true)}
        onDeleteLabour={vi.fn()}
        onAddRevenue={vi.fn(() => true)}
        onEditRevenue={vi.fn(() => true)}
        onDeleteRevenue={vi.fn()}
      />
    </LanguageProvider>
  );
  return onAddExpense;
}

function submitNewExpense(amount: string, category: string) {
  fireEvent.click(screen.getByText('+ New Entry'));
  fireEvent.change(screen.getByPlaceholderText('e.g. 5000'), { target: { value: amount } });
  fireEvent.change(screen.getByPlaceholderText('e.g. Fertilizer batch / Engine repair'), {
    target: { value: category },
  });
  const form = screen.getByPlaceholderText('e.g. 5000').closest('form')!;
  fireEvent.submit(form);
}

describe('MoneyTab - Add Expense crop-cycle default', () => {
  it('submits successfully against the only season even when it is closed', () => {
    // Regression test: opening "New Entry" used to default selectedSeasonId from
    // activeSeasons[0] only. When every season was closed (including a season
    // wrongly marked closed by the Sheets-boolean bug), activeSeasons was empty,
    // so selectedSeasonId stayed '' — a value not present in the <select>'s own
    // option list. Submitting then failed with "Pick a crop cycle" even though a
    // crop cycle was visibly shown as selected in the dropdown.
    const seasons: Season[] = [
      { id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: true, endDate: '2024-06-01' },
    ];
    const onAddExpense = renderMoneyTab(seasons);

    submitNewExpense('500', 'Seeds');

    expect(screen.queryByText(/Pick a crop cycle/i)).toBeNull();
    expect(onAddExpense).toHaveBeenCalledTimes(1);
    expect(onAddExpense.mock.calls[0][0].targetSeasonId).toBe('s1');
  });

  it('shows a success toast instead of just closing the dialog silently', () => {
    const seasons: Season[] = [
      { id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: false },
    ];
    renderMoneyTab(seasons);

    submitNewExpense('500', 'Seeds');

    expect(screen.getByText('Expense saved')).toBeTruthy();
  });

  it('submits against the active season when both an active and a closed season exist', () => {
    const seasons: Season[] = [
      { id: 's1', fieldId: 'f1', cropName: 'Wheat', startDate: '2023-01-01', isClosed: true, endDate: '2023-06-01' },
      { id: 's2', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: false },
    ];
    const onAddExpense = renderMoneyTab(seasons);

    submitNewExpense('500', 'Seeds');

    expect(screen.queryByText(/Pick a crop cycle/i)).toBeNull();
    expect(onAddExpense).toHaveBeenCalledTimes(1);
    expect(onAddExpense.mock.calls[0][0].targetSeasonId).toBe('s2');
  });
});

describe('MoneyTab - a rejected entry must not look saved', () => {
  // Regression: the form called the parent's save handler, then announced
  // success and closed itself without ever looking at the result. The parent
  // rejects entries the form can't catch — allocations that don't sum to the
  // amount, for one — so "Expense saved" appeared over an entry that was
  // never stored, and the form threw away what the user had typed.

  const openSeason: Season[] = [
    { id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: false },
  ];

  it('shows no success toast when the parent rejects the expense', () => {
    renderMoneyTab(openSeason, vi.fn(() => false));

    submitNewExpense('500', 'Seeds');

    expect(screen.queryByText('Expense saved')).toBeNull();
  });

  it('keeps the form open so the entry can be corrected and retried', () => {
    renderMoneyTab(openSeason, vi.fn(() => false));

    submitNewExpense('500', 'Seeds');

    // The amount field still exists, and still holds what was typed.
    const amountField = screen.getByPlaceholderText('e.g. 5000') as HTMLInputElement;
    expect(amountField).toBeTruthy();
    expect(amountField.value).toBe('500');
  });

  it('still announces success and closes when the parent accepts', () => {
    renderMoneyTab(openSeason, vi.fn(() => true));

    submitNewExpense('500', 'Seeds');

    expect(screen.getByText('Expense saved')).toBeTruthy();
    expect(screen.queryByPlaceholderText('e.g. 5000')).toBeNull();
  });

  it('lets a retry succeed after the first attempt was rejected', () => {
    const onAddExpense = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderMoneyTab(openSeason, onAddExpense);

    submitNewExpense('500', 'Seeds');
    expect(screen.queryByText('Expense saved')).toBeNull();

    // The form is still open holding the data, so resubmitting is all it takes.
    const form = screen.getByPlaceholderText('e.g. 5000').closest('form')!;
    fireEvent.submit(form);

    expect(onAddExpense).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Expense saved')).toBeTruthy();
  });
});

describe('MoneyTab - Log Farm Labour description', () => {
  const seasons: Season[] = [{ id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: false }];

  function renderForLabour(labours: any[] = []) {
    const onAddLabour = vi.fn((_l: any) => true);
    const onEditLabour = vi.fn((_l: any) => true);
    render(
      <LanguageProvider>
        <MoneyTab
          expenses={[]}
          labours={labours}
          revenues={[]}
          fields={fields}
          seasons={seasons}
          members={members}
          activities={[]}
          currency="₹"
          creditAccounts={[]}
          onAddExpense={vi.fn(() => true)}
          onEditExpense={vi.fn(() => true)}
          onDeleteExpense={vi.fn()}
          onAddLabour={onAddLabour}
          onEditLabour={onEditLabour}
          onDeleteLabour={vi.fn()}
          onAddRevenue={vi.fn(() => true)}
          onEditRevenue={vi.fn(() => true)}
          onDeleteRevenue={vi.fn()}
        />
      </LanguageProvider>
    );
    return { onAddLabour, onEditLabour };
  }

  function fillLabour(description: string) {
    fireEvent.click(screen.getByText('+ New Entry'));
    fireEvent.click(screen.getByText('Log Farm Labour'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 10'), { target: { value: '4' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 400'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Work done *'), { target: { value: description } });
    fireEvent.submit(screen.getByLabelText('Work done *').closest('form')!);
  }

  it('saves what work was done with the labour cost', () => {
    const { onAddLabour } = renderForLabour();
    fillLabour('  Weeding and transplanting  ');
    expect(onAddLabour).toHaveBeenCalledTimes(1);
    expect(onAddLabour.mock.calls[0][0].description).toBe('Weeding and transplanting');
    expect(onAddLabour.mock.calls[0][0].totalCost).toBe(2000);
  });

  it('refuses to save without a description', () => {
    const { onAddLabour } = renderForLabour();
    fillLabour('   ');
    expect(onAddLabour).not.toHaveBeenCalled();
    expect(screen.getByText('Describe the work that was done before saving.')).toBeTruthy();
  });

  it('shows the description in the transactions list', () => {
    renderForLabour([
      { id: 'lab1', date: '2024-02-01', fieldId: 'f1', seasonId: 's1', targetType: 'single', description: 'Spraying pesticide', workersCount: 2, wageRate: 400, totalCost: 800, paidByMemberId: 'm1' },
    ]);
    expect(screen.getByText(/Spraying pesticide/)).toBeTruthy();
  });
});
