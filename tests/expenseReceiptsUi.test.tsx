import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoneyTab } from '../src/components/MoneyTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, Member, Expense } from '../src/types';

const fields: Field[] = [{ id: 'f1', name: 'North Field', area: 5, shares: [{ memberId: 'm1', percentage: 100 }] }];
const seasons: Season[] = [{ id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false } as Season];
const members: Member[] = [{ id: 'm1', name: 'Ramesh' }];

const withReceipts: Expense = {
  id: 'exp_1',
  date: '2026-10-01',
  amount: 500,
  paidByMemberId: 'm1',
  category: 'Fertilizer',
  targetType: 'single',
  targetFieldId: 'f1',
  targetSeasonId: 's1',
  attachments: [
    { id: 'a1', fileName: 'bill.jpg', mimeType: 'image/jpeg', size: 5, uploadedAt: '2026-10-01T00:00:00.000Z', pending: true, data: 'aGVsbG8=' },
    { id: 'a2', fileName: 'invoice.pdf', mimeType: 'application/pdf', size: 9, uploadedAt: '2026-10-01T00:00:00.000Z', driveFileId: 'file_2', webViewLink: 'https://drive.google.com/file/d/file_2/view' },
  ],
};

function renderTab(onEditExpense = vi.fn((_e: Expense) => true), accessToken: string | null = null, onDeleteExpense = vi.fn()) {
  render(
    <LanguageProvider>
      <MoneyTab
        expenses={[withReceipts]}
        labours={[]}
        revenues={[]}
        fields={fields}
        seasons={seasons}
        members={members}
        activities={[]}
        currency="₹"
        creditAccounts={[]}
        accessToken={accessToken}
        onAddExpense={vi.fn(() => true)}
        onEditExpense={onEditExpense}
        onDeleteExpense={onDeleteExpense}
        onAddLabour={vi.fn(() => true)}
        onEditLabour={vi.fn(() => true)}
        onDeleteLabour={vi.fn()}
        onAddRevenue={vi.fn(() => true)}
        onEditRevenue={vi.fn(() => true)}
        onDeleteRevenue={vi.fn()}
      />
    </LanguageProvider>
  );
  return onEditExpense;
}

describe('expense receipts in the Money tab', () => {
  it('shows a paperclip with the count and opens the receipts', () => {
    renderTab();
    fireEvent.click(screen.getByLabelText('View receipts (2)'));
    // A receipt still on this device shows from its local copy.
    expect(screen.getByAltText('bill.jpg').getAttribute('src')).toBe('data:image/jpeg;base64,aGVsbG8=');
    // A PDF opens in Drive.
    const link = screen.getByText('Open in Drive').closest('a')!;
    expect(link.getAttribute('href')).toBe('https://drive.google.com/file/d/file_2/view');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows existing receipts when editing and saves a removal', () => {
    const onEdit = renderTab();
    fireEvent.click(screen.getByTitle('Edit Record'));
    expect(screen.getByText('Receipts (2/5)')).toBeTruthy();
    expect(screen.getByText(/Not uploaded yet/)).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Remove receipt')[0]);
    fireEvent.submit(screen.getByPlaceholderText('e.g. 5000').closest('form')!);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0][0].attachments!.map(a => a.id)).toEqual(['a2']);
  });

  function stubTrash() {
    const patches: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'PATCH') patches.push(`${url.split('/files/')[1].split('?')[0]} ${init.body}`);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as any;
    }));
    return patches;
  }

  it('moves a receipt taken off an expense to the Drive trash', async () => {
    const patches = stubTrash();
    renderTab(vi.fn((_e: Expense) => true), 'tok');
    fireEvent.click(screen.getByTitle('Edit Record'));
    fireEvent.click(screen.getAllByLabelText('Remove receipt')[1]); // the uploaded PDF
    fireEvent.submit(screen.getByPlaceholderText('e.g. 5000').closest('form')!);
    await waitFor(() => expect(patches).toEqual(['file_2 {"trashed":true}']));
    vi.unstubAllGlobals();
  });

  it('moves the receipts of a deleted expense to the Drive trash', async () => {
    const patches = stubTrash();
    const onDelete = vi.fn();
    renderTab(vi.fn((_e: Expense) => true), 'tok', onDelete);
    fireEvent.click(screen.getByTitle('Delete Record'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('exp_1');
    await waitFor(() => expect(patches).toEqual(['file_2 {"trashed":true}']));
    vi.unstubAllGlobals();
  });
});
