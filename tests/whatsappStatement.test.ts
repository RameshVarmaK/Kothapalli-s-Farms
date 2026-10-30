import { describe, expect, it } from 'vitest';
import { whatsappNumber, whatsappShareUrl, partnerStatementText } from '../src/utils/whatsapp';
import { buildSettlementLedger } from '../src/utils/calculations';
import { buildPartnerLedger } from '../src/utils/partnerLedger';
import { categoryOptions, EXPENSE_CATEGORIES, OTHER_CATEGORY } from '../src/app/expenseCategories';

describe('whatsapp numbers', () => {
  it('adds the Indian country code to ten-digit numbers and strips formatting', () => {
    expect(whatsappNumber('98765 43210')).toBe('919876543210');
    expect(whatsappNumber('098765-43210')).toBe('919876543210');
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210');
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber(undefined)).toBeNull();
  });
  it('builds a wa.me link, without a number when the phone is unusable', () => {
    expect(whatsappShareUrl('hi there', '9876543210')).toBe('https://wa.me/919876543210?text=hi%20there');
    expect(whatsappShareUrl('hi', '')).toBe('https://wa.me/?text=hi');
  });
});

describe('partner statement text', () => {
  const members = [{ id: 'm1', name: 'Ramesh' }, { id: 'm2', name: 'Suresh' }];
  const fields: any[] = [{ id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'm1', percentage: 50 }, { memberId: 'm2', percentage: 50 }] }];
  const seasons: any[] = [{ id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false }];
  const expenses: any[] = [{ id: 'e1', date: '2026-06-05', amount: 4000, paidByMemberId: 'm1', category: 'Seeds', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' }];
  const summary = buildSettlementLedger(fields, seasons, members, expenses, [], [], [], [], [], ['s1']);
  const ledger = buildPartnerLedger({ memberId: 'm2', seasonIds: ['s1'], summary, members, fields, seasons, expenses, labours: [], revenues: [], usages: [], stockItems: [], purchases: [] });

  it('states the figures and who pays whom', () => {
    const text = partnerStatementText({ ledger, scopeLabel: 'All crop cycles', currency: '₹', appUrl: 'https://x.test/#settle', t: s => s, today: new Date('2026-10-30') });
    expect(text).toContain('statement for Suresh');
    expect(text).toContain('Paid in: ₹0');
    expect(text).toContain('Share of cost: ₹2,000');
    expect(text).toContain('Net Standing: -₹2,000* (you pay)');
    expect(text).toContain('• Pay ₹2,000 to Ramesh (Paddy · North)');
    expect(text).toContain('Open the ledger: https://x.test/#settle');
  });
});

describe('expense category options', () => {
  it('keeps the fixed list first, adds old categories once, and Other last', () => {
    const options = categoryOptions(['fertilizer', 'Engine repair', 'engine repair', ' ', 'Other', 'Borewell']);
    expect(options.slice(0, EXPENSE_CATEGORIES.length)).toEqual(EXPENSE_CATEGORIES);
    expect(options.slice(EXPENSE_CATEGORIES.length)).toEqual(['Borewell', 'Engine repair', OTHER_CATEGORY]);
  });
});
