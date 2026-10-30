import { paymentsFor, receiptsFor } from './payers';
import { LocalDatabase } from './database';
import { buildSettlementLedger, computeStockLevels } from './calculations';
import { formatMoney } from './format';
import { FieldSeasonLedger } from '../types';

export interface CropProfitability {
  cropName: string;
  seasonId: string;
  fieldName: string;
  revenue: number;
  expenses: number;
  profit: number;
  /** Percentage of revenue. null until the season has recorded a sale. */
  profitMargin: number | null;
  quantity: number;
  costPerUnit: number;
}

export interface MemberContribution {
  memberId: string;
  memberName: string;
  expensesPaid: number;
  /** Wages this partner paid out of pocket (cash, not credit). */
  labourPaid: number;
  revenueReceived: number;
  netPosition: number; // positive = owed, negative = owes
  sharePercentage: number;
}

export interface FieldPerformance {
  fieldId: string;
  fieldName: string;
  area: number;
  activeSeasons: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  /** Percentage return on cost. null until the field has recorded a sale. */
  roi: number | null;
  revenuePerAcre: number;
  expensesPerAcre: number;
}

export interface SeasonalTrend {
  season: string;
  month: number;
  totalExpenses: number;
  totalRevenue: number;
  netProfit: number;
  expenseCount: number;
}

export interface YieldTrend {
  seasonId: string;
  fieldId: string;
  fieldName: string;
  cropName: string;
  startDate: string;
  totalQuantity: number;
  yieldPerAcre: number;
}

/**
 * Per-season ledgers from the same engine the Home tab, the Settle tab and
 * the season report use. Reports used to add up expenses on its own and
 * left out stock consumed from inventory and labour split across fields,
 * so its "Total Expenses" disagreed with every other tab.
 */
export function seasonLedgers(db: LocalDatabase): FieldSeasonLedger[] {
  const seasons = db.seasons || [];
  return buildSettlementLedger(
    db.fields || [],
    seasons,
    db.members || [],
    db.expenses || [],
    db.labours || [],
    db.revenues || [],
    db.usages || [],
    db.stockItems || [],
    db.purchases || [],
    seasons.map(s => s.id),
    db.creditAccounts || [],
    db.creditRepayments || []
  ).ledgers;
}

/**
 * Calculate profitability for each crop/season/field combination
 */
export function calculateCropProfitability(db: LocalDatabase): CropProfitability[] {
  const profitability: CropProfitability[] = seasonLedgers(db).map(ledger => {
    const harvests = (db.revenues || []).filter(r => r.seasonId === ledger.seasonId);
    const totalQuantity = harvests.reduce((sum, h) => sum + h.quantity, 0);

    return {
      cropName: ledger.cropName,
      seasonId: ledger.seasonId,
      fieldName: ledger.fieldName,
      revenue: ledger.totalRevenue,
      expenses: ledger.totalExpense,
      profit: ledger.netProfit,
      profitMargin: ledger.totalRevenue > 0 ? (ledger.netProfit / ledger.totalRevenue) * 100 : null,
      quantity: totalQuantity,
      costPerUnit: totalQuantity > 0 ? ledger.totalExpense / totalQuantity : 0
    };
  });

  return profitability.sort((a, b) => b.profit - a.profit);
}

/**
 * Calculate contribution of each member
 */
export function calculateMemberContribution(db: LocalDatabase): MemberContribution[] {
  const contributions: Map<string, MemberContribution> = new Map();

  // Initialize for each member
  (db.members || []).forEach(member => {
    contributions.set(member.id, {
      memberId: member.id,
      memberName: member.name,
      expensesPaid: 0,
      labourPaid: 0,
      revenueReceived: 0,
      netPosition: 0,
      sharePercentage: 0
    });
  });

  // Expenses paid
  (db.expenses || []).forEach(exp => {
    paymentsFor(exp, exp.amount).forEach(payment => {
      const contrib = contributions.get(payment.memberId);
      if (contrib) contrib.expensesPaid += payment.amount;
    });
  });

  // Wages paid. The old "hours worked" column multiplied workers by an
  // assumed 8-hour day; nothing in the ledger records hours, so it was a
  // made-up number. What is recorded is who paid the wages.
  (db.labours || []).forEach(lab => {
    paymentsFor(lab, lab.totalCost).forEach(payment => {
      const contrib = contributions.get(payment.memberId);
      if (contrib) contrib.labourPaid += payment.amount;
    });
  });

  // Revenue received
  (db.revenues || []).forEach(rev => {
    receiptsFor(rev, rev.saleAmount).forEach(receipt => {
      const contrib = contributions.get(receipt.memberId);
      if (contrib) contrib.revenueReceived += receipt.amount;
    });
  });

  // Calculate net position (overly simplified; real settlement is more complex)
  const members = contributions.values();
  const avgExpenses = contributions.size > 0
    ? Array.from(members).reduce((sum, m) => sum + m.expensesPaid, 0) / contributions.size
    : 0;

  Array.from(contributions.values()).forEach(contrib => {
    contrib.netPosition = contrib.expensesPaid - avgExpenses;
  });

  return Array.from(contributions.values()).sort((a, b) => b.expensesPaid - a.expensesPaid);
}

/**
 * Calculate field performance metrics
 */
export function calculateFieldPerformance(db: LocalDatabase): FieldPerformance[] {
  const ledgers = seasonLedgers(db);
  return (db.fields || []).map(field => {
    const fieldSeasons = (db.seasons || []).filter(s => s.fieldId === field.id);
    const activeSeasons = fieldSeasons.filter(s => !s.isClosed).length;

    const fieldLedgers = ledgers.filter(l => l.fieldId === field.id);
    const revenue = fieldLedgers.reduce((sum, l) => sum + l.totalRevenue, 0);
    const totalExpenses = fieldLedgers.reduce((sum, l) => sum + l.totalExpense, 0);
    const profit = revenue - totalExpenses;

    return {
      fieldId: field.id,
      fieldName: field.name,
      area: field.area,
      activeSeasons,
      totalRevenue: revenue,
      totalExpenses,
      netProfit: profit,
      roi: revenue > 0 && totalExpenses > 0 ? (profit / totalExpenses) * 100 : null,
      revenuePerAcre: field.area > 0 ? revenue / field.area : 0,
      expensesPerAcre: field.area > 0 ? totalExpenses / field.area : 0
    };
  });
}

/**
 * Calculate seasonal trends (month-by-month expenses/revenue). Expenses here
 * are everything a month cost: cash expenses, wages, and stock drawn from
 * inventory valued at its weighted-average cost.
 */
export function calculateSeasonalTrends(db: LocalDatabase): SeasonalTrend[] {
  const trends: Map<string, SeasonalTrend> = new Map();

  const bucketFor = (dateText: string): SeasonalTrend | null => {
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return null;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (!trends.has(key)) {
      trends.set(key, {
        // Fixed to English so the label does not change with the device locale ("Sept" vs "Sep").
        season: `${date.toLocaleString('en', { month: 'short' })} ${date.getFullYear()}`,
        // Months are sorted across years, so January 2027 follows December 2026.
        month: date.getFullYear() * 12 + date.getMonth(),
        totalExpenses: 0,
        totalRevenue: 0,
        netProfit: 0,
        expenseCount: 0
      });
    }
    return trends.get(key)!;
  };

  (db.expenses || []).forEach(exp => {
    const trend = bucketFor(exp.date);
    if (!trend) return;
    trend.totalExpenses += exp.amount;
    trend.expenseCount += 1;
  });

  (db.labours || []).forEach(lab => {
    const trend = bucketFor(lab.date);
    if (!trend) return;
    trend.totalExpenses += lab.totalCost;
    trend.expenseCount += 1;
  });

  const stockCost = new Map(
    computeStockLevels(db.stockItems || [], db.purchases || [], db.usages || [])
      .map(item => [item.id, item.weightedAverageCost])
  );
  (db.usages || []).forEach(usage => {
    const trend = bucketFor(usage.date);
    if (!trend) return;
    trend.totalExpenses += usage.quantityUsed * (stockCost.get(usage.stockItemId) || 0);
    trend.expenseCount += 1;
  });

  (db.revenues || []).forEach(rev => {
    const trend = bucketFor(rev.date);
    if (!trend) return;
    trend.totalRevenue += rev.saleAmount;
  });

  return Array.from(trends.values())
    .map(t => ({ ...t, netProfit: t.totalRevenue - t.totalExpenses }))
    .sort((a, b) => a.month - b.month);
}

/**
 * Calculate harvested quantity per acre for each closed-enough season (any
 * season with at least one recorded harvest sale), sorted chronologically so
 * the trend line reads left-to-right by sowing date.
 */
export function calculateYieldTrends(db: LocalDatabase): YieldTrend[] {
  return (db.seasons || [])
    .map(season => {
      const field = (db.fields || []).find(f => f.id === season.fieldId);
      if (!field) return null;

      const totalQuantity = (db.revenues || [])
        .filter(r => r.seasonId === season.id)
        .reduce((sum, r) => sum + r.quantity, 0);
      if (totalQuantity <= 0) return null;

      return {
        seasonId: season.id,
        fieldId: field.id,
        fieldName: field.name,
        cropName: season.cropName,
        startDate: season.startDate,
        totalQuantity,
        yieldPerAcre: field.area > 0 ? totalQuantity / field.area : 0
      };
    })
    .filter((v): v is YieldTrend => v !== null)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = '₹'): string {
  return formatMoney(amount, currency);
}

/**
 * Summary statistics for dashboard
 */
export interface DashboardStats {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  /** null until any sale is recorded. */
  profitMargin: number | null;
  /** null until any sale is recorded. */
  averageROI: number | null;
  mostProfitableCrop: CropProfitability | null;
  topContributor: MemberContribution | null;
}

export function calculateDashboardStats(db: LocalDatabase): DashboardStats {
  const crops = calculateCropProfitability(db);
  const members = calculateMemberContribution(db);
  const fields = calculateFieldPerformance(db);

  const totalRevenue = crops.reduce((sum, c) => sum + c.revenue, 0);
  const totalExpenses = crops.reduce((sum, c) => sum + c.expenses, 0);
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : null;
  const fieldsWithRoi = fields.filter((f): f is FieldPerformance & { roi: number } => f.roi !== null);
  const avgROI = fieldsWithRoi.length > 0
    ? fieldsWithRoi.reduce((sum, f) => sum + f.roi, 0) / fieldsWithRoi.length
    : null;

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    averageROI: avgROI,
    mostProfitableCrop: crops[0] || null,
    topContributor: members[0] || null
  };
}
