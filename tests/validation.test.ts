import { describe, it, expect } from 'vitest';
import {
  validateExpenseAmount,
  validateExpense,
  validateLabour,
  validateRevenue,
  validatePurchase,
  validateFieldShares,
  validateSeasonShares,
  validateQuantity,
  validateMemberShare,
  validateSharesSum,
  validateDateString
} from '../src/utils/validation';
import { Expense, Labour, HarvestRevenue, StockPurchase, Field, Season, MemberShare } from '../src/types';

describe('Validation Functions', () => {
  describe('Amount Validation', () => {
    it('should reject zero amount', () => {
      const result = validateExpenseAmount(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('greater than 0');
    });

    it('should reject negative amount', () => {
      const result = validateExpenseAmount(-10);
      expect(result.valid).toBe(false);
    });

    it('should accept positive amount', () => {
      const result = validateExpenseAmount(100);
      expect(result.valid).toBe(true);
    });
  });

  describe('Quantity Validation', () => {
    it('should reject zero quantity', () => {
      const result = validateQuantity(0);
      expect(result.valid).toBe(false);
    });

    it('should accept positive quantity', () => {
      const result = validateQuantity(5);
      expect(result.valid).toBe(true);
    });
  });

  describe('Member Share Validation', () => {
    it('should accept valid share percentages', () => {
      expect(validateMemberShare(0)).toBe(true);
      expect(validateMemberShare(50)).toBe(true);
      expect(validateMemberShare(100)).toBe(true);
    });

    it('should reject invalid share percentages', () => {
      expect(validateMemberShare(-10)).toBe(false);
      expect(validateMemberShare(150)).toBe(false);
    });
  });

  describe('Shares Sum Validation', () => {
    it('should accept shares that sum to 100', () => {
      const shares = [50, 30, 20];
      expect(validateSharesSum(shares)).toBe(true);
    });

    it('should reject shares that do not sum to 100', () => {
      const shares = [50, 30, 15]; // Sums to 95
      expect(validateSharesSum(shares)).toBe(false);
    });

    it('should handle floating point precision', () => {
      const shares = [33.33, 33.33, 33.34]; // Sum = 100.00
      expect(validateSharesSum(shares)).toBe(true);
    });
  });

  describe('Date Validation', () => {
    it('should accept valid ISO dates', () => {
      const result = validateDateString('2024-01-15');
      expect(result.valid).toBe(true);
    });

    it('should accept ISO datetime strings', () => {
      const result = validateDateString('2024-01-15T10:30:00Z');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid date strings', () => {
      const result = validateDateString('not-a-date');
      expect(result.valid).toBe(false);
    });
  });

  describe('Field Shares Validation', () => {
    it('should accept field with shares summing to 100%', () => {
      const field: Field = {
        id: 'f1',
        name: 'Field A',
        area: 10,
        shares: [
          { memberId: 'm1', percentage: 60 },
          { memberId: 'm2', percentage: 40 }
        ]
      };
      const result = validateFieldShares(field);
      expect(result.valid).toBe(true);
    });

    it('should reject field with shares not summing to 100%', () => {
      const field: Field = {
        id: 'f1',
        name: 'Field A',
        area: 10,
        shares: [
          { memberId: 'm1', percentage: 60 },
          { memberId: 'm2', percentage: 30 } // Only 90%
        ]
      };
      const result = validateFieldShares(field);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sum to 100%');
    });
  });

  describe('Season Shares Validation', () => {
    it('should pass if season has no custom shares', () => {
      const season: Season = {
        id: 's1',
        fieldId: 'f1',
        cropName: 'Rice',
        startDate: '2024-01-01',
        isClosed: false
      };
      const result = validateSeasonShares(season);
      expect(result.valid).toBe(true);
    });

    it('should validate custom season shares', () => {
      const season: Season = {
        id: 's1',
        fieldId: 'f1',
        cropName: 'Rice',
        startDate: '2024-01-01',
        isClosed: false,
        shares: [
          { memberId: 'm1', percentage: 50 },
          { memberId: 'm2', percentage: 50 }
        ]
      };
      const result = validateSeasonShares(season);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid custom season shares', () => {
      const season: Season = {
        id: 's1',
        fieldId: 'f1',
        cropName: 'Rice',
        startDate: '2024-01-01',
        isClosed: false,
        shares: [
          { memberId: 'm1', percentage: 50 },
          { memberId: 'm2', percentage: 30 } // Only 80%
        ]
      };
      const result = validateSeasonShares(season);
      expect(result.valid).toBe(false);
    });
  });

  describe('Comprehensive Expense Validation', () => {
    it('should accept valid expense', () => {
      const expense: Expense = {
        id: 'exp1',
        date: '2024-01-15',
        amount: 1000,
        paidByMemberId: 'm1',
        category: 'Seeds',
        targetType: 'single',
        targetFieldId: 'f1',
        targetSeasonId: 's1'
      };
      const result = validateExpense(expense);
      expect(result.valid).toBe(true);
    });

    it('should reject expense with invalid amount', () => {
      const expense: Expense = {
        id: 'exp1',
        date: '2024-01-15',
        amount: 0,
        paidByMemberId: 'm1',
        category: 'Seeds',
        targetType: 'single'
      };
      const result = validateExpense(expense);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject expense without paidByMemberId', () => {
      const expense: Expense = {
        id: 'exp1',
        date: '2024-01-15',
        amount: 1000,
        paidByMemberId: '',
        category: 'Seeds',
        targetType: 'single'
      };
      const result = validateExpense(expense);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Member'))).toBe(true);
    });

    it('should reject credit expense without creditAccountId', () => {
      const expense: Expense = {
        id: 'exp1',
        date: '2024-01-15',
        amount: 1000,
        paidByMemberId: 'm1',
        category: 'Seeds',
        targetType: 'single',
        isCredit: true
      };
      const result = validateExpense(expense);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('credit account'))).toBe(true);
    });

    it('should accept a credit expense with no paidByMemberId as long as a creditAccountId is set', () => {
      // Regression test: the UI intentionally sends paidByMemberId: '' for credit
      // entries (the creditor goes in creditAccountId instead). validateExpense used
      // to require paidByMemberId unconditionally, so every credit expense failed
      // with "Member who paid is required" even after picking a valid creditor.
      const expense: Expense = {
        id: 'exp1',
        date: '2024-01-15',
        amount: 1000,
        paidByMemberId: '',
        category: 'Seeds',
        targetType: 'single',
        isCredit: true,
        creditAccountId: 'c1'
      };
      const result = validateExpense(expense);
      expect(result.valid).toBe(true);
      expect(result.errors.some(e => e.includes('Member who paid'))).toBe(false);
    });
  });

  describe('Labour Validation', () => {
    it('should accept valid labour entry', () => {
      const labour: Labour = {
        id: 'lab1',
        date: '2024-01-15',
        fieldId: 'f1',
        seasonId: 's1',
        workersCount: 5,
        wageRate: 200,
        totalCost: 1000,
        paidByMemberId: 'm1'
      };
      const result = validateLabour(labour);
      expect(result.valid).toBe(true);
    });

    it('should reject labour with zero workers', () => {
      const labour: Labour = {
        id: 'lab1',
        date: '2024-01-15',
        fieldId: 'f1',
        seasonId: 's1',
        workersCount: 0,
        wageRate: 200,
        totalCost: 0,
        paidByMemberId: 'm1'
      };
      const result = validateLabour(labour);
      expect(result.valid).toBe(false);
    });

    it('should reject credit labour without creditAccountId', () => {
      const labour: Labour = {
        id: 'lab1',
        date: '2024-01-15',
        fieldId: 'f1',
        seasonId: 's1',
        workersCount: 5,
        wageRate: 200,
        totalCost: 1000,
        paidByMemberId: '',
        isCredit: true
      };
      const result = validateLabour(labour);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('credit account'))).toBe(true);
    });

    it('should accept a credit labour cost with no paidByMemberId as long as a creditAccountId is set', () => {
      // Regression test: mirrors the credit-expense bug above for the labour form.
      const labour: Labour = {
        id: 'lab1',
        date: '2024-01-15',
        fieldId: 'f1',
        seasonId: 's1',
        workersCount: 5,
        wageRate: 200,
        totalCost: 1000,
        paidByMemberId: '',
        isCredit: true,
        creditAccountId: 'c1'
      };
      const result = validateLabour(labour);
      expect(result.valid).toBe(true);
      expect(result.errors.some(e => e.includes('Member who paid'))).toBe(false);
    });
  });

  describe('Purchase Validation', () => {
    it('should accept a valid direct-paid purchase', () => {
      const purchase: StockPurchase = {
        id: 'p1',
        stockItemId: 'stk1',
        quantity: 10,
        totalCost: 5000,
        date: '2024-01-15',
        paidByMemberId: 'm1'
      };
      const result = validatePurchase(purchase);
      expect(result.valid).toBe(true);
    });

    it('should reject a purchase without paidByMemberId when not on credit', () => {
      const purchase: StockPurchase = {
        id: 'p1',
        stockItemId: 'stk1',
        quantity: 10,
        totalCost: 5000,
        date: '2024-01-15',
        paidByMemberId: ''
      };
      const result = validatePurchase(purchase);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Member who paid'))).toBe(true);
    });

    it('should reject a credit purchase without creditAccountId', () => {
      const purchase: StockPurchase = {
        id: 'p1',
        stockItemId: 'stk1',
        quantity: 10,
        totalCost: 5000,
        date: '2024-01-15',
        paidByMemberId: '',
        isCredit: true
      };
      const result = validatePurchase(purchase);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('credit account'))).toBe(true);
    });

    it('should accept a credit purchase with no paidByMemberId as long as a creditAccountId is set', () => {
      // Regression test: mirrors the credit-expense bug above for stock purchases.
      const purchase: StockPurchase = {
        id: 'p1',
        stockItemId: 'stk1',
        quantity: 10,
        totalCost: 5000,
        date: '2024-01-15',
        paidByMemberId: '',
        isCredit: true,
        creditAccountId: 'c1'
      };
      const result = validatePurchase(purchase);
      expect(result.valid).toBe(true);
      expect(result.errors.some(e => e.includes('Member who paid'))).toBe(false);
    });
  });

  describe('Revenue Validation', () => {
    it('should accept valid revenue entry', () => {
      const revenue: HarvestRevenue = {
        id: 'rev1',
        date: '2024-06-15',
        fieldId: 'f1',
        seasonId: 's1',
        crop: 'Rice',
        quantity: 100,
        saleAmount: 50000,
        receivedByMemberId: 'm1'
      };
      const result = validateRevenue(revenue);
      expect(result.valid).toBe(true);
    });

    it('should reject revenue without crop name', () => {
      const revenue: HarvestRevenue = {
        id: 'rev1',
        date: '2024-06-15',
        fieldId: 'f1',
        seasonId: 's1',
        crop: '',
        quantity: 100,
        saleAmount: 50000,
        receivedByMemberId: 'm1'
      };
      const result = validateRevenue(revenue);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('crop'))).toBe(true);
    });
  });
});
