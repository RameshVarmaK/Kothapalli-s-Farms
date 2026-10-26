/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describePayers, describeReceivers, isNamedPayer, isNamedReceiver } from './payers';
import { Expense, Labour, HarvestRevenue, Field, Season, Member, CreditAccount } from '../types';

export type LedgerItemType = 'expense' | 'labour' | 'revenue';

interface LedgerItemBase {
  id: string;
  date: string;
  description: string;
  subtext: string;
  amount: number;
  party: string;
  fieldSeasonName: string;
}

/** One ledger row. `type` says which record `rawRecord` is. */
export type LedgerItem =
  | (LedgerItemBase & { type: 'expense'; rawRecord: Expense })
  | (LedgerItemBase & { type: 'labour'; rawRecord: Labour })
  | (LedgerItemBase & { type: 'revenue'; rawRecord: HarvestRevenue });

export interface LedgerFilters {
  filterType: 'all' | LedgerItemType;
  filterFieldId: string;
  filterMemberId: string;
}

interface LedgerSources {
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  fields: Field[];
  seasons: Season[];
  members: Member[];
  creditAccounts: CreditAccount[];
  currency: string;
}

/** Folds expenses, labour and harvest sales into one list of ledger rows. */
export function buildLedgerItems({
  expenses, labours, revenues, fields, seasons, members, creditAccounts, currency
}: LedgerSources): LedgerItem[] {
  const ledgerItems: LedgerItem[] = [];

  // Parse expenses
  expenses.forEach(e => {
    let payer = '';
    if (e.isCredit) {
      const creditor = creditAccounts.find(c => c.id === e.creditAccountId);
      payer = creditor ? `Credit: ${creditor.name}` : 'Credit';
    } else {
      payer = describePayers(e, e.amount, members, currency);
    }
    let fieldSeasonName = 'Common / All';
    if (e.targetType === 'single' && e.targetSeasonId) {
      const s = seasons.find(sea => sea.id === e.targetSeasonId);
      const f = fields.find(fd => fd.id === e.targetFieldId);
      fieldSeasonName = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';
    } else if (e.targetType === 'common' && e.allocations) {
      const activeAllocFields = e.allocations.map(al => fields.find(f => f.id === al.fieldId)?.name || '').filter(Boolean);
      fieldSeasonName = `Common Split (${activeAllocFields.join(', ')})`;
    }

    ledgerItems.push({
      id: e.id,
      type: 'expense',
      date: e.date,
      description: e.category,
      subtext: e.isCredit ? payer : `Paid by ${payer}`,
      amount: e.amount,
      party: payer,
      fieldSeasonName,
      rawRecord: e
    });
  });

  // Parse labour
  labours.forEach(l => {
    let payer = '';
    if (l.isCredit) {
      const creditor = creditAccounts.find(c => c.id === l.creditAccountId);
      payer = creditor ? `Credit: ${creditor.name}` : 'Credit';
    } else {
      payer = describePayers(l, l.totalCost, members, currency);
    }
    let fieldSeasonName = 'Common / All';
    if (l.targetType !== 'common' && l.seasonId) {
      const s = seasons.find(sea => sea.id === l.seasonId);
      const f = fields.find(fd => fd.id === l.fieldId);
      fieldSeasonName = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';
    } else if (l.targetType === 'common' && l.allocations) {
      const activeAllocFields = l.allocations.map(al => fields.find(f => f.id === al.fieldId)?.name || '').filter(Boolean);
      fieldSeasonName = `Common Split (${activeAllocFields.join(', ')})`;
    }

    ledgerItems.push({
      id: l.id,
      type: 'labour',
      date: l.date,
      description: l.description
        ? `Labour: ${l.description} (${l.workersCount} worker(s) at ${currency}${l.wageRate})`
        : `Labour (${l.workersCount} worker(s) at ${currency}${l.wageRate})`,
      subtext: l.isCredit ? payer : `Paid by ${payer}`,
      amount: l.totalCost,
      party: payer,
      fieldSeasonName,
      rawRecord: l
    });
  });

  // Parse revenue
  revenues.forEach(r => {
    const receiver = describeReceivers(r, r.saleAmount, members, currency);
    const s = seasons.find(sea => sea.id === r.seasonId);
    const f = fields.find(fd => fd.id === r.fieldId);
    const fieldSeasonName = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';

    ledgerItems.push({
      id: r.id,
      type: 'revenue',
      date: r.date,
      description: `Harvest Sale: ${r.crop} (${r.quantity} sold)`,
      subtext: `Received by ${receiver} ${r.buyerName ? `from ${r.buyerName}` : ''}`,
      amount: r.saleAmount,
      party: receiver,
      fieldSeasonName,
      rawRecord: r
    });
  });

  return ledgerItems;
}

/** The rows that pass the type, field and partner filters, newest first. */
export function filterLedger(ledgerItems: LedgerItem[], { filterType, filterFieldId, filterMemberId }: LedgerFilters): LedgerItem[] {
  return ledgerItems
    .filter(item => {
      const typeMatches = filterType === 'all' || item.type === filterType;
      return typeMatches && matchesField(item, filterFieldId) && matchesMember(item, filterMemberId);
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

const touchesField = (allocations: { fieldId: string }[] | undefined, fieldId: string) =>
  allocations?.some(al => al.fieldId === fieldId) || false;

function matchesField(item: LedgerItem, fieldId: string): boolean {
  if (fieldId === 'all') return true;
  switch (item.type) {
    case 'expense':
      return item.rawRecord.targetType === 'single'
        ? item.rawRecord.targetFieldId === fieldId
        : touchesField(item.rawRecord.allocations, fieldId);
    case 'labour':
      return item.rawRecord.targetType === 'common'
        ? touchesField(item.rawRecord.allocations, fieldId)
        : item.rawRecord.fieldId === fieldId;
    case 'revenue':
      return item.rawRecord.fieldId === fieldId;
  }
}

function matchesMember(item: LedgerItem, memberId: string): boolean {
  if (memberId === 'all') return true;
  return item.type === 'revenue'
    ? isNamedReceiver(item.rawRecord, memberId)
    : isNamedPayer(item.rawRecord, memberId);
}
