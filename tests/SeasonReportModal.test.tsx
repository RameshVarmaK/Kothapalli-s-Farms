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

// Partnership terms are opt-in; `partnership: true` ticks the switch.
function renderWithPartners({ partnership = false } = {}) {
  const result = renderReport({
    fields: sharedField,
    members: partners,
    expenses: partnerExpenses,
    revenues: partnerRevenues,
    usages: [],
    stockItems: [],
    purchases: [],
    ledger: realLedger(),
  });
  if (partnership) fireEvent.click(screen.getByLabelText('Include partner shares & settlement'));
  return result;
}

describe('SeasonReportModal - Section 6: Partner Contributions', () => {
  it('is omitted entirely when no ledger is supplied', () => {
    // Callers that predate this section must keep working unchanged.
    renderReport();
    expect(screen.queryByText(/Partner Contributions/)).toBeNull();
  });

  it('lists each partner with their share', () => {
    renderWithPartners({ partnership: true });
    expect(screen.getByText(/Partner Contributions/)).toBeTruthy();
    expect(screen.getByText('Ramesh')).toBeTruthy();
    expect(screen.getByText('Shyam')).toBeTruthy();
    expect(screen.getByText(/70%/)).toBeTruthy();
    expect(screen.getByText(/30%/)).toBeTruthy();
  });

  it('shows what each partner paid against their share of the cost', () => {
    // Cost = 5000 + 1500 = 6500. Ramesh paid 5000, his 70% share is 4550,
    // so he funded 450 more than his share.
    renderWithPartners({ partnership: true });
    expect(screen.getAllByText('₹5,000').length).toBeGreaterThan(0);
    expect(screen.getByText('₹4,550')).toBeTruthy();
    expect(screen.getByText('+₹450')).toBeTruthy();
  });

  it('shows revenue taken against share of revenue', () => {
    // Revenue 12000 all collected by Shyam; his 30% share is 3600, so he has
    // taken 8400 more than his share.
    renderWithPartners({ partnership: true });
    expect(screen.getByText('₹3,600')).toBeTruthy();
    expect(screen.getByText('-₹8,400')).toBeTruthy();
  });

  it('reconciles the two gaps to the net position the Settle screen shows', () => {
    const ledger = realLedger();
    renderWithPartners({ partnership: true });

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

    renderWithPartners({ partnership: true });
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

  it('leaves partnership details out by default', () => {
    renderWithPartners();
    expect((toggle() as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Spending by Partner/)).toBeTruthy();
    expect(screen.queryByText(/Partner Contributions/)).toBeNull();
  });

  it('adds them back when ticked', () => {
    renderWithPartners();
    fireEvent.click(toggle());
    expect(screen.getByText(/Partner Contributions/)).toBeTruthy();
    expect(screen.queryByText(/Spending by Partner/)).toBeNull();
  });

  it('shows only who spent how much', () => {
    // Ramesh paid 5000, Shyam 1500; shares (70/30), fair shares and the
    // settlement must all be absent.
    renderWithPartners();
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
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithPartners();
    fireEvent.click(screen.getByText('Export & Copy Report'));
    const text = writeText.mock.calls[0][0];
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

describe('SeasonReportModal - credit and shared-cost lines', () => {
  const members: Member[] = [
    { id: 'm1', name: 'Ramesh' },
    { id: 'm2', name: 'Ganapathi' },
  ];
  const twoSeasons: Season[] = [
    ...seasons,
    { id: 's2', fieldId: 'f1', cropName: 'Maize', startDate: '2024-01-01', isClosed: false },
  ];
  const creditAccounts = [{ id: 'c1', name: 'Palem labour', type: 'Labour Union' }] as any[];

  const labourOnCredit = {
    id: 'lab1', date: '2024-03-01', targetType: 'single', fieldId: 'f1', seasonId: 's1',
    description: 'Weeding', workersCount: 8, wageRate: 300, totalCost: 2400,
    paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
  } as any;

  it('names the partners who repaid a fully settled creditor account', () => {
    renderReport({
      members, creditAccounts, labours: [labourOnCredit],
      creditRepayments: [
        { id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 1000, date: '2024-03-10' },
        { id: 'r2', creditAccountId: 'c1', memberId: 'm2', amount: 1400, date: '2024-03-12' },
      ],
    });

    expect(screen.getByText(/bill fully repaid · repaid by Ramesh ₹1,000, Ganapathi ₹1,400/)).toBeTruthy();
  });

  it('says who has repaid so far while the bill still owes', () => {
    renderReport({
      members, creditAccounts, labours: [labourOnCredit],
      creditRepayments: [{ id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 1000, date: '2024-03-10' }],
    });

    expect(screen.getByText(/bill still owes ₹1,400 · repaid by Ramesh ₹1,000/)).toBeTruthy();
  });

  it('shows only a line\u2019s own portion of what was repaid on an account with many bills', () => {
    // The account carries this ₹2,400 bill plus a ₹7,600 one in another cycle
    // (₹10,000 in all), fully repaid by two partners at ₹5,000 each. Ramesh
    // paid first, which clears this older bill (₹2,400) and starts the next;
    // Ganapathi's payment finishes that one. So this line shows Ramesh's
    // ₹2,400, not the ₹5,000 he put into the account.
    const otherCycleBill = { ...labourOnCredit, id: 'lab2', seasonId: 's2', totalCost: 7600 };
    renderReport({
      members, seasons: twoSeasons, creditAccounts, labours: [labourOnCredit, otherCycleBill],
      creditRepayments: [
        { id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 5000, date: '2024-03-10' },
        { id: 'r2', creditAccountId: 'c1', memberId: 'm2', amount: 5000, date: '2024-03-12' },
      ],
    });

    expect(screen.getByText('bill fully repaid · repaid by Ramesh ₹2,400')).toBeTruthy();
    expect(screen.queryByText(/₹5,000/)).toBeNull();
  });

  it('apportions a split credit bill by the share this cycle carries', () => {
    // ₹2,400 split ₹600 here, ₹1,800 in another cycle, repaid in full by one
    // partner: this cycle's line shows the ₹600 they paid towards it.
    renderReport({
      members, seasons: twoSeasons, creditAccounts,
      labours: [{
        ...labourOnCredit, targetType: 'common', fieldId: undefined, seasonId: undefined,
        allocations: [
          { fieldId: 'f1', seasonId: 's1', amount: 600 },
          { fieldId: 'f1', seasonId: 's2', amount: 1800 },
        ],
      }],
      creditRepayments: [{ id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 2400, date: '2024-03-10' }],
    });

    expect(screen.getByText(/bill fully repaid · repaid by Ramesh ₹600/)).toBeTruthy();
  });

  it('keeps the plain wording when nothing has been repaid', () => {    renderReport({ members, creditAccounts, labours: [labourOnCredit] });
    expect(screen.getByText('bill still owes ₹2,400')).toBeTruthy();
  });

  it('shows the whole entry’s total beside this cycle’s share of a split cost', () => {
    renderReport({
      members, seasons: twoSeasons,
      expenses: [{
        id: 'e1', date: '2024-02-01', amount: 2400, paidByMemberId: 'm1', category: 'Tractor hire',
        targetType: 'common', commonAllocationRule: 'equal',
        allocations: [
          { fieldId: 'f1', seasonId: 's1', amount: 1200 },
          { fieldId: 'f1', seasonId: 's2', amount: 1200 },
        ],
      }],
    });

    expect(screen.getByText('Entry total ₹2,400 split across 2 crop cycles')).toBeTruthy();
  });

  it('shows no total note on an entry that was not split', () => {
    renderReport({
      members,
      expenses: [{
        id: 'e1', date: '2024-02-01', amount: 500, paidByMemberId: 'm1', category: 'Seed',
        targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1',
      }],
    });

    expect(screen.queryByText(/Entry total/)).toBeNull();
  });
});

describe('SeasonReportModal - credit bills a payment was ticked against', () => {
  const members: Member[] = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Ganapathi' }];
  const twoSeasons: Season[] = [
    ...seasons,
    { id: 's2', fieldId: 'f1', cropName: 'Maize', startDate: '2024-01-01', isClosed: false },
  ];
  const creditAccounts = [{ id: 'c1', name: 'Palem labour', type: 'Labour Union' }] as any[];
  const bill = (id: string, seasonId: string, totalCost: number) => ({
    id, date: '2024-03-01', targetType: 'single', fieldId: 'f1', seasonId, description: id,
    workersCount: 4, wageRate: 100, totalCost, paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
  }) as any;

  it('names exactly who paid this bill, and calls it settled on its own', () => {
    // Two bills on one account. Ramesh paid the first (this cycle's) in full;
    // nothing has gone towards the second, so the account itself still owes.
    renderReport({
      members, seasons: twoSeasons, creditAccounts,
      labours: [bill('first', 's1', 2400), bill('second', 's2', 3600)],
      creditRepayments: [{
        id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 2400, date: '2024-03-10',
        billAllocations: [{ billKey: 'labour:first', amount: 2400 }],
      }],
    });

    expect(screen.getByText('bill fully repaid · repaid by Ramesh ₹2,400')).toBeTruthy();
    expect(screen.queryByText(/account still owes/)).toBeNull();
  });

  it('shows what is still owed on a bill that was only part paid', () => {
    renderReport({
      members, creditAccounts, labours: [bill('first', 's1', 2400)],
      creditRepayments: [{
        id: 'r1', creditAccountId: 'c1', memberId: 'm2', amount: 1000, date: '2024-03-10',
        billAllocations: [{ billKey: 'labour:first', amount: 1000 }],
      }],
    });

    expect(screen.getByText('bill still owes ₹1,400 · repaid by Ganapathi ₹1,000')).toBeTruthy();
  });

  it('reports the bill, not the account, even where no payment was ticked', () => {
    renderReport({
      members, creditAccounts, labours: [bill('first', 's1', 2400)],
      creditRepayments: [{ id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 2400, date: '2024-03-10' }],
    });

    expect(screen.getByText('bill fully repaid · repaid by Ramesh ₹2,400')).toBeTruthy();
  });
});

describe('SeasonReportModal - a credit bill paid by several partners', () => {
  it('lists each partner with what they paid towards this bill', () => {
    const members: Member[] = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Ganapathi' }];
    renderReport({
      members,
      creditAccounts: [{ id: 'c1', name: 'Palem labour', type: 'Labour Union' }],
      labours: [{
        id: 'lab1', date: '2024-03-01', targetType: 'single', fieldId: 'f1', seasonId: 's1', description: 'Weeding',
        workersCount: 8, wageRate: 300, totalCost: 2400, paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
      }],
      creditRepayments: [
        { id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 1500, date: '2024-03-10', billAllocations: [{ billKey: 'labour:lab1', amount: 1500 }] },
        { id: 'r2', creditAccountId: 'c1', memberId: 'm2', amount: 900, date: '2024-03-12', billAllocations: [{ billKey: 'labour:lab1', amount: 900 }] },
      ],
    });

    expect(screen.getByText('bill fully repaid · repaid by Ramesh ₹1,500, Ganapathi ₹900')).toBeTruthy();
  });
});

describe('SeasonReportModal - credit lines speak about the bill, never the account balance', () => {
  const members: Member[] = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Ganapathi' }];
  const twoSeasons: Season[] = [
    ...seasons,
    { id: 's2', fieldId: 'f1', cropName: 'Maize', startDate: '2024-01-01', isClosed: false },
  ];
  const creditAccounts = [{ id: 'c1', name: 'Palem labour', type: 'Labour Union' }] as any[];
  const splitBill = {
    id: 'lab1', date: '2024-02-01', targetType: 'common', description: 'Weeding', workersCount: 3, wageRate: 300,
    totalCost: 900, paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
    allocations: [{ fieldId: 'f1', seasonId: 's1', amount: 400 }, { fieldId: 'f1', seasonId: 's2', amount: 500 }],
  } as any;

  it('says a split bill\u2019s cycle share is repaid even when the creditor is still owed a lot on other bills', () => {
    // The ₹900 bill is the oldest on the account and a ₹900 payment covers it;
    // the account also carries a big unpaid bill. The line must not mention
    // the account's ₹5,000 balance.
    const bigLaterBill = {
      id: 'lab2', date: '2024-03-01', targetType: 'single', fieldId: 'f1', seasonId: 's2', description: 'Harvest', workersCount: 20,
      wageRate: 300, totalCost: 5000, paidByMemberId: '', isCredit: true, creditAccountId: 'c1',
    } as any;
    renderReport({
      members, seasons: twoSeasons, creditAccounts, labours: [splitBill, bigLaterBill],
      creditRepayments: [{ id: 'r1', creditAccountId: 'c1', memberId: 'm1', amount: 900, date: '2024-02-10' }],
    });

    expect(screen.getByText('bill fully repaid · repaid by Ramesh ₹400')).toBeTruthy();
    expect(screen.queryByText(/account/i)).toBeNull();
    expect(screen.queryByText(/5,000/)).toBeNull();
  });

  it('scales what a part-repaid split bill still owes to the share the line shows', () => {
    renderReport({
      members, seasons: twoSeasons, creditAccounts, labours: [splitBill],
      creditRepayments: [{ id: 'r1', creditAccountId: 'c1', memberId: 'm2', amount: 450, date: '2024-02-10' }],
    });
    // Half of the ₹900 is repaid, so half of this cycle's ₹400 is still owed.
    expect(screen.getByText('bill still owes ₹200 · repaid by Ganapathi ₹200')).toBeTruthy();
  });
});
