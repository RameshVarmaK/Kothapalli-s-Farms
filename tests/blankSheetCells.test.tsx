import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { parseSheetRows, toSheetRows, SHEET_COLUMNS } from '../src/utils/googleSheets';
import { buildSettlementLedger } from '../src/utils/calculations';
import { buildPartnerLedger } from '../src/utils/partnerLedger';
import { getInitialDatabase } from '../src/utils/database';
import { ScreenErrorBoundary } from '../src/components/shell/ScreenErrorBoundary';
import { LanguageProvider } from '../src/hooks/useLanguage';

// Regression: a stock usage charged to one crop cycle has a blank
// 'allocations' cell in the sheet. It came back as '' and the partner ledger
// called ''.map, which unmounted the whole app into a blank screen.

describe('blank list cells from the sheet', () => {
  it('are left off the record instead of becoming an empty string', () => {
    const usage = { id: 'u1', stockItemId: 'st1', quantityUsed: 4, date: '2026-06-25', targetType: 'single', targetSeasonId: 's1' };
    const expense = { id: 'e1', date: '2026-06-05', amount: 100, paidByMemberId: 'm1', category: 'Seeds', targetType: 'single', targetSeasonId: 's1' };
    const [u] = parseSheetRows<any>(toSheetRows([usage], SHEET_COLUMNS.usages));
    const [e] = parseSheetRows<any>(toSheetRows([expense], SHEET_COLUMNS.expenses));
    expect('allocations' in u).toBe(false);
    expect('allocations' in e).toBe(false);
    expect('attachments' in e).toBe(false);
    // Plain text columns keep their existing '' for a blank cell.
    expect(e.creditAccountId).toBe('');
  });
});

describe('partner ledger with data from the sheet', () => {
  const members = [{ id: 'm1', name: 'Ramesh' }];
  const fields: any[] = [{ id: 'f1', name: 'North', area: 1, shares: [{ memberId: 'm1', percentage: 100 }] }];
  const seasons: any[] = [{ id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false }];
  const stockItems: any[] = [{ id: 'st1', name: 'Urea', type: 'Fertilizer', unit: 'bag', quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0 }];
  const purchases: any[] = [{ id: 'p1', stockItemId: 'st1', quantity: 10, totalCost: 3000, date: '2026-05-30', paidByMemberId: 'm1' }];
  // Exactly what an older pull left on the device: '' in blank list cells.
  const usages: any[] = [{ id: 'u1', stockItemId: 'st1', quantityUsed: 4, date: '2026-06-25', targetType: 'single', targetSeasonId: 's1', allocations: '' }];
  const expenses: any[] = [{ id: 'e1', date: '2026-06-05', amount: 100, paidByMemberId: 'm1', category: 'Seeds', targetType: 'single', targetSeasonId: 's1', allocations: '', attachments: '' }];

  it('builds without crashing when list fields hold an empty string', () => {
    const summary = buildSettlementLedger(fields, seasons, members, expenses, [], [], usages, stockItems, purchases, ['s1']);
    const ledger = buildPartnerLedger({
      memberId: 'm1', seasonIds: ['s1'], summary, members, fields, seasons, expenses,
      labours: [], revenues: [], usages, stockItems, purchases,
    });
    expect(ledger.lines.map(l => l.id).sort()).toEqual(['e1', 'u1']);
    expect(ledger.lines.find(l => l.id === 'u1')!.paidIn).toBeCloseTo(1200, 2);
  });
});

describe('data already saved on a device', () => {
  beforeEach(() => localStorage.clear());

  it('has empty-string list fields removed when the app loads', () => {
    localStorage.setItem('farm_ledger_database', JSON.stringify({
      members: [{ id: 'm1', name: 'Ramesh' }],
      expenses: [{ id: 'e1', allocations: '', attachments: '', category: 'Seeds' }],
      usages: [{ id: 'u1', allocations: '' }],
      seasons: [{ id: 's1', shares: '' }],
    }));
    const db = getInitialDatabase();
    expect('allocations' in db.expenses[0]).toBe(false);
    expect('attachments' in db.expenses[0]).toBe(false);
    expect(db.expenses[0].category).toBe('Seeds');
    expect('allocations' in db.usages[0]).toBe(false);
    expect('shares' in db.seasons[0]).toBe(false);
  });
});

describe('ScreenErrorBoundary', () => {
  it('shows a message in place of a crashed screen instead of a blank app', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let crash = true;
    const Screen = () => {
      if (crash) throw new TypeError('se.map is not a function');
      return <p>Partner ledger</p>;
    };
    render(
      <LanguageProvider>
        <p>Header still here</p>
        <ScreenErrorBoundary>
          <Screen />
        </ScreenErrorBoundary>
      </LanguageProvider>
    );
    expect(screen.getByText('Header still here')).toBeTruthy();
    expect(screen.getByText('Something went wrong on this screen')).toBeTruthy();

    crash = false;
    fireEvent.click(screen.getByText('Try again'));
    expect(screen.getByText('Partner ledger')).toBeTruthy();
  });
});
