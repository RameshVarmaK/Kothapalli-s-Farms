import { Expense, Labour, HarvestRevenue, Field, Season, Member } from '../types';
import { LocalDatabase } from './database';

export interface CropProfitability {
  cropName: string;
  seasonId: string;
  fieldName: string;
  revenue: number;
  expenses: number;
  profit: number;
  profitMargin: number; // percentage
  quantity: number;
  costPerUnit: number;
}

export interface MemberContribution {
  memberId: string;
  memberName: string;
  expensesPaid: number;
  hoursWorked: number;
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
  roi: number; // percentage
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

/**
 * Calculate profitability for each crop/season/field combination
 */
export function calculateCropProfitability(db: LocalDatabase): CropProfitability[] {
  const profitability: CropProfitability[] = [];

  (db.seasons || []).forEach((season) => {
    const field = db.fields?.find(f => f.id === season.fieldId);
    if (!field) return;

    // Revenue for this season
    const seasonRevenue = (db.revenues || [])
      .filter(r => r.seasonId === season.id)
      .reduce((sum, r) => sum + r.saleAmount, 0);

    // Expenses for this season (single + allocated)
    const singleExpenses = (db.expenses || [])
      .filter(e => e.targetType === 'single' && e.targetSeasonId === season.id)
      .reduce((sum, e) => sum + e.amount, 0);

    const allocatedExpenses = (db.expenses || [])
      .filter(e => e.targetType === 'common' && e.allocations?.some(a => a.seasonId === season.id))
      .reduce((sum, e) => {
        const alloc = e.allocations?.find(a => a.seasonId === season.id);
        return sum + (alloc?.amount || 0);
      }, 0);

    // Labour for this season
    const labourCosts = (db.labours || [])
      .filter(l => l.seasonId === season.id)
      .reduce((sum, l) => sum + l.totalCost, 0);

    const totalExpenses = singleExpenses + allocatedExpenses + labourCosts;
    const profit = seasonRevenue - totalExpenses;
    const profitMargin = seasonRevenue > 0 ? (profit / seasonRevenue) * 100 : 0;

    // Quantity and cost per unit
    const harvests = db.revenues?.filter(r => r.seasonId === season.id) || [];
    const totalQuantity = harvests.reduce((sum, h) => sum + h.quantity, 0);
    const costPerUnit = totalQuantity > 0 ? totalExpenses / totalQuantity : 0;

    profitability.push({
      cropName: season.cropName,
      seasonId: season.id,
      fieldName: field.name,
      revenue: seasonRevenue,
      expenses: totalExpenses,
      profit,
      profitMargin,
      quantity: totalQuantity,
      costPerUnit
    });
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
      hoursWorked: 0,
      revenueReceived: 0,
      netPosition: 0,
      sharePercentage: 0
    });
  });

  // Expenses paid
  (db.expenses || []).forEach(exp => {
    const contrib = contributions.get(exp.paidByMemberId);
    if (contrib) {
      contrib.expensesPaid += exp.amount;
    }
  });

  // Labour hours (assume 8-hour workday, wageRate per worker)
  (db.labours || []).forEach(lab => {
    const contrib = contributions.get(lab.paidByMemberId);
    if (contrib) {
      contrib.hoursWorked += lab.workersCount * 8; // simplification
    }
  });

  // Revenue received
  (db.revenues || []).forEach(rev => {
    const contrib = contributions.get(rev.receivedByMemberId);
    if (contrib) {
      contrib.revenueReceived += rev.saleAmount;
    }
  });

  // Calculate net position (overly simplified; real settlement is more complex)
  const members = contributions.values();
  const avgExpenses = Array.from(members).reduce((sum, m) => sum + m.expensesPaid, 0) / contributions.size;

  Array.from(contributions.values()).forEach(contrib => {
    contrib.netPosition = contrib.expensesPaid - avgExpenses;
  });

  return Array.from(contributions.values()).sort((a, b) => b.expensesPaid - a.expensesPaid);
}

/**
 * Calculate field performance metrics
 */
export function calculateFieldPerformance(db: LocalDatabase): FieldPerformance[] {
  return (db.fields || []).map(field => {
    const fieldSeasons = (db.seasons || []).filter(s => s.fieldId === field.id);
    const activeSeasons = fieldSeasons.filter(s => !s.isClosed).length;

    // Revenue from this field
    const revenue = (db.revenues || [])
      .filter(r => r.fieldId === field.id)
      .reduce((sum, r) => sum + r.saleAmount, 0);

    // Expenses for this field
    const fieldExpenses = (db.expenses || [])
      .filter(e => e.targetType === 'single' && e.targetFieldId === field.id)
      .reduce((sum, e) => sum + e.amount, 0);

    const seasonExpenses = (db.expenses || [])
      .filter(e => e.targetType === 'common' && e.allocations?.some(a => a.fieldId === field.id))
      .reduce((sum, e) => {
        const alloc = e.allocations?.find(a => a.fieldId === field.id);
        return sum + (alloc?.amount || 0);
      }, 0);

    const labourCosts = (db.labours || [])
      .filter(l => l.fieldId === field.id)
      .reduce((sum, l) => sum + l.totalCost, 0);

    const totalExpenses = fieldExpenses + seasonExpenses + labourCosts;
    const profit = revenue - totalExpenses;
    const roi = totalExpenses > 0 ? (profit / totalExpenses) * 100 : 0;

    return {
      fieldId: field.id,
      fieldName: field.name,
      area: field.area,
      activeSeasons,
      totalRevenue: revenue,
      totalExpenses,
      netProfit: profit,
      roi,
      revenuePerAcre: field.area > 0 ? revenue / field.area : 0,
      expensesPerAcre: field.area > 0 ? totalExpenses / field.area : 0
    };
  });
}

/**
 * Calculate seasonal trends (month-by-month expenses/revenue)
 */
export function calculateSeasonalTrends(db: LocalDatabase): SeasonalTrend[] {
  const trends: Map<string, SeasonalTrend> = new Map();

  // Process expenses
  (db.expenses || []).forEach(exp => {
    const date = new Date(exp.date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const season = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;

    if (!trends.has(key)) {
      trends.set(key, {
        season,
        month: date.getMonth(),
        totalExpenses: 0,
        totalRevenue: 0,
        netProfit: 0,
        expenseCount: 0
      });
    }

    const trend = trends.get(key)!;
    trend.totalExpenses += exp.amount;
    trend.expenseCount += 1;
  });

  // Process revenue
  (db.revenues || []).forEach(rev => {
    const date = new Date(rev.date);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const season = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;

    if (!trends.has(key)) {
      trends.set(key, {
        season,
        month: date.getMonth(),
        totalExpenses: 0,
        totalRevenue: 0,
        netProfit: 0,
        expenseCount: 0
      });
    }

    const trend = trends.get(key)!;
    trend.totalRevenue += rev.saleAmount;
  });

  // Calculate profit and sort
  return Array.from(trends.values())
    .map(t => ({ ...t, netProfit: t.totalRevenue - t.totalExpenses }))
    .sort((a, b) => a.month - b.month);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = '₹'): string {
  return `${currency}${Math.round(amount).toLocaleString()}`;
}

/**
 * Calculate percentage
 */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Summary statistics for dashboard
 */
export interface DashboardStats {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  averageROI: number;
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
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const avgROI = fields.length > 0 ? fields.reduce((sum, f) => sum + f.roi, 0) / fields.length : 0;

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
