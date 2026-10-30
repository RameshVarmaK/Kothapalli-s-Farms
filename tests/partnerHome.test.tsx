import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { PartnerHomeTab } from '../src/components/PartnerHomeTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { resolveAccess } from '../src/app/access';
import { fieldsOfPartner, seasonsOfPartner } from '../src/utils/partnerScope';
import type { Member } from '../src/types';

const ramesh: Member = { id: 'm1', name: 'Ramesh', email: 'ramesh@example.com', role: 'owner' };
const subbayah: Member = { id: 'm2', name: 'Subbayah', email: 'subbayah@example.com', role: 'viewer' };
const members = [ramesh, subbayah];
const fields: any[] = [
  { id: 'f1', name: 'North Plot', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] },
  { id: 'f2', name: 'River Plot', area: 3, shares: [{ memberId: 'm1', percentage: 100 }] },
  // Subbayah is on this field only through the season's own share list.
  { id: 'f3', name: 'Hill Plot', area: 1, shares: [{ memberId: 'm1', percentage: 100 }] },
];
const seasons: any[] = [
  { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false },
  { id: 's2', fieldId: 'f2', cropName: 'Maize', startDate: '2026-06-01', isClosed: false },
  { id: 's3', fieldId: 'f3', cropName: 'Chilli', startDate: '2026-07-01', isClosed: false, shares: [{ memberId: 'm2', percentage: 100 }] },
];
const expenses: any[] = [
  { id: 'e1', date: '2026-06-05', amount: 1000, paidByMemberId: 'm2', category: 'Seeds', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e2', date: '2026-06-06', amount: 3000, paidByMemberId: 'm1', category: 'Tractor', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
  { id: 'e3', date: '2026-06-07', amount: 7777, paidByMemberId: 'm1', category: 'Drip pipes', targetType: 'single', targetFieldId: 'f2', targetSeasonId: 's2' },
];

function renderHome() {
  const onLogout = vi.fn();
  render(
    <LanguageProvider>
      <PartnerHomeTab
        member={subbayah}
        email="subbayah@example.com"
        members={members}
        fields={fields}
        seasons={seasons}
        expenses={expenses}
        labours={[]}
        revenues={[]}
        usages={[]}
        stockItems={[]}
        purchases={[]}
        currency="₹"
        areaUnit="acres"
        onLogout={onLogout}
      />
    </LanguageProvider>
  );
  return { onLogout };
}

afterEach(cleanup);

describe('partner scope', () => {
  it('lists the fields a partner holds a share in, directly or through a season', () => {
    expect(fieldsOfPartner('m2', fields, seasons).map(f => f.id)).toEqual(['f1', 'f3']);
    expect(seasonsOfPartner('m2', fields, seasons).map(s => s.id)).toEqual(['s1', 's3']);
    expect(fieldsOfPartner('m1', fields, seasons).map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
  });
});

describe('which shell an account gets', () => {
  const resolve = (email: string) => resolveAccess({ sheetAccess: 'edit', sheetOwnedByMe: false, members, email });
  it('sends viewers to the partner home and strangers to the unlinked screen', () => {
    expect(resolve('ramesh@example.com').shell).toBe('full');
    expect(resolve('subbayah@example.com').shell).toBe('partner');
    expect(resolve('nobody@example.com').shell).toBe('unlinked');
  });
  it('keeps the full app for a ledger that has not set roles up', () => {
    expect(resolveAccess({ sheetAccess: 'edit', sheetOwnedByMe: false, members: [{ id: 'x', name: 'X' }], email: 'anyone@example.com' }).shell).toBe('full');
  });
});

describe('PartnerHomeTab', () => {
  it('shows only the fields the viewer is part of', () => {
    renderHome();
    const cards = screen.getAllByTestId('partner-field');
    const names = cards.map(c => within(c).getByRole('heading', { level: 4 }).textContent);
    expect(names).toEqual(['North Plot', 'Hill Plot']);
    expect(screen.queryByText('River Plot')).toBeNull();
  });

  it("shows the viewer's own spend, not the other partner's", () => {
    renderHome();
    expect(screen.getByTestId('paid-in').textContent).toBe('₹1,000');
    // Ramesh's entries never appear, not even the one on the shared field.
    expect(screen.queryByText('Tractor')).toBeNull();
    expect(screen.queryByText('Drip pipes')).toBeNull();
    expect(screen.queryByText(/7,777/)).toBeNull();
    expect(screen.getByText('Seeds')).toBeTruthy();
  });

  it('settles against the same engine as the owner: half of a 4,000 cost paid 1,000 nets -1,000', () => {
    renderHome();
    const north = screen.getAllByTestId('partner-field')[0];
    expect(within(north).getByText('My share: 50%')).toBeTruthy();
    expect(within(north).getByText('-₹1,000')).toBeTruthy();
    expect(within(north).getByText('Ramesh')).toBeTruthy(); // Pays to Ramesh
  });

  it('offers sign-out', () => {
    const { onLogout } = renderHome();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
