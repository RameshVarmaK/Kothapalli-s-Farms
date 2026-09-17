import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeasonReportModal } from '../src/components/members/SeasonReportModal';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, StockItem, StockPurchase, StockUsage } from '../src/types';

const fields: Field[] = [
  { id: 'f1', name: 'North Field', area: 5, shares: [{ memberId: 'm1', percentage: 100 }] },
];
const seasons: Season[] = [
  { id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: false },
];
// weightedAverageCost is a derived field: it's always 0 on the raw StockItem
// record (only ever set to 0 at creation, see StockTab.tsx) and is recomputed
// on the fly by computeStockLevels() from the purchase/usage ledger.
const stockItems: StockItem[] = [
  {
    id: 'stk1',
    name: 'NPK Fertilizer',
    type: 'Fertilizer',
    unit: 'kg',
    quantityOnHand: 0,
    weightedAverageCost: 0,
    totalCostSpent: 0,
    fundingByMember: {},
  },
];
const purchases: StockPurchase[] = [
  { id: 'pur1', stockItemId: 'stk1', quantity: 100, totalCost: 2000, date: '2024-01-01', paidByMemberId: 'm1' },
];
const usages: StockUsage[] = [
  {
    id: 'use1',
    stockItemId: 'stk1',
    quantityUsed: 5,
    date: '2024-02-01',
    targetType: 'single',
    targetFieldId: 'f1',
    targetSeasonId: 's1',
  },
];

function renderReport() {
  return render(
    <LanguageProvider>
      <SeasonReportModal
        seasonId="s1"
        onClose={vi.fn()}
        seasons={seasons}
        fields={fields}
        expenses={[]}
        labours={[]}
        revenues={[]}
        usages={usages}
        stockItems={stockItems}
        purchases={purchases}
        activities={[]}
        members={[]}
        currency="₹"
        copiedReportText={false}
        setCopiedReportText={vi.fn()}
      />
    </LanguageProvider>
  );
}

describe('SeasonReportModal - Stock Materials Consumed line items', () => {
  it('shows the real weighted-average cost per line, not ₹0', () => {
    // Regression test: Section 3 used to look up the raw `stockItems` prop
    // for weightedAverageCost, which is always 0 there (only computeStockLevels
    // derives the real rate from the purchase/usage ledger). Every consumed-
    // material line rendered "@ ₹0 = ₹0" even though the report's own total
    // further up the page (which does use computeStockLevels) was correct.
    renderReport();

    // Purchase: 100kg for ₹2000 -> weighted-average cost = ₹20/kg.
    // Usage: 5kg -> cost = ₹100.
    expect(screen.getByText(/5 kg @ ₹20 = ₹100/)).toBeTruthy();
    expect(screen.queryByText(/@ ₹0 = ₹0/)).toBeNull();
  });
});
