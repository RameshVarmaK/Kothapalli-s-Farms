import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MembersTab } from '../src/components/MembersTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { Field, Season, Member } from '../src/types';

const fields: Field[] = [
  { id: 'f1', name: 'North Field', area: 5, shares: [{ memberId: 'm1', percentage: 100 }] },
];
const members: Member[] = [{ id: 'm1', name: 'Ramesh' }];
const seasons: Season[] = [
  { id: 's1', fieldId: 'f1', cropName: 'Rice', startDate: '2024-01-01', isClosed: false },
];

// Save handlers report whether the parent accepted the record. A bare
// `vi.fn()` returns undefined, which reads as a rejection — so an accepting
// mock has to say so explicitly.
const accept = () => vi.fn((_item: any) => true);

function renderMembersTab(overrides: Record<string, any> = {}) {
  const props = {
    onAddMember: accept(),
    onUpdateMember: accept(),
    onAddField: accept(),
    onUpdateField: accept(),
    onAddSeason: accept(),
    onUpdateSeason: accept(),
    onCloseSeason: vi.fn((_id: string, _date: string) => true),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <MembersTab
        fields={fields}
        seasons={seasons}
        members={members}
        expenses={[]}
        labours={[]}
        revenues={[]}
        usages={[]}
        stockItems={[]}
        purchases={[]}
        activities={[]}
        currency="₹"
        creditAccounts={[]}
        creditRepayments={[]}
        settlementClearances={[]}
        onDeleteMember={vi.fn()}
        onDeleteField={vi.fn()}
        onDeleteSeason={vi.fn()}
        {...(props as any)}
      />
    </LanguageProvider>
  );
  return props;
}

function submitNewPartner(name: string) {
  fireEvent.click(screen.getByText('Partners'));
  fireEvent.click(screen.getByText('Add Partner'));
  const nameField = screen.getByPlaceholderText('e.g. Shyam Naik');
  fireEvent.change(nameField, { target: { value: name } });
  fireEvent.submit(nameField.closest('form')!);
}

describe('MembersTab - a rejected record must not look saved', () => {
  it('announces success when the parent accepts the partner', () => {
    renderMembersTab();
    submitNewPartner('Shyam');
    expect(screen.getByText('Partner added')).toBeTruthy();
  });

  it('shows no success toast when the parent rejects the partner', () => {
    renderMembersTab({ onAddMember: vi.fn((_item: any) => false) });
    submitNewPartner('Shyam');
    expect(screen.queryByText('Partner added')).toBeNull();
  });

  it('keeps the form open holding the entry when rejected', () => {
    renderMembersTab({ onAddMember: vi.fn((_item: any) => false) });
    submitNewPartner('Shyam');

    const nameField = screen.queryByPlaceholderText('e.g. Shyam Naik') as HTMLInputElement | null;
    expect(nameField).toBeTruthy();
    expect(nameField!.value).toBe('Shyam');
  });

  it('closes the form once the parent accepts', () => {
    renderMembersTab();
    submitNewPartner('Shyam');
    expect(screen.queryByPlaceholderText('e.g. Shyam Naik')).toBeNull();
  });
});
