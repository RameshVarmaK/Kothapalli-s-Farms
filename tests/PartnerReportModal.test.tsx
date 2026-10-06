import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { PartnerReportModal } from '../src/components/members/PartnerReportModal';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { buildSettlementLedger } from '../src/utils/calculations';

const members = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Suresh' }];
const fields: any[] = [{ id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] }];
const seasons: any[] = [
  { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false },
  { id: 's2', fieldId: 'f1', cropName: 'Maize', startDate: '2026-01-01', isClosed: true, endDate: '2026-04-01' },
];
const expenses: any[] = [
  { id: 'e1', date: '2026-06-05', amount: 1000, paidByMemberId: 'm1', category: 'Seeds', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e2', date: '2026-02-05', amount: 600, paidByMemberId: 'm1', category: 'Ploughing', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's2' },
];
const revenues: any[] = [
  { id: 'r1', date: '2026-10-01', fieldId: 'f1', seasonId: 's1', crop: 'Paddy', quantity: 40, saleAmount: 5000, receivedByMemberId: 'm2' },
];
const summary = buildSettlementLedger(fields, seasons, members, expenses, [], revenues, [], [], [], ['s1', 's2']);

function renderReport(memberId: string | null = 'm1') {
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <PartnerReportModal
        memberId={memberId}
        onClose={onClose}
        summary={summary}
        members={members}
        fields={fields}
        seasons={seasons}
        expenses={expenses}
        labours={[]}
        revenues={revenues}
        usages={[]}
        stockItems={[]}
        purchases={[]}
        currency="₹"
      />
    </LanguageProvider>
  );
  return { onClose };
}

afterEach(() => {
  cleanup();
  document.body.classList.remove('report-print-open');
});

describe('PartnerReportModal', () => {
  it('renders nothing without a partner', () => {
    renderReport(null);
    expect(screen.queryByText('Partner Ledger')).toBeNull();
  });

  it("lists the partner's payments across all cycles by default", () => {
    renderReport();
    expect(screen.getByRole('heading', { name: 'Ramesh' })).toBeTruthy();
    expect(screen.getByText('Seeds')).toBeTruthy();
    expect(screen.getByText('Ploughing')).toBeTruthy();
  });

  it('narrows to one crop cycle', () => {
    renderReport();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's1' } });
    expect(screen.getByText('Seeds')).toBeTruthy();
    expect(screen.queryByText('Ploughing')).toBeNull();
  });

  it('shows who pays whom and that it is still pending, once shares are included', () => {
    renderReport();
    fireEvent.click(screen.getByLabelText('Include shares & settlement'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's1' } });
    // Ramesh funded Paddy, Suresh pocketed the sale: Suresh owes Ramesh.
    const settlement = screen.getByText('Receives from').closest('div')!;
    expect(within(settlement).getByText('Suresh')).toBeTruthy();
    expect(within(settlement).getByText('Pending')).toBeTruthy();
  });

  it('prints only the report and names the PDF after the partner', () => {
    // jsdom has no window.print.
    const print = vi.fn();
    window.print = print;
    renderReport();
    expect(document.body.classList.contains('report-print-open')).toBe(true);
    expect(document.title).toMatch(/^Ramesh - Partner Ledger - \d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByText('Save as PDF'));
    expect(print).toHaveBeenCalled();
  });

  it('leaves shares, net standing and settlement out by default', () => {
    renderReport();
    const toggle = screen.getByLabelText('Include shares & settlement') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    // Transactions and what was paid stay.
    expect(screen.getByText('Seeds')).toBeTruthy();
    expect(screen.getByText('Section 1: Transactions')).toBeTruthy();
    expect(screen.getAllByText('Paid in').length).toBeGreaterThan(0);
    // Partnership terms do not.
    expect(screen.queryByText('Net Standing')).toBeNull();
    expect(screen.queryByText(/Share of cost/)).toBeNull();
    expect(screen.queryByText('Section 1: Crop Cycles')).toBeNull();
    expect(screen.queryByText('Section 2: Settlement')).toBeNull();
    expect(screen.queryByText('Receives from')).toBeNull();
  });

  it('adds shares, the per-cycle table and settlement back when ticked', () => {
    renderReport();
    fireEvent.click(screen.getByLabelText('Include shares & settlement'));
    expect(screen.getByText('Net Standing')).toBeTruthy();
    expect(screen.getByText('Section 1: Crop Cycles')).toBeTruthy();
    expect(screen.getByText('Section 2: Settlement')).toBeTruthy();
    expect(screen.getByText('Section 3: Transactions')).toBeTruthy();
  });

  it('restores the page title and print flag on close', () => {
    document.title = 'App';
    renderReport();
    cleanup();
    expect(document.title).toBe('App');
    expect(document.body.classList.contains('report-print-open')).toBe(false);
  });
});
