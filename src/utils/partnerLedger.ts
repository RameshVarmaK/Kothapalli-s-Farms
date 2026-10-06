/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Member,
  Field,
  Season,
  Expense,
  Labour,
  HarvestRevenue,
  StockUsage,
  StockItem,
  StockPurchase,
  CreditAccount,
  CreditRepayment,
  SettlementClearance,
  SettlementSummary,
  PaidBreakdown,
} from '../types';
import { computeStockLevels, splitStockCostByFunder, simplifySeasonDebts } from './calculations';

// Re-exported for existing importers; the pairing now lives in calculations.
export { simplifySeasonDebts };

/**
 * One partner's ledger: what they put in and took out, cycle by cycle and
 * line by line, for the partner report.
 *
 * The headline figures are not recomputed here. They are read straight from
 * the settlement engine's statements (the ones the Settle tab settles on), so
 * this report cannot disagree with it. The transaction lines are the detail
 * behind those figures, attributed to the selected cycles with the engine's
 * own rules, so they add up to the same totals.
 */

export type PartnerLineKind = 'expense' | 'labour' | 'stock' | 'credit-repayment' | 'revenue';

export interface PartnerLedgerLine {
  id: string;
  date: string;
  kind: PartnerLineKind;
  /** Category, stock item, creditor or buyer — what the line was for. */
  detail: string;
  /** The cycles in scope this line was charged to, as "Crop · Field". */
  cycles: string[];
  /** True when the record was split across several cycles. */
  isSplit: boolean;
  /** Labour lines only: the crew and rate behind the cost. */
  workers?: { count: number; wageRate: number };
  paidIn: number;
  received: number;
}

export interface PartnerSettlement {
  counterpartyId: string;
  counterpartyName: string;
  /** 'pays' — this partner owes the counterparty; 'receives' — the reverse. */
  direction: 'pays' | 'receives';
  amount: number;
  /** Ticked "transferred" on the Settle tab. */
  cleared: boolean;
}

export interface PartnerCycleRow {
  seasonId: string;
  cropName: string;
  fieldName: string;
  isClosed: boolean;
  startDate: string;
  endDate?: string;
  sharePercentage: number;
  paidAmount: number;
  costShare: number;
  receivedAmount: number;
  revenueShare: number;
  netPosition: number;
  settlements: PartnerSettlement[];
}

export interface PartnerStockPurchase {
  id: string;
  date: string;
  itemName: string;
  quantity: number;
  unit: string;
  totalCost: number;
}

/** A payment this partner made to a creditor, at its full amount. */
export interface PartnerCreditPayment {
  id: string;
  date: string;
  creditorName: string;
  notes?: string;
  amount: number;
  /** The part of it this report counts toward the cycles in scope — the
   * share of that creditor's credit those cycles used. Less than `amount`
   * when the credit also covered other cycles; 0 when none of it did. */
  countedInScope: number;
}

export interface PartnerLedger {
  memberId: string;
  memberName: string;
  cycles: PartnerCycleRow[];
  lines: PartnerLedgerLine[];
  /** Stock bought with this partner's money. Informational: a purchase only
   * counts toward a cycle when the stock is used there (the "stock" lines). */
  stockPurchases: PartnerStockPurchase[];
  /** Every payment the partner made to a creditor, newest last. */
  creditPayments: PartnerCreditPayment[];
  totals: {
    paidIn: number;
    costShare: number;
    received: number;
    revenueShare: number;
    netPosition: number;
    breakdown: PaidBreakdown;
  };
}

export interface PartnerLedgerInput {
  memberId: string;
  /** The cycles the report covers. */
  seasonIds: string[];
  summary: SettlementSummary;
  members: Member[];
  fields: Field[];
  seasons: Season[];
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  usages: StockUsage[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  settlementClearances?: SettlementClearance[];
}

/** A record's list field, or [] when it is missing or not a list (an older
 * pull could leave '' in a blank cell). */
function asList<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function buildPartnerLedger(input: PartnerLedgerInput): PartnerLedger {
  const {
    memberId,
    seasonIds,
    summary,
    members,
    fields,
    seasons,
    expenses,
    labours,
    revenues,
    usages,
    stockItems,
    purchases,
    creditRepayments = [],
    settlementClearances = [],
  } = input;

  const inScope = new Set(seasonIds);
  const member = members.find(m => m.id === memberId);
  const memberName = member?.name || 'Unknown';
  const clearedSubKeys = new Set(settlementClearances.filter(c => c.scope === 'sub').map(c => c.key));

  const seasonLabel = (seasonId: string) => {
    const season = seasons.find(s => s.id === seasonId);
    const field = fields.find(f => f.id === season?.fieldId);
    return `${season?.cropName || 'Unknown'} · ${field?.name || 'Unknown field'}`;
  };

  // ---- Per-cycle rows, straight from the engine ----
  const cycles: PartnerCycleRow[] = summary.ledgers
    .filter(l => inScope.has(l.seasonId))
    .map(ledger => {
      const stmt = ledger.statements.find(s => s.memberId === memberId);
      const season = seasons.find(s => s.id === ledger.seasonId);
      const share = (stmt?.sharePercentage || 0) / 100;
      const settlements: PartnerSettlement[] = simplifySeasonDebts(ledger)
        .filter(d => d.fromId === memberId || d.toId === memberId)
        .map(d => {
          const pays = d.fromId === memberId;
          return {
            counterpartyId: pays ? d.toId : d.fromId,
            counterpartyName: pays ? d.toName : d.fromName,
            direction: pays ? 'pays' : 'receives',
            amount: d.amount,
            cleared: clearedSubKeys.has(`${ledger.seasonId}:${d.fromId}:${d.toId}`),
          };
        });
      return {
        seasonId: ledger.seasonId,
        cropName: ledger.cropName,
        fieldName: ledger.fieldName,
        isClosed: Boolean(season?.isClosed),
        startDate: season?.startDate || '',
        endDate: season?.endDate || undefined,
        sharePercentage: stmt?.sharePercentage || 0,
        paidAmount: stmt?.paidAmount || 0,
        costShare: share * ledger.totalExpense,
        receivedAmount: stmt?.receivedAmount || 0,
        revenueShare: share * ledger.totalRevenue,
        netPosition: stmt?.netPosition || 0,
        settlements,
      };
    })
    // A partner with no stake and no money in a cycle has nothing to report there.
    .filter(r => r.sharePercentage > 0 || r.paidAmount !== 0 || r.receivedAmount !== 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // ---- Transaction lines, attributed to the cycles in scope ----
  const lines: PartnerLedgerLine[] = [];

  // A single-target record counts in full when its cycle is in scope; a
  // common one counts only for its allocations to cycles in scope.
  const attribute = (
    single: { seasonId?: string; amount: number } | null,
    allocations: { seasonId: string; amount: number }[] | undefined
  ): { amount: number; cycles: string[]; isSplit: boolean } => {
    if (single) {
      return single.seasonId && inScope.has(single.seasonId)
        ? { amount: single.amount, cycles: [seasonLabel(single.seasonId)], isSplit: false }
        : { amount: 0, cycles: [], isSplit: false };
    }
    const hits = asList(allocations).filter(a => inScope.has(a.seasonId));
    return {
      amount: hits.reduce((sum, a) => sum + a.amount, 0),
      cycles: hits.map(a => seasonLabel(a.seasonId)),
      isSplit: true,
    };
  };

  expenses
    .filter(e => !e.isCredit && e.paidByMemberId === memberId)
    .forEach(e => {
      const { amount, cycles: c, isSplit } = attribute(
        e.targetType === 'single' ? { seasonId: e.targetSeasonId, amount: e.amount } : null,
        e.allocations
      );
      if (amount === 0) return;
      lines.push({ id: e.id, date: e.date, kind: 'expense', detail: e.category, cycles: c, isSplit, paidIn: amount, received: 0 });
    });

  labours
    .filter(l => !l.isCredit && l.paidByMemberId === memberId)
    .forEach(l => {
      const { amount, cycles: c, isSplit } = attribute(
        l.targetType !== 'common' ? { seasonId: l.seasonId, amount: l.totalCost } : null,
        l.allocations
      );
      if (amount === 0) return;
      lines.push({
        id: l.id,
        date: l.date,
        kind: 'labour',
        // What the crew did; older entries predate the description.
        detail: l.description || '',
        workers: { count: l.workersCount, wageRate: l.wageRate },
        cycles: c,
        isSplit,
        paidIn: amount,
        received: 0,
      });
    });

  // Stock counts toward a cycle when it is used there, at the partner's
  // share of whoever funded the pool — exactly as the engine credits it.
  const computedStock = computeStockLevels(stockItems, purchases, usages);
  usages.forEach(u => {
    const item = computedStock.find(si => si.id === u.stockItemId);
    const rate = item ? item.weightedAverageCost : 0;
    const memberShare = (cost: number) =>
      splitStockCostByFunder(item, cost).shares.find(s => s.memberId === memberId)?.amount || 0;

    const { amount, cycles: c, isSplit } = attribute(
      u.targetType === 'single' ? { seasonId: u.targetSeasonId, amount: memberShare(u.quantityUsed * rate) } : null,
      u.targetType === 'single' ? undefined : asList(u.allocations).map(a => ({ seasonId: a.seasonId, amount: memberShare(a.quantity * rate) }))
    );
    if (Math.abs(amount) < 0.005) return;
    lines.push({ id: u.id, date: u.date, kind: 'stock', detail: item?.name || 'Unknown item', cycles: c, isSplit, paidIn: amount, received: 0 });
  });

  // A repayment is made against a creditor, not a bill; the engine spreads it
  // over cycles by how much of that creditor's credit each cycle used.
  const creditPayments: PartnerCreditPayment[] = [];
  creditRepayments
    .filter(r => r.memberId === memberId)
    .forEach(rep => {
      const creditor = input.creditAccounts?.find(c => c.id === rep.creditAccountId);
      const payment: PartnerCreditPayment = {
        id: rep.id,
        date: rep.date,
        creditorName: creditor?.name || 'Creditor',
        notes: rep.notes || undefined,
        amount: rep.amount,
        countedInScope: 0,
      };
      creditPayments.push(payment);

      const credExp = expenses.filter(e => e.isCredit && e.creditAccountId === rep.creditAccountId);
      const credLab = labours.filter(l => l.isCredit && l.creditAccountId === rep.creditAccountId);
      const totalCredit =
        credExp.reduce((sum, e) => sum + e.amount, 0) + credLab.reduce((sum, l) => sum + l.totalCost, 0);
      if (totalCredit <= 0) return;

      const perSeason = new Map<string, number>();
      const add = (seasonId: string | undefined, amount: number) => {
        if (!seasonId || !inScope.has(seasonId)) return;
        perSeason.set(seasonId, (perSeason.get(seasonId) || 0) + amount);
      };
      credExp.forEach(e =>
        e.targetType === 'single' ? add(e.targetSeasonId, e.amount) : asList(e.allocations).forEach(a => add(a.seasonId, a.amount))
      );
      credLab.forEach(l =>
        l.targetType !== 'common' ? add(l.seasonId, l.totalCost) : asList(l.allocations).forEach(a => add(a.seasonId, a.amount))
      );

      const inScopeCredit = [...perSeason.values()].reduce((sum, v) => sum + v, 0);
      const amount = rep.amount * (inScopeCredit / totalCredit);
      payment.countedInScope = amount;
      if (Math.abs(amount) < 0.005) return;
      lines.push({
        id: rep.id,
        date: rep.date,
        kind: 'credit-repayment',
        detail: creditor?.name || 'Creditor',
        cycles: [...perSeason.keys()].map(seasonLabel),
        isSplit: perSeason.size > 1 || inScopeCredit < totalCredit,
        paidIn: amount,
        received: 0,
      });
    });

  revenues
    .filter(r => r.receivedByMemberId === memberId && inScope.has(r.seasonId))
    .forEach(r => {
      lines.push({
        id: r.id,
        date: r.date,
        kind: 'revenue',
        detail: r.buyerName ? `${r.crop} → ${r.buyerName}` : r.crop,
        cycles: [seasonLabel(r.seasonId)],
        isSplit: false,
        paidIn: 0,
        received: r.saleAmount,
      });
    });

  lines.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));

  const stockPurchases: PartnerStockPurchase[] = purchases
    .filter(p => !p.isCredit && p.paidByMemberId === memberId)
    .map(p => {
      const item = stockItems.find(si => si.id === p.stockItemId);
      return {
        id: p.id,
        date: p.date,
        itemName: item?.name || 'Unknown item',
        quantity: p.quantity,
        unit: item?.unit || '',
        totalCost: p.totalCost,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // ---- Totals: the engine's figures, summed over the cycles in scope ----
  const scopedStatements = summary.ledgers
    .filter(l => inScope.has(l.seasonId))
    .map(l => ({ ledger: l, stmt: l.statements.find(s => s.memberId === memberId) }))
    .filter(x => x.stmt);

  const breakdown: PaidBreakdown = { expenses: 0, labour: 0, stock: 0, creditRepayments: 0 };
  let paidIn = 0;
  let received = 0;
  let netPosition = 0;
  let costShare = 0;
  let revenueShare = 0;
  scopedStatements.forEach(({ ledger, stmt }) => {
    const share = (stmt!.sharePercentage || 0) / 100;
    paidIn += stmt!.paidAmount;
    received += stmt!.receivedAmount;
    netPosition += stmt!.netPosition;
    costShare += share * ledger.totalExpense;
    revenueShare += share * ledger.totalRevenue;
    if (stmt!.paidBreakdown) {
      breakdown.expenses += stmt!.paidBreakdown.expenses;
      breakdown.labour += stmt!.paidBreakdown.labour;
      breakdown.stock += stmt!.paidBreakdown.stock;
      breakdown.creditRepayments += stmt!.paidBreakdown.creditRepayments;
    }
  });

  return {
    memberId,
    memberName,
    cycles,
    lines,
    stockPurchases,
    creditPayments: creditPayments.sort((a, b) => String(a.date).localeCompare(String(b.date))),
    totals: {
      paidIn: Number(paidIn.toFixed(2)),
      costShare,
      received: Number(received.toFixed(2)),
      revenueShare,
      netPosition: Number(netPosition.toFixed(2)),
      breakdown,
    },
  };
}
