import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DashboardTab } from '../src/components/DashboardTab';
import { PartnerReportModal } from '../src/components/members/PartnerReportModal';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { buildSettlementLedger } from '../src/utils/calculations';
import { buildPartnerLedger } from '../src/utils/partnerLedger';

afterEach(() => {
  cleanup();
  document.body.classList.remove('report-print-open');
});

// Ramesh paid ₹1,000 of seeds himself, and later repaid ₹800 to Agro Store
// for pesticide bought on credit for Paddy, plus ₹300 to a creditor whose
// credit was used on Maize.
const members = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Suresh' }];
const fields: any[] = [{ id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] }];
const seasons: any[] = [
  { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false },
  { id: 's2', fieldId: 'f1', cropName: 'Maize', startDate: '2026-01-01', isClosed: true, endDate: '2026-04-01' },
];
const expenses: any[] = [
  { id: 'e1', date: '2026-06-05', amount: 1000, paidByMemberId: 'm1', category: 'Seeds', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e2', date: '2026-06-10', amount: 800, paidByMemberId: '', category: 'Pesticide', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1', isCredit: true, creditAccountId: 'c1' },
  { id: 'e3', date: '2026-02-10', amount: 300, paidByMemberId: '', category: 'Tractor', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's2', isCredit: true, creditAccountId: 'c2' },
];
const creditAccounts: any[] = [{ id: 'c1', name: 'Agro Store', type: 'Vendor' }, { id: 'c2', name: 'Tractor Owner', type: 'Tractor' }];
const creditRepayments: any[] = [
  { id: 'cr1', creditAccountId: 'c1', memberId: 'm1', amount: 800, date: '2026-07-01', notes: 'Cleared pesticide bill' },
  { id: 'cr2', creditAccountId: 'c2', memberId: 'm1', amount: 300, date: '2026-03-01' },
];
const summary = buildSettlementLedger(fields, seasons, members, expenses, [], [], [], [], [], ['s1', 's2'], creditAccounts, creditRepayments);

describe('partner ledger: payments to creditors', () => {
  const ledgerFor = (seasonIds: string[]) => buildPartnerLedger({
    memberId: 'm1', seasonIds, summary, members, fields, seasons, expenses,
    labours: [], revenues: [], usages: [], stockItems: [], purchases: [], creditAccounts, creditRepayments,
  });

  it('lists every payment at its full amount, in date order', () => {
    const { creditPayments } = ledgerFor(['s1', 's2']);
    expect(creditPayments.map(p => [p.creditorName, p.amount])).toEqual([['Tractor Owner', 300], ['Agro Store', 800]]);
    expect(creditPayments[1].notes).toBe('Cleared pesticide bill');
  });

  it('still lists a payment that falls outside the selected cycle, counted as zero', () => {
    const { creditPayments } = ledgerFor(['s1']);
    const tractor = creditPayments.find(p => p.creditorName === 'Tractor Owner')!;
    expect(tractor.amount).toBe(300);
    expect(tractor.countedInScope).toBe(0);
    expect(creditPayments.find(p => p.creditorName === 'Agro Store')!.countedInScope).toBeCloseTo(800, 2);
  });

  it('shows the section in the report even with shares hidden', () => {
    render(
      <LanguageProvider>
        <PartnerReportModal memberId="m1" onClose={vi.fn()} summary={summary} members={members} fields={fields} seasons={seasons}
          expenses={expenses} labours={[]} revenues={[]} usages={[]} stockItems={[]} purchases={[]}
          creditAccounts={creditAccounts} creditRepayments={creditRepayments} currency="₹" />
      </LanguageProvider>
    );
    expect(screen.getByText('Section 2: Payments to Creditors')).toBeTruthy();
    expect(screen.getByText('Cleared pesticide bill')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Include shares & settlement'));
    expect(screen.getByText('Section 4: Payments to Creditors')).toBeTruthy();
  });
});

describe('dashboard partner investment standing', () => {
  it('counts payments to creditors in what a partner has put in', () => {
    render(
      <LanguageProvider>
        <DashboardTab fields={fields} seasons={seasons} members={members} expenses={expenses} labours={[]} revenues={[]}
          usages={[]} stockItems={[]} purchases={[]} currency="₹" areaUnit="acres"
          creditAccounts={creditAccounts} creditRepayments={creditRepayments} onSelectTab={vi.fn()} />
      </LanguageProvider>
    );
    // ₹1,000 paid directly + ₹800 + ₹300 repaid to creditors.
    const total = screen.getByText('Overall Capital Spent:').parentElement!;
    expect(total.textContent).toContain('₹2,100');
  });
});
