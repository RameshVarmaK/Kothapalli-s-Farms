import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyTab } from '../src/components/MoneyTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, Member } from '../src/types';

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
function renderMoneyTab(seasons: Season[], onAddExpense = vi.fn()) {
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
        onEditExpense={vi.fn()}
        onDeleteExpense={vi.fn()}
        onAddLabour={vi.fn()}
        onEditLabour={vi.fn()}
        onDeleteLabour={vi.fn()}
        onAddRevenue={vi.fn()}
        onEditRevenue={vi.fn()}
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
