/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Member {
  id: string;
  name: string;
  phone?: string;
  photo?: string; // base64 URL or abstract initials
}

export interface MemberShare {
  memberId: string;
  percentage: number; // 0 to 100
}

export interface Field {
  id: string;
  name: string;
  area: number; // default unit: acres
  locationNote?: string;
  shares: MemberShare[]; // must sum to exactly 100%
}

export interface Season {
  id: string;
  fieldId: string;
  cropName: string;
  startDate: string;
  endDate?: string; // empty means still open
  isClosed: boolean;
  shares?: MemberShare[]; // custom ownership shares on season level
}

export interface Activity {
  id: string;
  date: string;
  fieldId: string;
  seasonId: string;
  type: 'Sowing' | 'Irrigation' | 'Weeding' | 'Fertilizing' | 'Spraying' | 'Harvesting' | 'Equipment/Motor repair' | 'Transport' | 'Other';
  notes: string;
  weatherNote?: string;
  photos?: string[]; // base64 URLs
}

export type CommonAllocationType = 'area' | 'equal' | 'manual';

export interface Allocation {
  fieldId: string;
  seasonId: string; // targets specific crop season
  amount: number; // calculated cost share
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  paidByMemberId: string;
  category: string;
  linkedActivityId?: string;
  targetType: 'single' | 'common';
  targetFieldId?: string;      // empty if common
  targetSeasonId?: string;     // empty if common
  commonAllocationRule?: CommonAllocationType;
  allocations?: Allocation[];  // list of field-season allocations
  receiptPhoto?: string;       // base64
  isCredit?: boolean;
  creditAccountId?: string;
}

export interface StockItem {
  id: string;
  name: string;
  type: 'Seed' | 'Fertilizer' | 'Pesticide' | 'Fuel' | 'Other';
  unit: string; // e.g. kg, litre, bag
  quantityOnHand: number;
  weightedAverageCost: number;
  totalCostSpent: number; // running tracker to compute funding percentages
  fundingByMember: { [memberId: string]: number }; // total rupees paid toward this stock item
}

export interface StockPurchase {
  id: string;
  stockItemId: string;
  quantity: number;
  totalCost: number;
  date: string;
  paidByMemberId: string;
  isCredit?: boolean;
  creditAccountId?: string;
}

export interface StockUsageAllocation {
  fieldId: string;
  seasonId: string;
  quantity: number; // exact quantity allocated
  amount: number;   // quantity * current_weighted_avg
}

export interface StockUsage {
  id: string;
  stockItemId: string;
  quantityUsed: number;
  date: string;
  targetType: 'single' | 'common';
  targetFieldId?: string;
  targetSeasonId?: string;
  commonAllocationRule?: CommonAllocationType;
  allocations?: StockUsageAllocation[];
  linkedActivityId?: string;
}

export interface Labour {
  id: string;
  date: string;
  fieldId: string;
  seasonId: string;
  linkedActivityId?: string;
  workersCount: number;
  wageRate: number; // per worker rate
  totalCost: number; // lump sum or workersCount * wageRate
  paidByMemberId: string;
  isCredit?: boolean;
  creditAccountId?: string;
}

export interface HarvestRevenue {
  id: string;
  date: string;
  fieldId: string;
  seasonId: string;
  crop: string;
  quantity: number;
  buyerName?: string;
  saleAmount: number;
  receivedByMemberId: string;
  linkedActivityId?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actionType: 'create' | 'edit' | 'delete';
  entityType: string;
  entityId: string;
  description: string;
  memberId?: string; // who performed the action, if any
}

export interface Settings {
  currency: string; // e.g. "₹"
  areaUnit: string; // e.g. "acres"
  googleDriveLinked: boolean;
  linkedSpreadsheetId?: string;
}

// Settlement result definitions
export interface MemberStatement {
  memberId: string;
  memberName: string;
  entitledAmount: number;
  paidAmount: number;
  receivedAmount: number;
  netPosition: number; // positive = should receive, negative = should pay
  sharePercentage?: number;
}

export interface FieldSeasonLedger {
  fieldId: string;
  fieldName: string;
  seasonId: string;
  cropName: string;
  totalDirectExpense: number;
  totalAllocatedExpense: number;
  totalStockExpense: number;
  totalLabourExpense: number;
  totalExpense: number; // E
  totalRevenue: number; // R
  netProfit: number; // R - E
  statements: MemberStatement[];
}

export interface SimplifiedDebt {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

export interface SettlementSummary {
  ledgers: FieldSeasonLedger[];
  membersTotalStatements: { [memberId: string]: MemberStatement };
  debts: SimplifiedDebt[];
  isBalanced: boolean;
  totalSettlementDiscrepancy: number; // should be 0
}

export interface CreditAccount {
  id: string;
  name: string;
  phone?: string;
  type: 'Labour' | 'Tractor' | 'Vendor' | 'Other';
  notes?: string;
}

export interface CreditRepayment {
  id: string;
  creditAccountId: string;
  memberId: string; // The partner/member who paid
  amount: number;
  date: string;
  notes?: string;
}

