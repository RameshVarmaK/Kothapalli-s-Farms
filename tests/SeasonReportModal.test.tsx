import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SeasonReportModal } from '../src/components/members/SeasonReportModal';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, StockItem, StockPurchase, StockUsage, Member, Expense, HarvestRevenue, FieldSeasonLedger } from '../src/types';
import { buildSettlementLedger } from '../src/utils/calculations';

afterEach(() => cleanup());

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

function renderReport(overrides: Record<string, any> = {}) {
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
        {...overrides}
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


// ---- Section 6: per-partner contributions -------------------------------

const partners: Member[] = [
  { id: 'm1', name: 'Ramesh' },
  { id: 'm2', name: 'Shyam' },
];
const sharedField: Field[] = [
  { id: 'f1', name: 'North Field', area: 5, shares: [
    { memberId: 'm1', percentage: 70 },
    { memberId: 'm2', percentage: 30 },
  ] },
];
const partnerExpenses: Expense[] = [
  { id: 'e1', date: '2024-02-01', amount: 5000, paidByMemberId: 'm1', category: 'Seeds',
    targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e2', date: '2024-02-02', amount: 1500, paidByMemberId: 'm2', category: 'Spray',
    targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
];
const partnerRevenues: HarvestRevenue[] = [
  { id: 'rv1', date: '2024-06-01', fieldId: 'f1', seasonId: 's1', crop: 'Rice',
    quantity: 40, saleAmount: 12000, receivedByMemberId: 'm2' },
];

/** The real engine, so the test can't pass against a hand-made ledger that
 * the app would never produce. */
function realLedger(): FieldSeasonLedger {
  const summary = buildSettlementLedger(
    sharedField, seasons, partners, partnerExpenses, [], partnerRevenues,
    [], [], [], ['s1'], [], []
  );
  return summary.ledgers.find(l => l.seasonId === 's1')!;
}

function renderWithPartners() {
  return renderReport({
    fields: sharedField,
    members: partners,
    expenses: partnerExpenses,
    revenues: partnerRevenues,
    usages: [],
    stockItems: [],
    purchases: [],
    ledger: realLedger(),
  });
}

describe('SeasonReportModal - Section 6: Partner Contributions', () => {
  it('is omitted entirely when no ledger is supplied', () => {
    // Callers that predate this section must keep working unchanged.
    renderReport();
    expect(screen.queryByText(/Partner Contributions/)).toBeNull();
  });

  it('lists each partner with their share', () => {
    renderWithPartners();
    expect(screen.getByText(/Partner Contributions/)).toBeTruthy();
    expect(screen.getByText('Ramesh')).toBeTruthy();
    expect(screen.getByText('Shyam')).toBeTruthy();
    expect(screen.getByText(/70%/)).toBeTruthy();
    expect(screen.getByText(/30%/)).toBeTruthy();
  });

  it('shows what each partner paid against their share of the cost', () => {
    // Cost = 5000 + 1500 = 6500. Ramesh paid 5000, his 70% share is 4550,
    // so he funded 450 more than his share.
    renderWithPartners();
    expect(screen.getAllByText('₹5,000').length).toBeGreaterThan(0);
    expect(screen.getByText('₹4,550')).toBeTruthy();
    expect(screen.getByText('+₹450')).toBeTruthy();
  });

  it('shows revenue taken against share of revenue', () => {
    // Revenue 12000 all collected by Shyam; his 30% share is 3600, so he has
    // taken 8400 more than his share.
    renderWithPartners();
    expect(screen.getByText('₹3,600')).toBeTruthy();
    expect(screen.getByText('-₹8,400')).toBeTruthy();
  });

  it('reconciles the two gaps to the net position the Settle screen shows', () => {
    const ledger = realLedger();
    renderWithPartners();

    ledger.statements.forEach(stmt => {
      const ratio = (stmt.sharePercentage || 0) / 100;
      const costGap = stmt.paidAmount - ratio * ledger.totalExpense;
      const revenueGap = ratio * ledger.totalRevenue - stmt.receivedAmount;
      expect(Math.abs(costGap + revenueGap - stmt.netPosition)).toBeLessThan(0.01);
    });
  });

  it('balances: what partners paid in equals the cycle cost', () => {
    const ledger = realLedger();
    const totalPaid = ledger.statements.reduce((s, st) => s + st.paidAmount, 0);
    expect(Math.abs(totalPaid - ledger.totalExpense)).toBeLessThan(0.01);

    renderWithPartners();
    // The "All partners" footer proves it on screen.
    expect(screen.getByText('All partners')).toBeTruthy();
  });

  it('leaves out a partner with no share and no activity in this cycle', () => {
    const idle: Member[] = [...partners, { id: 'm3', name: 'Lakshmi' }];
    const summary = buildSettlementLedger(
      sharedField, seasons, idle, partnerExpenses, [], partnerRevenues,
      [], [], [], ['s1'], [], []
    );
    renderReport({
      fields: sharedField,
      members: idle,
      expenses: partnerExpenses,
      revenues: partnerRevenues,
      usages: [],
      stockItems: [],
      purchases: [],
      ledger: summary.ledgers.find(l => l.seasonId === 's1')!,
    });

    expect(screen.getByText('Ramesh')).toBeTruthy();
    expect(screen.queryByText('Lakshmi')).toBeNull();
  });
});

describe('SeasonReportModal - Save as PDF', () => {
  it('offers a Save as PDF action', () => {
    renderReport();
    expect(screen.getByText('Save as PDF')).toBeTruthy();
  });

  it('opens the browser print dialog, which is where Save as PDF lives', () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderReport();

    fireEvent.click(screen.getByText('Save as PDF'));

    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('flags the document while open so the print sheet can hide the rest of the app', () => {
    // Without this the printed page carries the modal's dark backdrop and
    // whatever tab was open behind it.
    expect(document.body.classList.contains('report-print-open')).toBe(false);
    renderReport();
    expect(document.body.classList.contains('report-print-open')).toBe(true);
  });

  it('clears the flag when the report closes, so other pages print normally', () => {
    const { unmount } = renderReport();
    expect(document.body.classList.contains('report-print-open')).toBe(true);

    unmount();
    expect(document.body.classList.contains('report-print-open')).toBe(false);
  });

  it('sets no flag when there is no report to show', () => {
    renderReport({ seasonId: null });
    expect(document.body.classList.contains('report-print-open')).toBe(false);
  });

  it('renders outside the app tree so one print rule can hide its siblings', () => {
    const { container } = renderReport();
    // Portalled to <body>: nothing lands in the render container.
    expect(container.querySelector('[data-print-root]')).toBeNull();
    expect(document.body.querySelector('[data-print-root]')).toBeTruthy();
  });

  it('marks the chrome that must not appear on paper', () => {
    renderReport();
    const root = document.body.querySelector('[data-print-root]')!;
    // Footer buttons and the close X.
    expect(root.querySelectorAll('[data-print-hide]').length).toBeGreaterThanOrEqual(2);
    // The inner scroller has to expand, or printing clips to one screen.
    expect(root.querySelector('[data-print-scroll]')).toBeTruthy();
    expect(root.querySelector('[data-print-card]')).toBeTruthy();
  });

  it('keeps each section whole across page breaks', () => {
    renderWithPartners();
    const keeps = document.body.querySelectorAll('[data-print-keep]');
    expect(keeps.length).toBeGreaterThan(5);
  });
});

describe('SeasonReportModal - print without partnership details', () => {
  const toggle = () => screen.getByLabelText('Include partner shares & settlement');

  it('includes partnership details by default', () => {
    renderWithPartners();
    expect((toggle() as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Partner Contributions/)).toBeTruthy();
    expect(screen.queryByText(/Spending by Partner/)).toBeNull();
  });

  it('shows only who spent how much when switched off', () => {
    // Ramesh paid 5000, Shyam 1500; shares (70/30), fair shares and the
    // settlement must all disappear.
    renderWithPartners();
    fireEvent.click(toggle());
    expect(screen.getByText(/Spending by Partner/)).toBeTruthy();
    expect(screen.queryByText(/Partner Contributions/)).toBeNull();
    expect(screen.queryByText(/70%/)).toBeNull();
    expect(screen.queryByText(/Share of cost/)).toBeNull();
    expect(screen.queryByText(/Receives|Pays/)).toBeNull();
    const section = screen.getByText(/Spending by Partner/).closest('div[data-print-keep]')!;
    expect(section.textContent).toContain('Ramesh');
    expect(section.textContent).toContain('₹5,000');
    expect(section.textContent).toContain('Shyam');
    expect(section.textContent).toContain('₹1,500');
    expect(section.textContent).toContain('₹6,500');
  });

  it('keeps partnership terms out of the copied text report too', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithPartners();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByText('Export & Copy Report'));
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('SPENDING BY PARTNER');
    expect(text).toContain('Ramesh: ₹5,000');
    expect(text).not.toContain('NET POSITION');
    expect(text).not.toContain('% share');
  });

  it('does not offer the switch when there are no partner figures', () => {
    renderReport();
    expect(screen.queryByLabelText('Include partner shares & settlement')).toBeNull();
  });
});
