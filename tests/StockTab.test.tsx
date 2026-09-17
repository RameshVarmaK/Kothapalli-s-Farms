import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StockTab } from '../src/components/StockTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, Member, StockItem, StockPurchase } from '../src/types';

const fields: Field[] = [
  { id: 'f1', name: 'North Field', area: 5, shares: [{ memberId: 'm1', percentage: 100 }] },
];
const members: Member[] = [{ id: 'm1', name: 'Ramesh' }];
const stockItems: StockItem[] = [
  {
    id: 'stk1',
    name: 'NPK Fertilizer',
    type: 'Fertilizer',
    unit: 'kg',
    quantityOnHand: 100,
    weightedAverageCost: 20,
    totalCostSpent: 2000,
    fundingByMember: {},
  },
];
// computeStockLevels derives quantity on hand from the purchase/usage ledger, not
// from StockItem.quantityOnHand directly — a purchase record is required so the
// usage form's "insufficient stock" guard doesn't mask the crop-cycle behavior
// this test actually targets.
const purchases: StockPurchase[] = [
  { id: 'pur1', stockItemId: 'stk1', quantity: 100, totalCost: 2000, date: '2024-01-01', paidByMemberId: 'm1' },
];

// NOTE: do not assert on a bare <select>'s DOM `.value` here — see MoneyTab.test.tsx
// for why that check can't distinguish a real selection from the desynced-state bug.
// Submitting the form and checking what the component actually sent is the only
// reliable check.
function renderStockTab(seasons: Season[], onAddUsage = vi.fn()) {
  render(
    <LanguageProvider>
      <StockTab
        stockItems={stockItems}
        purchases={purchases}
        usages={[]}
        fields={fields}
        seasons={seasons}
        members={members}
        activities={[]}
        currency="₹"
        onAddStockItem={vi.fn()}
        onUpdateStockItem={vi.fn()}
        onAddPurchase={vi.fn()}
        onUpdatePurchase={vi.fn()}
        onAddUsage={onAddUsage}
        onUpdateUsage={vi.fn()}
      />
    </LanguageProvider>
  );
  return onAddUsage;
}

describe('StockTab - Log Field Usage crop-cycle default', () => {
  it('submits successfully against the only season even when it is closed', () => {
    // Regression test: same bug class as MoneyTab's "Pick a crop cycle" issue.
    // Both StockTab's "Record Ledger" button and StockEntryModal's "Log Field
    // Usage" tab switch used to default usageSeasonId from activeSeasons[0]
    // only, which is empty when every season is closed — leaving component
    // state out of sync with the <select>'s own option list (which lists ALL
    // seasons). Saving used to silently no-op (`if (!s) return;`).
    const seasons: Season[] = [
      { id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: true, endDate: '2024-06-01' },
    ];
    const onAddUsage = renderStockTab(seasons);

    fireEvent.click(screen.getByText('Record Ledger'));
    fireEvent.click(screen.getByText('Log Field Usage (Expense)'));
    fireEvent.change(screen.getByPlaceholderText('Input qty'), { target: { value: '5' } });

    const form = screen.getByPlaceholderText('Input qty').closest('form')!;
    fireEvent.submit(form);

    expect(screen.queryByText(/Pick a crop cycle/i)).toBeNull();
    expect(onAddUsage).toHaveBeenCalledTimes(1);
    expect(onAddUsage.mock.calls[0][0].targetSeasonId).toBe('s1');
  });
});
