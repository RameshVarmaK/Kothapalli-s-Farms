import { Expense, Field, Season, Labour, HarvestRevenue, StockPurchase, StockUsage } from '../types';

const TOLERANCE = 0.01; // Floating point tolerance for amount comparisons

// Validate that a member's share is between 0 and 100
export const validateMemberShare = (share: number): boolean => {
  return share >= 0 && share <= 100;
};

// Validate that shares across multiple members sum to 100 (with tolerance)
export const validateSharesSum = (shares: number[]): boolean => {
  const sum = shares.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) <= TOLERANCE;
};

// Validate field shares sum to 100
export const validateFieldShares = (field: Field): { valid: boolean; error?: string } => {
  const totalShare = (field.shares || []).reduce((sum, s) => sum + s.percentage, 0);
  if (Math.abs(totalShare - 100) > TOLERANCE) {
    return {
      valid: false,
      error: `Field shares must sum to 100%, but sum to ${totalShare.toFixed(2)}%`
    };
  }
  return { valid: true };
};

// Validate season shares sum to 100 (if custom shares are defined)
export const validateSeasonShares = (season: Season): { valid: boolean; error?: string } => {
  if (!season.shares || season.shares.length === 0) return { valid: true };

  const totalShare = season.shares.reduce((sum, s) => sum + s.percentage, 0);
  if (Math.abs(totalShare - 100) > TOLERANCE) {
    return {
      valid: false,
      error: `Season "${season.cropName}" shares must sum to 100%, but sum to ${totalShare.toFixed(2)}%`
    };
  }
  return { valid: true };
};

// Validate expense amount is positive
export const validateExpenseAmount = (amount: number): { valid: boolean; error?: string } => {
  if (amount <= 0) {
    return { valid: false, error: 'Expense amount must be greater than 0' };
  }
  return { valid: true };
};

// Validate that expense allocations sum to the expense amount
export const validateExpenseAllocations = (expense: Expense): { valid: boolean; error?: string } => {
  if (expense.targetType === 'single') {
    // Single-target expenses don't need allocation validation
    return { valid: true };
  }

  if (expense.targetType === 'common' && expense.allocations) {
    const sum = expense.allocations.reduce((total, alloc) => total + alloc.amount, 0);
    const diff = Math.abs(sum - expense.amount);
    if (diff > TOLERANCE) {
      return {
        valid: false,
        error: `Allocations must sum to ${expense.amount.toFixed(2)}, but sum to ${sum.toFixed(2)}`
      };
    }
  }

  return { valid: true };
};

// Validate labour amount is positive
export const validateLabourAmount = (amount: number): { valid: boolean; error?: string } => {
  if (amount <= 0) {
    return { valid: false, error: 'Labour cost must be greater than 0' };
  }
  return { valid: true };
};

// Validate harvest revenue amount is positive
export const validateRevenueAmount = (amount: number): { valid: boolean; error?: string } => {
  if (amount <= 0) {
    return { valid: false, error: 'Revenue amount must be greater than 0' };
  }
  return { valid: true };
};

// Validate stock purchase amount is positive
export const validatePurchaseAmount = (amount: number): { valid: boolean; error?: string } => {
  if (amount <= 0) {
    return { valid: false, error: 'Purchase cost must be greater than 0' };
  }
  return { valid: true };
};

// Validate stock quantity is positive
export const validateQuantity = (quantity: number): { valid: boolean; error?: string } => {
  if (quantity <= 0) {
    return { valid: false, error: 'Quantity must be greater than 0' };
  }
  return { valid: true };
};

// Validate that a date string is a valid ISO date
export const validateDateString = (dateStr: string): { valid: boolean; error?: string } => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }
  return { valid: true };
};

// Comprehensive expense validation
export const validateExpense = (expense: Expense): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const amountCheck = validateExpenseAmount(expense.amount);
  if (!amountCheck.valid) errors.push(amountCheck.error!);

  const allocCheck = validateExpenseAllocations(expense);
  if (!allocCheck.valid) errors.push(allocCheck.error!);

  const dateCheck = validateDateString(expense.date);
  if (!dateCheck.valid) errors.push(dateCheck.error!);

  if (!expense.category || expense.category.trim() === '') {
    errors.push('Expense category is required');
  }

  if (expense.isCredit) {
    if (!expense.creditAccountId) {
      errors.push('Credit account is required for credit expenses');
    }
  } else if (!expense.paidByMemberId) {
    errors.push('Member who paid is required');
  }

  return { valid: errors.length === 0, errors };
};

// Comprehensive labour validation
export const validateLabour = (labour: Labour): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const costCheck = validateLabourAmount(labour.totalCost);
  if (!costCheck.valid) errors.push(costCheck.error!);

  if (!labour.description || !labour.description.trim()) {
    errors.push('Describe the work that was done');
  }

  const qtyCheck = validateQuantity(labour.workersCount);
  if (!qtyCheck.valid) errors.push('Number of workers must be greater than 0');

  const dateCheck = validateDateString(labour.date);
  if (!dateCheck.valid) errors.push(dateCheck.error!);

  if (labour.isCredit) {
    if (!labour.creditAccountId) {
      errors.push('Credit account is required for credit labour costs');
    }
  } else if (!labour.paidByMemberId) {
    errors.push('Member who paid is required');
  }

  if (labour.wageRate <= 0) {
    errors.push('Wage rate must be greater than 0');
  }

  return { valid: errors.length === 0, errors };
};

// Comprehensive revenue validation
export const validateRevenue = (revenue: HarvestRevenue): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const amountCheck = validateRevenueAmount(revenue.saleAmount);
  if (!amountCheck.valid) errors.push(amountCheck.error!);

  const qtyCheck = validateQuantity(revenue.quantity);
  if (!qtyCheck.valid) errors.push('Quantity must be greater than 0');

  const dateCheck = validateDateString(revenue.date);
  if (!dateCheck.valid) errors.push(dateCheck.error!);

  if (!revenue.crop || revenue.crop.trim() === '') {
    errors.push('Crop name is required');
  }

  if (!revenue.receivedByMemberId) {
    errors.push('Member who received payment is required');
  }

  return { valid: errors.length === 0, errors };
};

export type MoneyEntry =
  | { kind: 'expense'; record: Expense }
  | { kind: 'labour'; record: Labour }
  | { kind: 'revenue'; record: HarvestRevenue };

const MONEY_ENTRY_REJECTION_TITLES: Record<MoneyEntry['kind'], string> = {
  expense: 'Invalid Expense',
  labour: 'Invalid Labour Entry',
  revenue: 'Invalid Revenue Entry'
};

// Why a money entry may not be saved, or null when it may. Adding and editing
// both ask this, so an edit cannot save what an add would have refused.
export const moneyEntryRejection = (
  entry: MoneyEntry
): { title: string; message: string; logEvent: string } | null => {
  const { valid, errors } =
    entry.kind === 'expense' ? validateExpense(entry.record)
    : entry.kind === 'labour' ? validateLabour(entry.record)
    : validateRevenue(entry.record);
  if (valid) return null;
  return {
    title: MONEY_ENTRY_REJECTION_TITLES[entry.kind],
    message: errors.join('; '),
    logEvent: `${entry.kind}_validation_failed`
  };
};

// Validate purchase
export const validatePurchase = (purchase: StockPurchase): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const costCheck = validatePurchaseAmount(purchase.totalCost);
  if (!costCheck.valid) errors.push(costCheck.error!);

  const qtyCheck = validateQuantity(purchase.quantity);
  if (!qtyCheck.valid) errors.push('Quantity must be greater than 0');

  const dateCheck = validateDateString(purchase.date);
  if (!dateCheck.valid) errors.push(dateCheck.error!);

  if (purchase.isCredit) {
    if (!purchase.creditAccountId) {
      errors.push('Credit account is required for credit purchases');
    }
  } else if (!purchase.paidByMemberId) {
    errors.push('Member who paid is required');
  }

  return { valid: errors.length === 0, errors };
};

// Validate stock usage
export const validateUsage = (usage: StockUsage): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const qtyCheck = validateQuantity(usage.quantityUsed);
  if (!qtyCheck.valid) errors.push('Quantity used must be greater than 0');

  const dateCheck = validateDateString(usage.date);
  if (!dateCheck.valid) errors.push(dateCheck.error!);

  return { valid: errors.length === 0, errors };
};
