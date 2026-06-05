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
  StockItem,
  StockPurchase,
  StockUsage,
  FieldSeasonLedger,
  MemberStatement,
  SimplifiedDebt,
  SettlementSummary
} from '../types';

/**
 * Calculates current Stock Item quantities and weighted-average costs based on Purchases and Usages.
 * Invariants enforced:
 * - Stock quantity on hand = total purchased - total consumed (never negative).
 * - Weighted-average cost on purchase: new_avg = (ext_qty * ext_avg + purchase_cost) / (ext_qty + purchase_qty)
 * - Funding tracker tracks total rupees spent by each member on the stock item to compute consumption attribution.
 */
export function computeStockLevels(
  stockItems: StockItem[],
  purchases: StockPurchase[],
  usages: StockUsage[]
): StockItem[] {
  // Sort purchases chronologically
  const sortedPurchases = [...purchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const sortedUsages = [...usages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return stockItems.map(item => {
    let quantity = 0;
    let avgCost = 0;
    let totalInvested = 0;
    const funding: { [memberId: string]: number } = {};

    const itemPurchases = sortedPurchases.filter(p => p.stockItemId === item.id);
    const itemUsages = sortedUsages.filter(u => u.stockItemId === item.id);

    // Track active timeline to compute rolling average and funding
    let pIdx = 0;
    let uIdx = 0;

    const timeline: { type: 'purchase' | 'usage'; date: number; data: any }[] = [
      ...itemPurchases.map(p => ({ type: 'purchase' as const, date: new Date(p.date).getTime(), data: p })),
      ...itemUsages.map(u => ({ type: 'usage' as const, date: new Date(u.date).getTime(), data: u }))
    ].sort((a, b) => a.date - b.date);

    for (const event of timeline) {
      if (event.type === 'purchase') {
        const p = event.data as StockPurchase;
        const purchaseQty = p.quantity;
        const purchaseCost = p.totalCost;
        const memberId = p.paidByMemberId;

        if (quantity + purchaseQty > 0) {
          avgCost = (quantity * avgCost + purchaseCost) / (quantity + purchaseQty);
        } else {
          avgCost = 0;
        }
        quantity += purchaseQty;
        totalInvested += purchaseCost;
        funding[memberId] = (funding[memberId] || 0) + purchaseCost;
      } else {
        const u = event.data as StockUsage;
        const qtyUsed = u.quantityUsed;

        // Decrease stock level
        quantity = Math.max(0, quantity - qtyUsed);
      }
    }

    return {
      ...item,
      quantityOnHand: Math.max(0, Number(quantity.toFixed(4))),
      weightedAverageCost: Math.max(0, Number(avgCost.toFixed(2))),
      totalCostSpent: totalInvested,
      fundingByMember: funding
    };
  });
}

/**
 * Executes Common Cost Allocation for a specific Expense or StockUsage.
 * Default splitting options:
 * - 'area': split proportional to field areas of participating seasons.
 * - 'equal': even split.
 * - 'manual': already filled manually in allocations.
 */
export function calculateAllocations(
  amount: number,
  rule: 'area' | 'equal' | 'manual',
  targetSeasons: { fieldId: string; seasonId: string; fieldArea: number }[],
  manualAmounts?: { [key: string]: number } // Key: fieldId_seasonId
): { fieldId: string; seasonId: string; amount: number }[] {
  if (targetSeasons.length === 0) return [];

  if (rule === 'equal') {
    const share = Number((amount / targetSeasons.length).toFixed(2));
    let distributed = 0;
    return targetSeasons.map((s, idx) => {
      const isLast = idx === targetSeasons.length - 1;
      const finalAmt = isLast ? Number((amount - distributed).toFixed(2)) : share;
      distributed += finalAmt;
      return { fieldId: s.fieldId, seasonId: s.seasonId, amount: finalAmt };
    });
  }

  if (rule === 'area') {
    const totalArea = targetSeasons.reduce((sum, s) => sum + s.fieldArea, 0);
    if (totalArea === 0) {
      // Fallback to equal
      return calculateAllocations(amount, 'equal', targetSeasons);
    }
    let distributed = 0;
    return targetSeasons.map((s, idx) => {
      const isLast = idx === targetSeasons.length - 1;
      const proportion = s.fieldArea / totalArea;
      const finalAmt = isLast ? Number((amount - distributed).toFixed(2)) : Number((amount * proportion).toFixed(2));
      distributed += finalAmt;
      return { fieldId: s.fieldId, seasonId: s.seasonId, amount: finalAmt };
    });
  }

  if (rule === 'manual' && manualAmounts) {
    let distributed = 0;
    return targetSeasons.map((s, idx) => {
      const key = `${s.fieldId}_${s.seasonId}`;
      const assetAmt = Number((manualAmounts[key] || 0).toFixed(2));
      distributed += assetAmt;
      return { fieldId: s.fieldId, seasonId: s.seasonId, amount: assetAmt };
    });
  }

  return [];
}

/**
 * Creates the ledger, balances, and entitlernents for selected crop seasons.
 */
export function buildSettlementLedger(
  fields: Field[],
  seasons: Season[],
  members: Member[],
  expenses: Expense[],
  labours: Labour[],
  revenues: HarvestRevenue[],
  usages: StockUsage[],
  stockItems: StockItem[],
  purchases: StockPurchase[],
  selectedSeasonIds: string[]
): SettlementSummary {
  const activeSeasons = seasons.filter(s => selectedSeasonIds.includes(s.id));
  const computedStockItems = computeStockLevels(stockItems, purchases, usages);

  const ledgers: FieldSeasonLedger[] = activeSeasons.map(season => {
    const field = fields.find(f => f.id === season.fieldId)!;
    const fieldName = field ? field.name : 'Unknown Field';

    // Direct Expenses
    const directExpenses = expenses.filter(e => e.targetType === 'single' && e.targetSeasonId === season.id);
    const totalDirectExpense = directExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Allocated Expenses
    const allocatedExpenses = expenses.filter(e => e.targetType === 'common');
    const totalAllocatedExpense = allocatedExpenses.reduce((sum, e) => {
      const alloc = e.allocations?.find(al => al.seasonId === season.id);
      return sum + (alloc ? alloc.amount : 0);
    }, 0);

    // Labour Expenses
    const directLabour = labours.filter(l => l.seasonId === season.id);
    const totalLabourExpense = directLabour.reduce((sum, l) => sum + l.totalCost, 0);

    // Stock Usage Expense
    // For each stock usage, cost charged = quantityUsed * weighted_average_cost
    const directUsages = usages.filter(u => u.targetType === 'single' && u.targetSeasonId === season.id);
    const resolvedStockItemsMap = new Map(computedStockItems.map(item => [item.id, item]));

    const totalDirectStockExpense = directUsages.reduce((sum, u) => {
      const info = resolvedStockItemsMap.get(u.stockItemId);
      const costRate = info ? info.weightedAverageCost : 0;
      return sum + (u.quantityUsed * costRate);
    }, 0);

    // Allocated stock usages
    const commonUsages = usages.filter(u => u.targetType === 'common');
    const totalCommonStockExpense = commonUsages.reduce((sum, u) => {
      const info = resolvedStockItemsMap.get(u.stockItemId);
      const costRate = info ? info.weightedAverageCost : 0;
      const alloc = u.allocations?.find(al => al.seasonId === season.id);
      return sum + (alloc ? alloc.quantity * costRate : 0);
    }, 0);

    const totalStockExpense = Number((totalDirectStockExpense + totalCommonStockExpense).toFixed(2));

    // Total Expense E
    const totalExpense = Number((totalDirectExpense + totalAllocatedExpense + totalStockExpense + totalLabourExpense).toFixed(2));

    // Direct Revenues
    const fieldRevenues = revenues.filter(r => r.seasonId === season.id);
    const totalRevenue = fieldRevenues.reduce((sum, r) => sum + r.saleAmount, 0);

    const netProfit = Number((totalRevenue - totalExpense).toFixed(2));

    // Construct Member Statements for this Field-Season
    const statements: MemberStatement[] = members.map(m => {
      const shareObj = (season.shares && season.shares.length > 0)
        ? season.shares.find(sh => sh.memberId === m.id)
        : field.shares.find(sh => sh.memberId === m.id);
      const shareRatio = shareObj ? shareObj.percentage / 100 : 0;

      // Entitled = share_ratio * Net Profit (R - E)
      const entitledAmount = Number((shareRatio * netProfit).toFixed(2));

      // Paid_m = (direct field expenses paid by m) + (allocated common expenses paid by m) + (labour paid by m) + (stock funded by m consumed here)
      const mDirectExp = directExpenses.filter(e => e.paidByMemberId === m.id).reduce((sum, e) => sum + e.amount, 0);
      
      const mCommonAllocExp = allocatedExpenses.filter(e => e.paidByMemberId === m.id).reduce((sum, e) => {
        const alloc = e.allocations?.find(al => al.seasonId === season.id);
        return sum + (alloc ? alloc.amount : 0);
      }, 0);

      const mLabour = directLabour.filter(l => l.paidByMemberId === m.id).reduce((sum, l) => sum + l.totalCost, 0);

      // Stock funding consumption:
      // For each direct usage on this field, how much did m spend on this stock item?
      // Pro rata based on total investments.
      const mDirectStockFunding = directUsages.reduce((sum, u) => {
        const info = resolvedStockItemsMap.get(u.stockItemId);
        if (!info) return sum;
        const totalStockInvested = info.totalCostSpent;
        if (totalStockInvested === 0) return sum;
        const mInvested = info.fundingByMember[m.id] || 0;
        const totalUsedCost = u.quantityUsed * info.weightedAverageCost;
        return sum + (totalUsedCost * (mInvested / totalStockInvested));
      }, 0);

      const mCommonStockFunding = commonUsages.reduce((sum, u) => {
        const info = resolvedStockItemsMap.get(u.stockItemId);
        if (!info) return sum;
        const totalStockInvested = info.totalCostSpent;
        if (totalStockInvested === 0) return sum;
        const mInvested = info.fundingByMember[m.id] || 0;
        const alloc = u.allocations?.find(al => al.seasonId === season.id);
        const allocatedQty = alloc ? alloc.quantity : 0;
        const totalUsedCost = allocatedQty * info.weightedAverageCost;
        return sum + (totalUsedCost * (mInvested / totalStockInvested));
      }, 0);

      const paidAmount = Number((mDirectExp + mCommonAllocExp + mLabour + mDirectStockFunding + mCommonStockFunding).toFixed(2));

      // Received_m = revenue actually received by m
      const receivedAmount = fieldRevenues.filter(r => r.receivedByMemberId === m.id).reduce((sum, r) => sum + r.saleAmount, 0);

      // Settlement_m = entitled - (received - paid) = entitled - received + paid
      const netPosition = Number((entitledAmount - (receivedAmount - paidAmount)).toFixed(2));

      return {
        memberId: m.id,
        memberName: m.name,
        entitledAmount,
        paidAmount,
        receivedAmount,
        netPosition,
        sharePercentage: shareObj ? shareObj.percentage : 0
      };
    });

    return {
      fieldId: field.id,
      fieldName,
      seasonId: season.id,
      cropName: season.cropName,
      totalDirectExpense,
      totalAllocatedExpense,
      totalLabourExpense,
      totalStockExpense,
      totalExpense,
      totalRevenue,
      netProfit,
      statements
    };
  });

  // Roll up statements across all fields/seasons
  const membersTotalStatements: { [memberId: string]: MemberStatement } = {};
  for (const m of members) {
    membersTotalStatements[m.id] = {
      memberId: m.id,
      memberName: m.name,
      entitledAmount: 0,
      paidAmount: 0,
      receivedAmount: 0,
      netPosition: 0
    };
  }

  for (const ledger of ledgers) {
    for (const stmt of ledger.statements) {
      const total = membersTotalStatements[stmt.memberId];
      if (total) {
        total.entitledAmount = Number((total.entitledAmount + stmt.entitledAmount).toFixed(2));
        total.paidAmount = Number((total.paidAmount + stmt.paidAmount).toFixed(2));
        total.receivedAmount = Number((total.receivedAmount + stmt.receivedAmount).toFixed(2));
        total.netPosition = Number((total.netPosition + stmt.netPosition).toFixed(2));
      }
    }
  }

  // Debt Simplification (greedy approach)
  const debts: SimplifiedDebt[] = [];
  const positions = Object.values(membersTotalStatements).map(total => ({
    memberId: total.memberId,
    name: total.memberName,
    balance: total.netPosition
  }));

  // Separate debtors and creditors
  // If balance > 0, they should receive (creditor)
  // If balance < 0, they should pay (debtor)
  let creditors = positions.filter(p => p.balance > 0.01).sort((a, b) => b.balance - a.balance);
  let debtors = positions.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance); // Most negative first (owes most)

  while (creditors.length > 0 && debtors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];

    const oweAmt = Math.abs(debtor.balance);
    const recAmt = creditor.balance;
    const settleAmt = Number(Math.min(oweAmt, recAmt).toFixed(2));

    debts.push({
      fromId: debtor.memberId,
      fromName: debtor.name,
      toId: creditor.memberId,
      toName: creditor.name,
      amount: settleAmt
    });

    debtor.balance = Number((debtor.balance + settleAmt).toFixed(2));
    creditor.balance = Number((creditor.balance - settleAmt).toFixed(2));

    creditors = creditors.filter(p => p.balance > 0.01).sort((a, b) => b.balance - a.balance);
    debtors = debtors.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance);
  }

  // Check invariant: Sum of net positions must equal 0
  const sumPositions = Object.values(membersTotalStatements).reduce((sum, m) => sum + m.netPosition, 0);
  const isBalanced = Math.abs(sumPositions) < 1.0; // Allowance for floating-point inaccuracies

  return {
    ledgers,
    membersTotalStatements,
    debts,
    isBalanced,
    totalSettlementDiscrepancy: Number(sumPositions.toFixed(2))
  };
}
