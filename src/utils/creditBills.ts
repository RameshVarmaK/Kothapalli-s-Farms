/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreditRepayment, Expense, Labour, RepaymentBillAllocation } from '../types';

/**
 * A "bill" is one expense or labour entry bought on a creditor's account.
 * Repayments are made to the account; this works out how much of each one has
 * been paid, and by whom, so the settlement ledger, the reports and the Credits
 * tab all tell the same story.
 */
export interface CreditBill {
  key: string;
  kind: 'expense' | 'labour';
  id: string;
  date: string;
  /** What it was for, for the list a payer ticks from. */
  label: string;
  amount: number;
  /** How much of the bill sits in a crop cycle (all of it, a split share, or none). */
  amountInSeason: (seasonId: string) => number;
}

export const billKey = (kind: CreditBill['kind'], id: string) => `${kind}:${id}`;

const EPS = 0.005;

/** The account's bills, oldest first. */
export function creditBills(accountId: string, expenses: Expense[], labours: Labour[]): CreditBill[] {
  const bills: CreditBill[] = [];

  expenses.filter(e => e.isCredit && e.creditAccountId === accountId).forEach(e => {
    bills.push({
      key: billKey('expense', e.id),
      kind: 'expense',
      id: e.id,
      date: e.date,
      label: e.category,
      amount: e.amount,
      amountInSeason: seasonId =>
        e.targetType === 'single'
          ? (e.targetSeasonId === seasonId ? e.amount : 0)
          : (e.allocations?.find(al => al.seasonId === seasonId)?.amount ?? 0),
    });
  });

  labours.filter(l => l.isCredit && l.creditAccountId === accountId).forEach(l => {
    bills.push({
      key: billKey('labour', l.id),
      kind: 'labour',
      id: l.id,
      date: l.date,
      label: l.description ? `Labour: ${l.description}` : 'Labour',
      amount: l.totalCost,
      amountInSeason: seasonId =>
        l.targetType !== 'common'
          ? (l.seasonId === seasonId ? l.totalCost : 0)
          : (l.allocations?.find(al => al.seasonId === seasonId)?.amount ?? 0),
    });
  });

  return bills.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** billKey → memberId → what that partner has paid towards the bill. */
export type RepaymentAttribution = Map<string, Map<string, number>>;

/**
 * Spreads one creditor account's repayments over its bills.
 *
 * Money a payer pointed at specific bills goes to those bills first, taken in
 * date order and never past what a bill is for. Whatever is left of a payment
 * (all of it for a payment that named no bill) settles the oldest unpaid bill,
 * then the next, as paying a creditor normally works. A bill never takes more
 * than it is for: once every bill is covered, the excess is an advance, kept
 * out of the crop cycles until a later bill gives it somewhere to go.
 * Amounts are left unrounded.
 */
export function attributeRepayments(bills: CreditBill[], repayments: CreditRepayment[]): RepaymentAttribution {
  return attributeRepaymentsDetailed(bills, repayments).byBill;
}

/** The same attribution, also broken down by which payment each amount came from. */
export interface DetailedAttribution {
  byBill: RepaymentAttribution;
  /** repaymentId → billKey → amount. What is left of a payment is its advance. */
  byRepayment: Map<string, Map<string, number>>;
}

export function attributeRepaymentsDetailed(bills: CreditBill[], repayments: CreditRepayment[]): DetailedAttribution {
  const attribution: RepaymentAttribution = new Map(bills.map(b => [b.key, new Map<string, number>()]));
  const byRepayment = new Map<string, Map<string, number>>(repayments.map(r => [r.id, new Map<string, number>()]));
  const room = new Map(bills.map(b => [b.key, b.amount]));
  const untagged: { repaymentId: string; memberId: string; amount: number }[] = [];
  const add = (billKeyValue: string, memberId: string, amount: number, repaymentId: string) => {
    const byMember = attribution.get(billKeyValue)!;
    byMember.set(memberId, (byMember.get(memberId) || 0) + amount);
    const perBill = byRepayment.get(repaymentId)!;
    perBill.set(billKeyValue, (perBill.get(billKeyValue) || 0) + amount);
  };

  const ordered = [...repayments].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const rep of ordered) {
    let left = rep.amount;
    for (const alloc of rep.billAllocations || []) {
      const free = room.get(alloc.billKey);
      if (free === undefined) continue; // the bill was deleted or moved to another account
      const applied = Math.min(alloc.amount, free, left);
      if (applied <= 0) continue;
      add(alloc.billKey, rep.memberId, applied, rep.id);
      room.set(alloc.billKey, free - applied);
      left -= applied;
    }
    if (left > 0) untagged.push({ repaymentId: rep.id, memberId: rep.memberId, amount: left });
  }

  // Untagged money, in the order it was paid, clears the oldest unpaid bill
  // first. Done after every ticked payment so those keep their bills.
  for (const payment of untagged) {
    let left = payment.amount;
    for (const b of bills) {
      if (left <= EPS) break;
      const free = room.get(b.key)!;
      if (free <= EPS) continue;
      const applied = Math.min(left, free);
      add(b.key, payment.memberId, applied, payment.repaymentId);
      room.set(b.key, free - applied);
      left -= applied;
    }
  }

  return { byBill: attribution, byRepayment };
}

/** What a bill has had paid towards it, by all partners. */
export function paidOnBill(attribution: RepaymentAttribution, key: string): number {
  let total = 0;
  attribution.get(key)?.forEach(v => { total += v; });
  return total;
}

export function billOutstanding(bill: CreditBill, attribution: RepaymentAttribution): number {
  return Math.max(0, Number((bill.amount - paidOnBill(attribution, bill.key)).toFixed(2)));
}

/**
 * Splits a payment over the bills a payer ticked: oldest first, no more than
 * each still owes. Returns the explicit amounts to store and what is left over
 * (which stays untagged and is spread over the account like any other payment).
 * `outstanding` is each bill's balance without this payment counted.
 */
export function allocateToBills(
  amount: number,
  tickedKeys: string[],
  bills: CreditBill[],
  outstanding: (key: string) => number
): { allocations: RepaymentBillAllocation[]; leftover: number } {
  const allocations: RepaymentBillAllocation[] = [];
  let left = amount;
  for (const bill of bills) {
    if (!tickedKeys.includes(bill.key) || left <= 0) continue;
    const take = Math.min(left, outstanding(bill.key));
    if (take <= 0) continue;
    const rounded = Number(take.toFixed(2));
    allocations.push({ billKey: bill.key, amount: rounded });
    left = Number((left - rounded).toFixed(2));
  }
  return { allocations, leftover: Math.max(0, left) };
}

/**
 * How much of what is still owed to creditors falls in the given crop cycles:
 * credit bills not yet paid for, which no partner has funded yet. This is the
 * exact amount by which the settlement's partner positions fall short of
 * summing to zero while credit is outstanding.
 */
export function unpaidCreditInSeasons(
  expenses: Expense[],
  labours: Labour[],
  repayments: CreditRepayment[],
  seasonIds: string[]
): number {
  const accountIds = new Set<string>();
  expenses.forEach(e => { if (e.isCredit && e.creditAccountId) accountIds.add(e.creditAccountId); });
  labours.forEach(l => { if (l.isCredit && l.creditAccountId) accountIds.add(l.creditAccountId); });

  let total = 0;
  accountIds.forEach(accountId => {
    const bills = creditBills(accountId, expenses, labours);
    const attribution = attributeRepayments(bills, repayments.filter(r => r.creditAccountId === accountId));
    bills.forEach(bill => {
      if (bill.amount <= 0) return;
      const unpaidFraction = billOutstanding(bill, attribution) / bill.amount;
      seasonIds.forEach(seasonId => { total += bill.amountInSeason(seasonId) * unpaidFraction; });
    });
  });
  return Number(total.toFixed(2));
}

/**
 * What each partner has paid to creditors that is not on any bill yet:
 * payments made before the bills they are for were entered, or more than the
 * bills come to. It is not charged to a crop cycle, so it is missing from the
 * settlement positions, until bills exist for it to go onto (it then does so
 * by itself). Not tied to any cycle, so not filtered by one.
 */
export function advancesByPartner(
  expenses: Expense[],
  labours: Labour[],
  repayments: CreditRepayment[]
): { total: number; byMember: Map<string, number> } {
  const byMember = new Map<string, number>();
  const accountIds = new Set(repayments.map(r => r.creditAccountId));

  accountIds.forEach(accountId => {
    const bills = creditBills(accountId, expenses, labours);
    const ofAccount = repayments.filter(r => r.creditAccountId === accountId);
    const attribution = attributeRepayments(bills, ofAccount);

    const paid = new Map<string, number>();
    ofAccount.forEach(r => paid.set(r.memberId, (paid.get(r.memberId) || 0) + r.amount));
    paid.forEach((amountPaid, memberId) => {
      let applied = 0;
      bills.forEach(b => { applied += attribution.get(b.key)?.get(memberId) || 0; });
      const advance = amountPaid - applied;
      if (advance > 0.005) byMember.set(memberId, (byMember.get(memberId) || 0) + advance);
    });
  });

  const total = Number([...byMember.values()].reduce((sum, v) => sum + v, 0).toFixed(2));
  return { total, byMember };
}
