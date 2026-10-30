/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a partner may do in the app. Owner: everything, including settling,
 * closing seasons, changing shares, managing partners and the sheet link.
 * Editor: day-to-day entries (expenses, labour, stock, sales, repayments)
 * and deleting their own. Viewer: read only. See src/app/access.ts.
 */
export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface Member {
  id: string;
  name: string;
  phone?: string;
  photo?: string; // base64 URL or abstract initials
  /** Google account email; links the signed-in user to this partner. */
  email?: string;
  /** Absent means editor once any partner has an email; owner before that. */
  role?: MemberRole;
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

/**
 * A receipt or document attached to an expense. The file itself lives in the
 * uploader's Google Drive ("FarmLedger Receipts" folder); the expense only
 * carries this metadata, and that is what reaches the sheet.
 */
export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  driveFileId?: string;
  webViewLink?: string;
  /** Not in Drive yet (offline, or the upload failed); retried later. */
  pending?: boolean;
  /** Base64 file content, kept on this device only until the upload
   * succeeds. Never written to the sheet. */
  data?: string;
  /** @deprecated pre-Drive shape ('image' | 'document'); read once, then dropped. */
  type?: 'image' | 'document';
  /** @deprecated pre-Drive name for `data`; read once, then dropped. */
  base64Data?: string;
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  paidByMemberId: string;
  /**
   * Set when several partners paid this entry together, with what each paid
   * (adding up to the total). `paidByMemberId` then holds the first of them.
   * Absent means `paidByMemberId` paid all of it.
   */
  payers?: Payment[];
  category: string;
  linkedActivityId?: string;
  targetType: 'single' | 'common';
  targetFieldId?: string;      // empty if common
  targetSeasonId?: string;     // empty if common
  commonAllocationRule?: CommonAllocationType;
  allocations?: Allocation[];  // list of field-season allocations
  /** @deprecated base64 photo from an old version. Turned into a pending
   * attachment, uploaded to Drive like any other, then dropped. */
  receiptPhoto?: string;
  attachments?: Attachment[];
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
  /** Set when several partners paid for this purchase; see Expense.payers. */
  payers?: Payment[];
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
  linkedActivityId?: string;
  workersCount: number;
  wageRate: number; // per worker rate
  totalCost: number; // lump sum or workersCount * wageRate
  paidByMemberId: string;
  /**
   * Set when several partners paid this entry together, with what each paid
   * (adding up to the total). `paidByMemberId` then holds the first of them.
   * Absent means `paidByMemberId` paid all of it.
   */
  payers?: Payment[];
  /** What work was done — required for new entries; absent on rows logged
   * before it was asked for. */
  description?: string;
  isCredit?: boolean;
  creditAccountId?: string;
  // Absent targetType (legacy rows written before common-split support)
  // behaves as 'single'.
  targetType?: 'single' | 'common';
  fieldId?: string;            // set when single (or legacy row)
  seasonId?: string;           // set when single (or legacy row)
  commonAllocationRule?: CommonAllocationType;
  allocations?: Allocation[];  // set when common: cost share per field/season
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
  /**
   * Set when the sale money went to several partners, with what each
   * received (adding up to the sale amount). `receivedByMemberId` then holds
   * the first of them.
   */
  receivers?: Payment[];
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

/**
 * A debt the partners have marked as actually transferred in the Settle tab.
 *
 * `key` is the identity of the debt as the Settle tab computes it:
 * `<seasonIds>:<fromMemberId>:<toMemberId>:<roundedAmount>`. A 'debt' scope
 * key covers the combined debt across the seasons selected at the time; a
 * 'sub' scope key covers one season's slice of it.
 */
export interface SettlementClearance {
  id: string; // `${scope}|${key}`, so the two scopes can never collide on one row
  scope: 'debt' | 'sub';
  key: string;
  clearedAt: string; // ISO timestamp
}

// Settlement result definitions
/** What a member's `paidAmount` is made of, for the season report's
 * per-partner breakdown. Components are stored unrounded so that rounding
 * their sum reproduces `paidAmount` exactly rather than drifting a paisa. */
export interface PaidBreakdown {
  expenses: number;         // direct + allocated share of common expenses
  labour: number;           // direct + allocated share of common labour
  stock: number;            // this member's funding of the stock consumed here
  creditRepayments: number; // repayments attributed to this season pro-rata
}

export interface MemberStatement {
  memberId: string;
  memberName: string;
  entitledAmount: number;
  paidAmount: number;
  receivedAmount: number;
  netPosition: number; // positive = should receive, negative = should pay
  sharePercentage?: number;
  /** Optional: absent on callers that predate the season-report breakdown. */
  paidBreakdown?: PaidBreakdown;
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

/** What one partner paid towards an entry that several partners paid for. */
export interface Payment {
  memberId: string;
  amount: number;
}

/** Part of a repayment the payer said settles one particular bill. */
export interface RepaymentBillAllocation {
  /** `expense:<id>` or `labour:<id>`, see creditBills.ts. */
  billKey: string;
  amount: number;
}

export interface CreditRepayment {
  id: string;
  creditAccountId: string;
  memberId: string; // The partner/member who paid
  amount: number;
  date: string;
  notes?: string;
  /**
   * The bills this payment was made against. Absent (or covering only part of
   * the amount) means the rest is spread over the account's unsettled bills in
   * proportion to their size, which is how every repayment used to be treated.
   */
  billAllocations?: RepaymentBillAllocation[];
}

export type NotificationChannel = 'sms' | 'whatsapp' | 'none';
export type NotificationEvent = 'expense_added' | 'harvest_recorded' | 'settlement_calculated' | 'labour_logged';

export interface NotificationPreferences {
  memberId: string;
  channel: NotificationChannel; // none, sms, or whatsapp
  phoneNumber?: string; // only if channel is sms/whatsapp
  enabledEvents: NotificationEvent[]; // which events to notify on
}

export interface NotificationDelivery {
  id: string;
  memberId: string;
  eventType: NotificationEvent;
  message: string;
  channel: NotificationChannel;
  sentAt: string;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
}

