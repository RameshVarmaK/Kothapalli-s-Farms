import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PartnerReportModal } from '../src/components/members/PartnerReportModal';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { buildSettlementLedger } from '../src/utils/calculations';
import { buildPartnerLedger } from '../src/utils/partnerLedger';

afterEach(() => {
  cleanup();
  document.body.classList.remove('report-print-open');
});

const members = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Suresh' }];
const fields: any[] = [
  { id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
  { id: 'f2', name: 'South', area: 1, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
];
const seasons: any[] = [
  { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false },
  { id: 's2', fieldId: 'f2', cropName: 'Cotton', startDate: '2026-06-01', isClosed: false },
];
const creditAccounts: any[] = [{ id: 'c1', name: 'Tractor Co', type: 'Other' }, { id: 'c2', name: 'Agro Store', type: 'Vendor' }];
const bill = (id: string, amount: number, seasonId: string, date: string, creditAccountId = 'c1'): any => ({
  id, date, amount, paidByMemberId: '', category: id, targetType: 'single',
  targetFieldId: seasonId === 's1' ? 'f1' : 'f2', targetSeasonId: seasonId, isCredit: true, creditAccountId,
});
const pay = (id: string, memberId: string, amount: number, date = '2026-07-01', creditAccountId = 'c1', billAllocations?: any[]): any =>
  ({ id, creditAccountId, memberId, amount, date, billAllocations });

function ledgerFor(memberId: string, scope: string[], expenses: any[], repayments: any[]) {
  const summary = buildSettlementLedger(fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], creditAccounts, repayments);
  const ledger = buildPartnerLedger({
    memberId, seasonIds: scope, summary, members, fields, seasons, expenses, labours: [], revenues: [],
    usages: [], stockItems: [], purchases: [], creditAccounts, creditRepayments: repayments,
  });
  return { ledger, summary };
}

describe('partner ledger: payments to creditors follow the same placement as the engine', () => {
  // Two bills on one creditor in different cycles; one payment that ticked nothing.
  const expenses = [bill('older', 400, 's1', '2026-06-10'), bill('newer', 600, 's2', '2026-06-20')];
  const payments = [pay('p1', 'm1', 300)];

  it('puts an unticked payment on the oldest bill, as the Settle tab does', () => {
    const { ledger } = ledgerFor('m1', ['s1', 's2'], expenses, payments);
    expect(ledger.creditPayments[0].countedInScope).toBeCloseTo(300);
    expect(ledgerFor('m1', ['s1'], expenses, payments).ledger.creditPayments[0].countedInScope).toBeCloseTo(300);
    expect(ledgerFor('m1', ['s2'], expenses, payments).ledger.creditPayments[0].countedInScope).toBeCloseTo(0);
  });

  it('adds up to the engine’s figure for the partner in every selection of cycles', () => {
    for (const scope of [['s1'], ['s2'], ['s1', 's2']]) {
      const { ledger, summary } = ledgerFor('m1', scope, expenses, payments);
      const fromLines = ledger.lines.filter(l => l.kind === 'credit-repayment').reduce((s, l) => s + l.paidIn, 0);
      const fromEngine = summary.ledgers
        .filter(l => scope.includes(l.seasonId))
        .reduce((s, l) => s + (l.statements.find(st => st.memberId === 'm1')?.paidBreakdown?.creditRepayments || 0), 0);
      expect(fromLines).toBeCloseTo(fromEngine, 2);
    }
  });

  it('follows the bills a payment was ticked against', () => {
    const ticked = [pay('p1', 'm1', 300, '2026-07-01', 'c1', [{ billKey: 'expense:newer', amount: 300 }])];
    expect(ledgerFor('m1', ['s2'], expenses, ticked).ledger.creditPayments[0].countedInScope).toBeCloseTo(300);
    expect(ledgerFor('m1', ['s1'], expenses, ticked).ledger.creditPayments[0].countedInScope).toBeCloseTo(0);
  });
});

describe('partner ledger: advances', () => {
  it('reports a payment made before any bill exists as an advance', () => {
    const { ledger } = ledgerFor('m1', ['s1', 's2'], [], [pay('p1', 'm1', 3000)]);
    expect(ledger.creditPayments[0].advance).toBe(3000);
    expect(ledger.advances.total).toBe(3000);
    expect(ledger.advances.byCreditor).toEqual([{ creditAccountId: 'c1', creditorName: 'Tractor Co', amount: 3000 }]);
    expect(ledger.lines.some(l => l.kind === 'credit-repayment')).toBe(false); // counts nowhere yet
  });

  it('shrinks to what a later bill has not absorbed, counting the rest in its cycle', () => {
    const { ledger } = ledgerFor('m1', ['s1'], [bill('b', 1000, 's1', '2026-08-01')], [pay('p1', 'm1', 3000)]);
    expect(ledger.creditPayments[0].countedInScope).toBeCloseTo(1000);
    expect(ledger.creditPayments[0].advance).toBeCloseTo(2000);
    expect(ledger.advances.total).toBeCloseTo(2000);
  });

  it('does not depend on which crop cycles are selected', () => {
    const repayments = [pay('p1', 'm1', 3000)];
    expect(ledgerFor('m1', ['s1'], [], repayments).ledger.advances.total).toBe(3000);
    expect(ledgerFor('m1', ['s2'], [], repayments).ledger.advances.total).toBe(3000);
  });

  it('groups a partner’s advances by creditor, and is empty once every payment is on a bill', () => {
    const many = ledgerFor('m1', ['s1'], [], [pay('p1', 'm1', 500), pay('p2', 'm1', 700, '2026-07-02', 'c2'), pay('p3', 'm1', 300)]).ledger;
    expect(many.advances.byCreditor.map(a => [a.creditorName, a.amount]).sort()).toEqual([['Agro Store', 700], ['Tractor Co', 800]]);

    const none = ledgerFor('m1', ['s1'], [bill('b', 500, 's1', '2026-08-01')], [pay('p1', 'm1', 500)]).ledger;
    expect(none.advances.total).toBe(0);
  });

  it('gives a later bill to the earliest payer, leaving the other partner’s payment as the advance', () => {
    const payments = [pay('early', 'm1', 1000, '2026-02-01'), pay('late', 'm2', 1000, '2026-03-01')];
    const expenses = [bill('b', 1000, 's1', '2026-08-01')];
    expect(ledgerFor('m1', ['s1'], expenses, payments).ledger.advances.total).toBe(0);
    expect(ledgerFor('m2', ['s1'], expenses, payments).ledger.advances.total).toBeCloseTo(1000);
  });
});

describe('partner ledger: one payment, shown once', () => {
  it('lists a payment as a "credit repaid" line for the part on bills and an "advance" line for the rest', () => {
    const { ledger } = ledgerFor('m1', ['s1'], [bill('b', 1000, 's1', '2026-08-01')], [pay('p1', 'm1', 3000)]);
    const lines = ledger.lines.filter(l => l.kind === 'credit-repayment' || l.kind === 'advance');
    expect(lines.map(l => [l.kind, Math.round(l.paidIn)])).toEqual([['credit-repayment', 1000], ['advance', 2000]]);
  });

  it('has the lines add up to Paid in plus the advances, so the report foots', () => {
    const { ledger } = ledgerFor('m1', ['s1', 's2'], [bill('b', 1000, 's1', '2026-08-01')], [pay('p1', 'm1', 3000), pay('p2', 'm1', 400, '2026-07-02', 'c2')]);
    const fromLines = ledger.lines.reduce((sum, l) => sum + l.paidIn, 0);
    expect(fromLines).toBeCloseTo(ledger.totals.paidIn + ledger.advances.total, 2);
    expect(ledger.advances.total).toBeCloseTo(2400);
  });

  it('carries the payment\u2019s note onto its lines', () => {
    const rep = { ...pay('p1', 'm1', 500), notes: 'Tractor repair' };
    const { ledger } = ledgerFor('m1', ['s1'], [], [rep]);
    expect(ledger.lines.find(l => l.kind === 'advance')?.note).toBe('Tractor repair');
  });
});

describe('PartnerReportModal: creditor payments and advances', () => {
  function renderReport(expenses: any[], repayments: any[], memberId = 'm1') {
    const summary = buildSettlementLedger(fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], creditAccounts, repayments);
    render(
      <LanguageProvider>
        <PartnerReportModal
          memberId={memberId} onClose={vi.fn()} summary={summary} members={members} fields={fields} seasons={seasons}
          expenses={expenses} labours={[]} revenues={[]} usages={[]} stockItems={[]} purchases={[]} currency="₹"
          creditAccounts={creditAccounts} creditRepayments={repayments}
        />
      </LanguageProvider>
    );
  }
  const paidInTile = () => screen.getAllByText('Paid in')[0].closest('div') as HTMLElement;
  const byKind = () => screen.getByText('Paid in, by kind').closest('div') as HTMLElement;

  it('counts advances in Paid in and in Paid in, by kind', () => {
    renderReport([], [pay('p1', 'm1', 3000), pay('p2', 'm1', 700, '2026-07-02', 'c2')]);
    expect(within(paidInTile()).getByText('₹3,700')).toBeTruthy();
    expect(within(paidInTile()).getByText(/incl\. ₹3,700 advances, not on any bill yet/)).toBeTruthy();
    expect(within(byKind()).getByText('Advances to creditors')).toBeTruthy();
    expect(within(byKind()).getByText('₹3,700')).toBeTruthy();
  });

  it('lists each payment once, as rows among the transactions, with its note', () => {
    renderReport([], [{ ...pay('p1', 'm1', 3000), notes: 'Part payment' }]);
    expect(screen.getAllByText('Advance')).toHaveLength(1); // the row's tag
    expect(screen.getByText('Tractor Co')).toBeTruthy();
    expect(screen.getAllByText('Part payment')).toHaveLength(1);
    expect(screen.getByText('Not on a bill yet')).toBeTruthy();
  });

  it('no longer has a separate section repeating the same payments', () => {
    renderReport([bill('b', 500, 's1', '2026-08-01')], [pay('p1', 'm1', 800)]);
    expect(screen.queryByText(/Payments to Creditors/)).toBeNull();
    expect(screen.queryByText('Advances paid, not yet on any bill')).toBeNull();
    expect(screen.getAllByText('Tractor Co')).toHaveLength(2); // its two rows, nothing more
  });

  it('splits one payment into the part on a bill and the advance', () => {
    renderReport([bill('b', 1000, 's1', '2026-08-01')], [pay('p1', 'm1', 3000)]);
    expect(within(paidInTile()).getByText('₹3,000')).toBeTruthy(); // 1,000 on the bill + 2,000 advance
    expect(within(byKind()).getByText('₹1,000')).toBeTruthy(); // credit repaid
    expect(within(byKind()).getByText('₹2,000')).toBeTruthy(); // advances
  });

  it('keeps the advances in Paid in when the report is narrowed to one crop cycle', () => {
    renderReport([bill('b', 1000, 's1', '2026-08-01')], [pay('p1', 'm1', 3000)]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's2' } });
    expect(within(byKind()).getByText('Advances to creditors')).toBeTruthy();
    expect(within(paidInTile()).getByText('₹2,000')).toBeTruthy(); // nothing on s2's bills, advance only
  });

  it('shows no advance rows when every payment sits on a bill', () => {
    renderReport([bill('b', 500, 's1', '2026-08-01')], [pay('p1', 'm1', 500)]);
    expect(screen.queryByText('Advances to creditors')).toBeNull();
    expect(screen.queryByText('Advance')).toBeNull();
  });
});
