/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Member, Payment } from '../types';

/** What a cost entry needs for this module to say who paid. */
export interface PaidRecord {
  isCredit?: boolean;
  paidByMemberId?: string;
  payers?: Payment[];
}

const PAISE = 0.005;

/**
 * Who paid an entry, and how much each. An entry paid by one partner is just
 * `paidByMemberId`; one paid by several also lists `payers`. A credit entry
 * was financed by the creditor, so nobody has paid it yet (partners are
 * credited as they repay, see creditBills.ts).
 *
 * If the listed amounts no longer add up to the entry's total (it was edited
 * elsewhere, or a sheet was changed by hand) they are scaled to the total in
 * the same proportions, so the ledger always credits exactly what was spent.
 */
export function paymentsFor(record: PaidRecord, total: number): Payment[] {
  if (record.isCredit) return [];
  return normalise(record.payers, record.paidByMemberId, total);
}

/**
 * The listed amounts, scaled to `total` if they have drifted from it, with a
 * partner named twice added up. With no list, the one fallback partner has it all.
 */
function normalise(list: Payment[] | undefined, fallbackMemberId: string | undefined, total: number): Payment[] {
  const listed = (list || []).filter(p => p && p.memberId && p.amount > 0);
  const listedTotal = listed.reduce((sum, p) => sum + p.amount, 0);
  if (listed.length === 0 || listedTotal <= 0) {
    return fallbackMemberId ? [{ memberId: fallbackMemberId, amount: total }] : [];
  }

  const scale = Math.abs(listedTotal - total) < PAISE ? 1 : total / listedTotal;
  const byMember = new Map<string, number>();
  listed.forEach(p => byMember.set(p.memberId, (byMember.get(p.memberId) || 0) + p.amount * scale));
  return [...byMember.entries()].map(([memberId, amount]) => ({ memberId, amount }));
}

/** What a harvest sale needs for this module to say who received it. */
export interface ReceivedRecord {
  receivedByMemberId?: string;
  receivers?: Payment[];
}

/** Who received the money from a harvest sale, and how much each: the same
 * idea as `paymentsFor`, for the other direction. */
export function receiptsFor(record: ReceivedRecord, total: number): Payment[] {
  return normalise(record.receivers, record.receivedByMemberId, total);
}

export function amountReceivedBy(record: ReceivedRecord, total: number, memberId: string): number {
  return receiptsFor(record, total)
    .filter(p => p.memberId === memberId)
    .reduce((sum, p) => sum + p.amount, 0);
}

export function isNamedReceiver(record: ReceivedRecord, memberId: string): boolean {
  return record.receivedByMemberId === memberId || (record.receivers || []).some(p => p.memberId === memberId);
}

/** What one partner paid towards an entry. */
export function amountPaidBy(record: PaidRecord, total: number, memberId: string): number {
  return paymentsFor(record, total)
    .filter(p => p.memberId === memberId)
    .reduce((sum, p) => sum + p.amount, 0);
}

/** The part of an entry (0 to 1) a partner paid; apply it to a crop cycle's share of a split entry. */
export function shareOfPaymentBy(record: PaidRecord, total: number, memberId: string): number {
  return total > 0 ? amountPaidBy(record, total, memberId) / total : 0;
}

/** True when the partner is named on the entry, as sole payer or one of several. */
export function isNamedPayer(record: PaidRecord, memberId: string): boolean {
  return record.paidByMemberId === memberId || (record.payers || []).some(p => p.memberId === memberId);
}

/**
 * The payers list to store for what a form collected: nothing for a single
 * payer (the plain `paidByMemberId` says it all), the list for several.
 */
export function payersToStore(payments: Payment[]): Payment[] | undefined {
  const real = payments.filter(p => p.memberId && p.amount > 0);
  return real.length > 1 ? real.map(p => ({ memberId: p.memberId, amount: Number(p.amount.toFixed(2)) })) : undefined;
}

/** Why a set of payments cannot be saved against `total`, or null if it can. */
export function payersProblem(payments: Payment[], total: number, verb: 'paid' | 'received' = 'paid'): string | null {
  const real = payments.filter(p => p.amount > 0);
  if (real.length === 0) return `Enter what at least one partner ${verb}.`;
  if (real.some(p => !p.memberId)) return `Choose which partner each amount was ${verb === 'paid' ? 'paid by' : 'received by'}.`;
  if (new Set(real.map(p => p.memberId)).size !== real.length) return 'List each partner once.';
  const paid = real.reduce((sum, p) => sum + p.amount, 0);
  if (Math.abs(paid - total) > 0.01) {
    const diff = Number((paid - total).toFixed(2));
    return `The ${verb === 'paid' ? 'payments' : 'amounts received'} are ${diff > 0 ? 'over' : 'short of'} the total by ${Math.abs(diff).toFixed(2)}. They must add up to exactly ${total.toFixed(2)}.`;
  }
  return null;
}

/**
 * Who is named on an entry, for display: the partner's name, or each partner
 * with their amount when several are. `scaleTo` shows a crop cycle's share of
 * a split entry instead of the whole thing.
 */
function describe(
  payments: Payment[],
  fallbackMemberId: string | undefined,
  total: number,
  members: Member[],
  currency: string,
  unknownLabel: string,
  scaleTo?: number
): string {
  const nameOf = (id: string) => members.find(m => m.id === id)?.name || unknownLabel;
  if (payments.length === 0) return nameOf(fallbackMemberId || '');
  if (payments.length === 1) return nameOf(payments[0].memberId);
  const factor = scaleTo !== undefined && total > 0 ? scaleTo / total : 1;
  return payments
    .map(p => `${nameOf(p.memberId)} ${currency}${Math.round(p.amount * factor).toLocaleString('en-IN')}`)
    .join(', ');
}

export function describePayers(record: PaidRecord, total: number, members: Member[], currency: string, unknownLabel = 'Unknown', scaleTo?: number): string {
  return describe(paymentsFor(record, total), record.paidByMemberId, total, members, currency, unknownLabel, scaleTo);
}

export function describeReceivers(record: ReceivedRecord, total: number, members: Member[], currency: string, unknownLabel = 'Unknown', scaleTo?: number): string {
  return describe(receiptsFor(record, total), record.receivedByMemberId, total, members, currency, unknownLabel, scaleTo);
}

/** One partner's line in a form asking who paid (or received): ticked if they did, and the amount. */
export interface PayerRow {
  memberId: string;
  paid: boolean;
  amount: string;
}

/**
 * What a form collected, as the fields to store: the single chosen partner, or
 * the ticked partners with their amounts. `error` says why it cannot be saved.
 * The first partner listed becomes the entry's main payer, which older code
 * and a sheet without the payers column read.
 */
export function resolvePayers(
  input: { split: boolean; rows: PayerRow[]; single: string; total: number; verb?: 'paid' | 'received' }
): { memberId: string; payers?: Payment[]; error?: string } {
  if (!input.split) return { memberId: input.single };
  const payments = input.rows
    .filter(row => row.paid)
    .map(row => ({ memberId: row.memberId, amount: parseFloat(row.amount) || 0 }))
    .filter(payment => payment.amount > 0);
  const problem = payersProblem(payments, input.total, input.verb);
  if (problem) return { memberId: '', error: problem };
  return { memberId: payments[0].memberId, payers: payersToStore(payments) };
}
