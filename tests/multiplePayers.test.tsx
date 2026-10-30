import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  amountPaidBy, describePayers, isNamedPayer, paymentsFor, payersProblem, payersToStore, shareOfPaymentBy,
} from '../src/utils/payers';
import { buildSettlementLedger } from '../src/utils/calculations';
import { buildPartnerLedger } from '../src/utils/partnerLedger';
import { buildLedgerItems, filterLedger } from '../src/utils/moneyLedger';
import { validateExpense, validateLabour } from '../src/utils/validation';
import { SHEET_COLUMNS, parseSheetRows, toSheetRows } from '../src/utils/googleSheets';
import { MoneyTab } from '../src/components/MoneyTab';
import { LanguageProvider } from '../src/hooks/useLanguage';
import type { Expense, Labour } from '../src/types';

afterEach(() => cleanup());

const members = [{ id: 'a', name: 'Ramesh' }, { id: 'b', name: 'Ganapathi' }, { id: 'c', name: 'Subba' }];
const fields = [
  { id: 'f1', name: 'North', area: 2, shares: [{ memberId: 'a', percentage: 50 }, { memberId: 'b', percentage: 50 }] },
  { id: 'f2', name: 'South', area: 1, shares: [{ memberId: 'a', percentage: 50 }, { memberId: 'b', percentage: 50 }] },
];
const seasons = [
  { id: 's1', fieldId: 'f1', cropName: 'Paddy', startDate: '2026-06-01', isClosed: false },
  { id: 's2', fieldId: 'f2', cropName: 'Cotton', startDate: '2026-06-01', isClosed: false },
];
const together: Expense = {
  id: 'e1', date: '2026-06-05', amount: 2400, paidByMemberId: 'a', category: 'Tractor', targetType: 'single',
  targetFieldId: 'f1', targetSeasonId: 's1', payers: [{ memberId: 'a', amount: 1500 }, { memberId: 'b', amount: 900 }],
};

describe('who paid an entry', () => {
  it('is the one partner on an ordinary entry', () => {
    expect(paymentsFor({ paidByMemberId: 'a' }, 500)).toEqual([{ memberId: 'a', amount: 500 }]);
  });

  it('is each listed partner with what they paid', () => {
    expect(paymentsFor(together, 2400)).toEqual([{ memberId: 'a', amount: 1500 }, { memberId: 'b', amount: 900 }]);
    expect(amountPaidBy(together, 2400, 'b')).toBe(900);
    expect(shareOfPaymentBy(together, 2400, 'a')).toBeCloseTo(0.625);
  });

  it('is nobody on a credit entry, which the creditor financed', () => {
    expect(paymentsFor({ isCredit: true, paidByMemberId: '', payers: together.payers }, 2400)).toEqual([]);
  });

  it('scales to the total if the amount was changed after the split was recorded', () => {
    const payments = paymentsFor({ ...together, amount: 4800 } as Expense, 4800);
    expect(payments.map(p => p.amount)).toEqual([3000, 1800]);
  });

  it('adds up a partner listed twice', () => {
    expect(paymentsFor({ paidByMemberId: 'a', payers: [{ memberId: 'a', amount: 100 }, { memberId: 'a', amount: 200 }] }, 300))
      .toEqual([{ memberId: 'a', amount: 300 }]);
  });

  it('names a partner as payer if they are the main one or one of several', () => {
    expect(isNamedPayer(together, 'b')).toBe(true);
    expect(isNamedPayer(together, 'c')).toBe(false);
  });

  it('describes several payers with their amounts, or a cycle’s share of them', () => {
    expect(describePayers(together, 2400, members, '₹')).toBe('Ramesh ₹1,500, Ganapathi ₹900');
    expect(describePayers(together, 2400, members, '₹', 'Unknown', 1200)).toBe('Ramesh ₹750, Ganapathi ₹450');
    expect(describePayers({ paidByMemberId: 'c' }, 500, members, '₹')).toBe('Subba');
  });

  it('stores nothing extra for a single payer, the list for several', () => {
    expect(payersToStore([{ memberId: 'a', amount: 500 }])).toBeUndefined();
    expect(payersToStore([{ memberId: 'a', amount: 500 }, { memberId: 'b', amount: 0 }])).toBeUndefined();
    expect(payersToStore([{ memberId: 'a', amount: 300 }, { memberId: 'b', amount: 200 }])).toHaveLength(2);
  });
});

describe('what payments can be saved', () => {
  it('accepts payments that add up to the total', () => {
    expect(payersProblem(together.payers!, 2400)).toBeNull();
  });
  it('refuses short and over payments, saying by how much', () => {
    expect(payersProblem([{ memberId: 'a', amount: 1000 }, { memberId: 'b', amount: 900 }], 2400)).toMatch(/short of the total by 500\.00/);
    expect(payersProblem([{ memberId: 'a', amount: 2000 }, { memberId: 'b', amount: 900 }], 2400)).toMatch(/over the total by 500\.00/);
  });
  it('refuses nobody, and a partner listed twice', () => {
    expect(payersProblem([], 100)).toMatch(/at least one/);
    expect(payersProblem([{ memberId: 'a', amount: 50 }, { memberId: 'a', amount: 50 }], 100)).toMatch(/once/);
  });
  it('is checked when an expense or labour entry is validated', () => {
    expect(validateExpense({ ...together, payers: [{ memberId: 'a', amount: 1000 }, { memberId: 'b', amount: 900 }] }).valid).toBe(false);
    expect(validateExpense(together).valid).toBe(true);
    const labour: Labour = {
      id: 'l1', date: '2026-06-06', targetType: 'single', fieldId: 'f1', seasonId: 's1', description: 'Weeding', workersCount: 4,
      wageRate: 300, totalCost: 1200, paidByMemberId: 'a', payers: [{ memberId: 'a', amount: 1000 }, { memberId: 'b', amount: 100 }],
    } as Labour;
    expect(validateLabour(labour).valid).toBe(false);
  });
});

describe('the settlement and the ledgers', () => {
  const split: Expense = {
    id: 'e2', date: '2026-06-10', amount: 1000, paidByMemberId: 'a', category: 'Diesel', targetType: 'common',
    allocations: [{ fieldId: 'f1', seasonId: 's1', amount: 600 }, { fieldId: 'f2', seasonId: 's2', amount: 400 }],
    payers: [{ memberId: 'a', amount: 250 }, { memberId: 'b', amount: 750 }],
  };
  const labour: Labour = {
    id: 'l1', date: '2026-06-20', targetType: 'single', fieldId: 'f2', seasonId: 's2', description: 'Weeding', workersCount: 4,
    wageRate: 300, totalCost: 1200, paidByMemberId: 'b', payers: [{ memberId: 'b', amount: 700 }, { memberId: 'c', amount: 500 }],
  } as Labour;
  const summary = buildSettlementLedger(fields as any, seasons as any, members, [together, split], [labour], [], [], [], [], ['s1', 's2'], [], []);
  const paid = (seasonId: string, memberId: string) =>
    summary.ledgers.find(l => l.seasonId === seasonId)!.statements.find(s => s.memberId === memberId)!.paidAmount;

  it('credits each partner for their own part of a single-cycle entry', () => {
    // s1 carries the ₹2,400 tractor job (a ₹1,500, b ₹900) and ₹600 of diesel (a 25%, b 75%).
    expect(paid('s1', 'a')).toBeCloseTo(1500 + 150);
    expect(paid('s1', 'b')).toBeCloseTo(900 + 450);
  });

  it('credits each partner for their part of a cycle’s share of a split entry, and of labour', () => {
    // s2: ₹400 of diesel (a 25%, b 75%) and the ₹1,200 weeding (b ₹700, c ₹500).
    expect(paid('s2', 'a')).toBeCloseTo(100);
    expect(paid('s2', 'b')).toBeCloseTo(300 + 700);
    expect(paid('s2', 'c')).toBeCloseTo(500);
  });

  it('credits exactly what was spent, so the ledger still balances', () => {
    expect(summary.isBalanced).toBe(true);
    const totalPaid = ['a', 'b', 'c'].reduce((s, m) => s + summary.membersTotalStatements[m].paidAmount, 0);
    expect(totalPaid).toBeCloseTo(2400 + 1000 + 1200);
  });

  it('shows the partner ledger lines adding up to what the engine credited', () => {
    for (const memberId of ['a', 'b', 'c']) {
      const ledger = buildPartnerLedger({
        memberId, seasonIds: ['s1', 's2'], summary, members, fields: fields as any, seasons: seasons as any,
        expenses: [together, split], labours: [labour], revenues: [], usages: [], stockItems: [], purchases: [],
      });
      const fromLines = ledger.lines.reduce((s, l) => s + l.paidIn, 0);
      expect(fromLines).toBeCloseTo(summary.membersTotalStatements[memberId].paidAmount, 1);
    }
  });

  it('lists the entry once in the Money ledger, naming both payers, and finds it by either', () => {
    const items = buildLedgerItems({ expenses: [together], labours: [], revenues: [], fields: fields as any, seasons: seasons as any, members, creditAccounts: [], currency: '₹' });
    expect(items).toHaveLength(1);
    expect(items[0].party).toBe('Ramesh ₹1,500, Ganapathi ₹900');
    const filters = (filterMemberId: string) => ({ filterType: 'all' as const, filterFieldId: 'all', filterMemberId });
    expect(filterLedger(items, filters('b'))).toHaveLength(1);
    expect(filterLedger(items, filters('a'))).toHaveLength(1);
    expect(filterLedger(items, filters('c'))).toHaveLength(0);
  });
});

describe('sheet storage', () => {
  it('keeps the payers through a push and a pull', () => {
    const [back] = parseSheetRows<Expense>(toSheetRows([together], SHEET_COLUMNS.expenses));
    expect(back.payers).toEqual(together.payers);
    expect(back.paidByMemberId).toBe('a');
  });

  it('reads an entry from a sheet that has no payers column, as one payer', () => {
    const oldSheet = [['id', 'date', 'amount', 'paidByMemberId', 'category', 'targetType'], ['e9', '2026-06-01', 300, 'c', 'Seed', 'single']];
    const [entry] = parseSheetRows<Expense>(oldSheet);
    expect(entry.payers).toBeUndefined();
    expect(paymentsFor(entry, entry.amount)).toEqual([{ memberId: 'c', amount: 300 }]);
  });
});

describe('Money tab: recording an entry paid by several partners', () => {
  function renderTab(onAddExpense = vi.fn((_e: Expense) => true)) {
    render(
      <LanguageProvider>
        <MoneyTab
          expenses={[]} labours={[]} revenues={[]} fields={fields as any}
          seasons={seasons as any} members={members} activities={[]} currency="₹" creditAccounts={[]}
          onAddExpense={onAddExpense} onEditExpense={vi.fn(() => true)} onDeleteExpense={vi.fn()}
          onAddLabour={vi.fn(() => true)} onEditLabour={vi.fn(() => true)} onDeleteLabour={vi.fn()}
          onAddRevenue={vi.fn(() => true)} onEditRevenue={vi.fn(() => true)} onDeleteRevenue={vi.fn()}
        />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByText('+ New Entry'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 5000'), { target: { value: '2400' } });
    fireEvent.change(screen.getByDisplayValue('-- Choose category --'), { target: { value: 'Other' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Engine repair'), { target: { value: 'Tractor' } });
    return onAddExpense;
  }
  const dialog = () => screen.getByRole('dialog');
  const submit = () => fireEvent.submit(screen.getByPlaceholderText('e.g. 5000').closest('form')!);

  it('saves the amounts each partner paid, with the first as the main payer', () => {
    const onAdd = renderTab();
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    const form = within(dialog());
    fireEvent.click(form.getByLabelText('Ganapathi'));
    fireEvent.change(form.getByLabelText('Amount paid by Ramesh'), { target: { value: '1500' } });
    fireEvent.change(form.getByLabelText('Amount paid by Ganapathi'), { target: { value: '900' } });
    submit();

    expect(onAdd).toHaveBeenCalledTimes(1);
    const saved = onAdd.mock.calls[0][0];
    expect(saved.paidByMemberId).toBe('a');
    expect(saved.payers).toEqual([{ memberId: 'a', amount: 1500 }, { memberId: 'b', amount: 900 }]);
  });

  it('keeps a lone ticked partner\u2019s amount equal to the total as the total is typed', () => {
    const onAdd = vi.fn((_e: Expense) => true);
    render(
      <LanguageProvider>
        <MoneyTab
          expenses={[]} labours={[]} revenues={[]} fields={fields as any}
          seasons={seasons as any} members={members} activities={[]} currency="₹" creditAccounts={[]}
          onAddExpense={onAdd} onEditExpense={vi.fn(() => true)} onDeleteExpense={vi.fn()}
          onAddLabour={vi.fn(() => true)} onEditLabour={vi.fn(() => true)} onDeleteLabour={vi.fn()}
          onAddRevenue={vi.fn(() => true)} onEditRevenue={vi.fn(() => true)} onDeleteRevenue={vi.fn()}
        />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByText('+ New Entry'));
    fireEvent.click(screen.getByText('Paid by more than one partner')); // before any amount is typed
    const form = within(dialog());
    fireEvent.change(screen.getByPlaceholderText('e.g. 5000'), { target: { value: '2400' } });
    expect((form.getByLabelText('Amount paid by Ramesh') as HTMLInputElement).value).toBe('2400');

    fireEvent.change(screen.getByPlaceholderText('e.g. 5000'), { target: { value: '2500' } });
    expect((form.getByLabelText('Amount paid by Ramesh') as HTMLInputElement).value).toBe('2500');

    // Once they have set their own figure, the total no longer overwrites it.
    fireEvent.change(form.getByLabelText('Amount paid by Ramesh'), { target: { value: '1000' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 5000'), { target: { value: '3000' } });
    expect((form.getByLabelText('Amount paid by Ramesh') as HTMLInputElement).value).toBe('1000');
  });

  it('refuses amounts that do not add up, and says how far off they are', () => {
    const onAdd = renderTab();
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    const form = within(dialog());
    fireEvent.click(form.getByLabelText('Ganapathi'));
    fireEvent.change(form.getByLabelText('Amount paid by Ramesh'), { target: { value: '1500' } });
    fireEvent.change(form.getByLabelText('Amount paid by Ganapathi'), { target: { value: '500' } });
    expect(form.getByText(/₹2,000 of ₹2,400 · still to assign ₹400/)).toBeTruthy();
    submit();

    expect(onAdd).not.toHaveBeenCalled();
    expect(form.getByText(/short of the total by 400\.00/)).toBeTruthy();
  });

  it('splits the total evenly between the partners ticked', () => {
    const onAdd = renderTab();
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    const form = within(dialog());
    fireEvent.click(form.getByLabelText('Ganapathi'));
    fireEvent.click(form.getByLabelText('Subba'));
    fireEvent.click(form.getByText('Split equally'));
    expect((form.getByLabelText('Amount paid by Ramesh') as HTMLInputElement).value).toBe('800');
    submit();

    expect(onAdd.mock.calls[0][0].payers).toEqual([
      { memberId: 'a', amount: 800 }, { memberId: 'b', amount: 800 }, { memberId: 'c', amount: 800 },
    ]);
  });

  it('saves a plain single payer exactly as before', () => {
    const onAdd = renderTab();
    submit();
    const saved = onAdd.mock.calls[0][0];
    expect(saved.paidByMemberId).toBe('a');
    expect(saved.payers).toBeUndefined();
  });

  it('goes back to one payer when asked', () => {
    const onAdd = renderTab();
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    fireEvent.click(screen.getByText('Back to one payer'));
    submit();
    expect(onAdd.mock.calls[0][0].payers).toBeUndefined();
  });
});

describe('Money tab: editing an entry paid by several partners', () => {
  it('reopens with each partner ticked and their amount, and saves a changed split', () => {
    const onEdit = vi.fn((_e: Expense) => true);
    render(
      <LanguageProvider>
        <MoneyTab
          expenses={[together]} labours={[]} revenues={[]} fields={fields as any}
          seasons={seasons as any} members={members} activities={[]} currency="₹" creditAccounts={[]}
          onAddExpense={vi.fn(() => true)} onEditExpense={onEdit} onDeleteExpense={vi.fn()}
          onAddLabour={vi.fn(() => true)} onEditLabour={vi.fn(() => true)} onDeleteLabour={vi.fn()}
          onAddRevenue={vi.fn(() => true)} onEditRevenue={vi.fn(() => true)} onDeleteRevenue={vi.fn()}
        />
      </LanguageProvider>
    );
    // The feed names both payers.
    expect(screen.getByText(/Ramesh ₹1,500, Ganapathi ₹900/)).toBeTruthy();

    fireEvent.click(screen.getByTitle('Edit Record'));
    const form = within(screen.getByRole('dialog'));
    expect((form.getByLabelText('Ramesh') as HTMLInputElement).checked).toBe(true);
    expect((form.getByLabelText('Amount paid by Ramesh') as HTMLInputElement).value).toBe('1500');
    expect((form.getByLabelText('Amount paid by Ganapathi') as HTMLInputElement).value).toBe('900');
    expect((form.getByLabelText('Subba') as HTMLInputElement).checked).toBe(false);

    fireEvent.change(form.getByLabelText('Amount paid by Ramesh'), { target: { value: '1400' } });
    fireEvent.change(form.getByLabelText('Amount paid by Ganapathi'), { target: { value: '800' } });
    fireEvent.click(form.getByLabelText('Subba'));
    fireEvent.change(form.getByLabelText('Amount paid by Subba'), { target: { value: '200' } });
    fireEvent.submit(screen.getByPlaceholderText('e.g. 5000').closest('form')!);

    expect(onEdit.mock.calls[0][0].payers).toEqual([
      { memberId: 'a', amount: 1400 }, { memberId: 'b', amount: 800 }, { memberId: 'c', amount: 200 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Stock purchases paid by several partners, and harvest sales received by several
// ---------------------------------------------------------------------------
import { computeStockLevels, splitStockCostByFunder } from '../src/utils/calculations';
import { validatePurchase, validateRevenue } from '../src/utils/validation';
import { amountReceivedBy, isNamedReceiver, receiptsFor, describeReceivers } from '../src/utils/payers';
import { StockTab } from '../src/components/StockTab';
import type { HarvestRevenue, StockPurchase } from '../src/types';

const stockItem = { id: 'st1', name: 'Urea', type: 'Fertilizer', unit: 'bag', quantityOnHand: 0, weightedAverageCost: 0, totalCostSpent: 0, fundingByMember: {} } as any;
const sharedPurchase: StockPurchase = {
  id: 'p1', stockItemId: 'st1', quantity: 10, totalCost: 1000, date: '2026-05-30', paidByMemberId: 'a',
  payers: [{ memberId: 'a', amount: 600 }, { memberId: 'b', amount: 400 }],
};
const sale: HarvestRevenue = {
  id: 'r1', date: '2026-10-01', fieldId: 'f1', seasonId: 's1', crop: 'Paddy', quantity: 40, saleAmount: 10000,
  receivedByMemberId: 'a', receivers: [{ memberId: 'a', amount: 6000 }, { memberId: 'b', amount: 4000 }],
};

describe('a stock purchase paid by several partners', () => {
  it('records each partner’s funding of the stock', () => {
    const [item] = computeStockLevels([stockItem], [sharedPurchase], []);
    expect(item.fundingByMember).toEqual({ a: 600, b: 400 });
  });

  it('charges the stock used in a cycle to the funders in proportion', () => {
    const [item] = computeStockLevels([stockItem], [sharedPurchase], []);
    const { shares } = splitStockCostByFunder(item, 500);
    expect(shares.find(s => s.memberId === 'a')!.amount).toBeCloseTo(300);
    expect(shares.find(s => s.memberId === 'b')!.amount).toBeCloseTo(200);
  });

  it('flows into the cycle ledger when the stock is used', () => {
    const usage = { id: 'u1', stockItemId: 'st1', quantityUsed: 5, date: '2026-06-25', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' } as any;
    const summary = buildSettlementLedger(fields as any, seasons as any, members, [], [], [], [usage], [stockItem], [sharedPurchase], ['s1'], [], []);
    const s1 = summary.ledgers[0];
    expect(s1.statements.find(s => s.memberId === 'a')!.paidAmount).toBeCloseTo(300);
    expect(s1.statements.find(s => s.memberId === 'b')!.paidAmount).toBeCloseTo(200);
    expect(summary.isBalanced).toBe(true);
  });

  it('is checked when validated, and named for each partner', () => {
    expect(validatePurchase(sharedPurchase).valid).toBe(true);
    expect(validatePurchase({ ...sharedPurchase, payers: [{ memberId: 'a', amount: 600 }, { memberId: 'b', amount: 100 }] }).valid).toBe(false);
    expect(isNamedPayer(sharedPurchase, 'b')).toBe(true);
    expect(describePayers(sharedPurchase, 1000, members, '₹')).toBe('Ramesh ₹600, Ganapathi ₹400');
  });

  it('shows in each partner’s own stock purchases as their part', () => {
    const summary = buildSettlementLedger(fields as any, seasons as any, members, [], [], [], [], [stockItem], [sharedPurchase], ['s1'], [], []);
    const ledger = buildPartnerLedger({
      memberId: 'b', seasonIds: ['s1'], summary, members, fields: fields as any, seasons: seasons as any,
      expenses: [], labours: [], revenues: [], usages: [], stockItems: [stockItem], purchases: [sharedPurchase],
    });
    expect(ledger.stockPurchases).toHaveLength(1);
    expect(ledger.stockPurchases[0].totalCost).toBeCloseTo(400);
    expect(ledger.stockPurchases[0].quantity).toBeCloseTo(4);
  });

  it('survives a push and a pull of the sheet', () => {
    const [back] = parseSheetRows<StockPurchase>(toSheetRows([sharedPurchase], SHEET_COLUMNS.purchases));
    expect(back.payers).toEqual(sharedPurchase.payers);
  });
});

describe('a harvest sale received by several partners', () => {
  it('is split by who got what', () => {
    expect(receiptsFor(sale, 10000)).toEqual([{ memberId: 'a', amount: 6000 }, { memberId: 'b', amount: 4000 }]);
    expect(amountReceivedBy(sale, 10000, 'b')).toBe(4000);
    expect(isNamedReceiver(sale, 'b')).toBe(true);
    expect(isNamedReceiver(sale, 'c')).toBe(false);
    expect(describeReceivers(sale, 10000, members, '₹')).toBe('Ramesh ₹6,000, Ganapathi ₹4,000');
  });

  it('counts as received by each partner in the settlement, which still balances', () => {
    const summary = buildSettlementLedger(fields as any, seasons as any, members, [together], [], [sale], [], [], [], ['s1'], [], []);
    const s1 = summary.ledgers[0];
    expect(s1.statements.find(s => s.memberId === 'a')!.receivedAmount).toBe(6000);
    expect(s1.statements.find(s => s.memberId === 'b')!.receivedAmount).toBe(4000);
    expect(summary.isBalanced).toBe(true);
  });

  it('shows each partner’s part in their ledger and the Money list', () => {
    const summary = buildSettlementLedger(fields as any, seasons as any, members, [], [], [sale], [], [], [], ['s1'], [], []);
    const ledger = buildPartnerLedger({
      memberId: 'b', seasonIds: ['s1'], summary, members, fields: fields as any, seasons: seasons as any,
      expenses: [], labours: [], revenues: [sale], usages: [], stockItems: [], purchases: [],
    });
    expect(ledger.lines.find(l => l.id === 'r1')!.received).toBe(4000);

    const items = buildLedgerItems({ expenses: [], labours: [], revenues: [sale], fields: fields as any, seasons: seasons as any, members, creditAccounts: [], currency: '₹' });
    expect(items[0].party).toBe('Ramesh ₹6,000, Ganapathi ₹4,000');
    expect(filterLedger(items, { filterType: 'all', filterFieldId: 'all', filterMemberId: 'b' })).toHaveLength(1);
  });

  it('is checked when validated, with wording about what was received', () => {
    expect(validateRevenue(sale).valid).toBe(true);
    const bad = validateRevenue({ ...sale, receivers: [{ memberId: 'a', amount: 6000 }, { memberId: 'b', amount: 3000 }] });
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/amounts received are short of the total by 1000\.00/);
  });

  it('survives a push and a pull of the sheet', () => {
    const [back] = parseSheetRows<HarvestRevenue>(toSheetRows([sale], SHEET_COLUMNS.revenues));
    expect(back.receivers).toEqual(sale.receivers);
  });
});

describe('Money tab: recording a harvest sale received by several partners', () => {
  it('saves what each partner received', () => {
    const onAdd = vi.fn((_r: HarvestRevenue) => true);
    render(
      <LanguageProvider>
        <MoneyTab
          expenses={[]} labours={[]} revenues={[]} fields={fields as any}
          seasons={seasons as any} members={members} activities={[]} currency="₹" creditAccounts={[]}
          onAddExpense={vi.fn(() => true)} onEditExpense={vi.fn(() => true)} onDeleteExpense={vi.fn()}
          onAddLabour={vi.fn(() => true)} onEditLabour={vi.fn(() => true)} onDeleteLabour={vi.fn()}
          onAddRevenue={onAdd} onEditRevenue={vi.fn(() => true)} onDeleteRevenue={vi.fn()}
        />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByText('+ New Entry'));
    fireEvent.click(screen.getByText('Log Harvest Revenue'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 150000'), { target: { value: '10000' } });
    fireEvent.click(screen.getByText('Received by more than one partner'));
    const form = within(screen.getByRole('dialog'));
    fireEvent.click(form.getByLabelText('Ganapathi'));
    fireEvent.change(form.getByLabelText('Amount received by Ramesh'), { target: { value: '6000' } });
    fireEvent.change(form.getByLabelText('Amount received by Ganapathi'), { target: { value: '4000' } });
    fireEvent.submit(screen.getByPlaceholderText('e.g. 150000').closest('form')!);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].receivedByMemberId).toBe('a');
    expect(onAdd.mock.calls[0][0].receivers).toEqual([{ memberId: 'a', amount: 6000 }, { memberId: 'b', amount: 4000 }]);
  });

  it('does not let a half-made split carry over from the expense tab', () => {
    render(
      <LanguageProvider>
        <MoneyTab
          expenses={[]} labours={[]} revenues={[]} fields={fields as any}
          seasons={seasons as any} members={members} activities={[]} currency="₹" creditAccounts={[]}
          onAddExpense={vi.fn(() => true)} onEditExpense={vi.fn(() => true)} onDeleteExpense={vi.fn()}
          onAddLabour={vi.fn(() => true)} onEditLabour={vi.fn(() => true)} onDeleteLabour={vi.fn()}
          onAddRevenue={vi.fn(() => true)} onEditRevenue={vi.fn(() => true)} onDeleteRevenue={vi.fn()}
        />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByText('+ New Entry'));
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    fireEvent.click(screen.getByText('Log Harvest Revenue'));
    expect(screen.getByText('Received by more than one partner')).toBeTruthy();
    expect(screen.queryByText('Back to one payer')).toBeNull();
  });
});

describe('Stock tab: recording a purchase paid by several partners', () => {
  it('saves what each partner paid', () => {
    const onAddPurchase = vi.fn();
    render(
      <LanguageProvider>
        <StockTab
          stockItems={[stockItem]} purchases={[]} usages={[]} fields={fields as any} seasons={seasons as any}
          members={members} activities={[]} currency="₹"
          onAddStockItem={vi.fn()} onUpdateStockItem={vi.fn()} onAddPurchase={onAddPurchase}
          onUpdatePurchase={vi.fn()} onAddUsage={vi.fn()} onUpdateUsage={vi.fn()}
        />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByText('Record Ledger'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 20'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 7000'), { target: { value: '1000' } });
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    const form = within(screen.getByRole('dialog'));
    fireEvent.click(form.getByLabelText('Ganapathi'));
    fireEvent.change(form.getByLabelText('Amount paid by Ramesh'), { target: { value: '600' } });
    fireEvent.change(form.getByLabelText('Amount paid by Ganapathi'), { target: { value: '400' } });
    fireEvent.submit(screen.getByPlaceholderText('e.g. 7000').closest('form')!);

    expect(onAddPurchase).toHaveBeenCalledTimes(1);
    expect(onAddPurchase.mock.calls[0][0].paidByMemberId).toBe('a');
    expect(onAddPurchase.mock.calls[0][0].payers).toEqual([{ memberId: 'a', amount: 600 }, { memberId: 'b', amount: 400 }]);
  });

  it('refuses amounts that do not add up to the bill', () => {
    const onAddPurchase = vi.fn();
    render(
      <LanguageProvider>
        <StockTab
          stockItems={[stockItem]} purchases={[]} usages={[]} fields={fields as any} seasons={seasons as any}
          members={members} activities={[]} currency="₹"
          onAddStockItem={vi.fn()} onUpdateStockItem={vi.fn()} onAddPurchase={onAddPurchase}
          onUpdatePurchase={vi.fn()} onAddUsage={vi.fn()} onUpdateUsage={vi.fn()}
        />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByText('Record Ledger'));
    fireEvent.change(screen.getByPlaceholderText('e.g. 20'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 7000'), { target: { value: '1000' } });
    fireEvent.click(screen.getByText('Paid by more than one partner'));
    const form = within(screen.getByRole('dialog'));
    fireEvent.click(form.getByLabelText('Ganapathi'));
    fireEvent.change(form.getByLabelText('Amount paid by Ramesh'), { target: { value: '600' } });
    fireEvent.change(form.getByLabelText('Amount paid by Ganapathi'), { target: { value: '100' } });
    fireEvent.submit(screen.getByPlaceholderText('e.g. 7000').closest('form')!);

    expect(onAddPurchase).not.toHaveBeenCalled();
    expect(screen.getByText(/short of the total by 300\.00/)).toBeTruthy();
  });
});
