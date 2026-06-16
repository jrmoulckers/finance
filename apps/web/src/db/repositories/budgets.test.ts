// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetPeriod, Category } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, SqliteDb } from '../sqlite-wasm';

// Mock sqlite-wasm module
vi.mock('../sqlite-wasm', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

const mockGetAllCategories = vi.fn<(...args: unknown[]) => Category[]>();
const mockCreateCategory = vi.fn<(...args: unknown[]) => Category>();

vi.mock('./categories', () => ({
  getAllCategories: (...args: unknown[]) => mockGetAllCategories(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
}));

import {
  createBudget,
  createBudgetTemplate,
  deleteBudget,
  getAllBudgets,
  getBudgetById,
  getBudgetSpendingBreakdown,
  getBudgetWithSpending,
  type CreateBudgetInput,
} from './budgets';

// Import mocked functions
import { execute, query, queryOne } from '../sqlite-wasm';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe('budgets repository', () => {
  const mockDb = {} as SqliteDb;
  const syncMetadata = {
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllBudgets', () => {
    it('should return mapped budget objects', () => {
      const mockRows: Row[] = [
        {
          id: 'budget-1',
          household_id: 'hh-1',
          category_id: 'cat-1',
          name: 'Groceries Budget',
          amount: 50000,
          currency: 'USD',
          period: 'MONTHLY',
          start_date: '2024-01-01',
          end_date: null,
          is_rollover: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
        {
          id: 'budget-2',
          household_id: 'hh-1',
          category_id: 'cat-2',
          name: 'Entertainment',
          amount: 20000,
          currency: 'EUR',
          period: 'WEEKLY',
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          is_rollover: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 1,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const budgets = getAllBudgets(mockDb);

      expect(budgets).toHaveLength(2);
      expect(budgets[0]).toMatchObject({
        id: 'budget-1',
        name: 'Groceries Budget',
        amount: { amount: 50000 },
        currency: Currencies.USD,
        period: 'MONTHLY',
        startDate: '2024-01-01',
        endDate: null,
        isRollover: true,
      });
      expect(budgets[1]).toMatchObject({
        id: 'budget-2',
        name: 'Entertainment',
        amount: { amount: 20000 },
        isRollover: false,
        endDate: '2024-12-31',
      });
    });

    it('should filter out deleted budgets via WHERE clause', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getAllBudgets(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
      );
    });

    it('should order by start_date DESC and name ASC', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getAllBudgets(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('ORDER BY start_date DESC, name ASC'),
      );
    });

    it('should preserve monetary amounts as integers', () => {
      const mockRows: Row[] = [
        {
          id: 'budget-1',
          household_id: 'hh-1',
          category_id: 'cat-1',
          name: 'Budget',
          amount: 123456,
          currency: 'USD',
          period: 'MONTHLY',
          start_date: '2024-01-01',
          end_date: null,
          is_rollover: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const budgets = getAllBudgets(mockDb);

      expect(budgets[0].amount.amount).toBe(123456);
      expect(Number.isInteger(budgets[0].amount.amount)).toBe(true);
    });
  });

  describe('getBudgetById', () => {
    it('should return budget when found', () => {
      const mockRow: Row = {
        id: 'budget-1',
        household_id: 'hh-1',
        category_id: 'cat-1',
        name: 'Budget',
        amount: 50000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2024-01-01',
        end_date: null,
        is_rollover: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      };

      mockQueryOne.mockReturnValue(mockRow);

      const budget = getBudgetById(mockDb, 'budget-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['budget-1'],
      );
      expect(budget).not.toBeNull();
      expect(budget?.id).toBe('budget-1');
    });

    it('should return null when not found', () => {
      mockQueryOne.mockReturnValue(null);

      const budget = getBudgetById(mockDb, 'nonexistent');

      expect(budget).toBeNull();
    });

    it('should use parameterized query', () => {
      mockQueryOne.mockReturnValue(null);

      getBudgetById(mockDb, 'budget-1');

      const sql = mockQueryOne.mock.calls[0][1];
      expect(sql).toContain('id = ?');
      expect(sql).not.toContain("id = 'budget-1'");
    });
  });

  describe('getBudgetWithSpending', () => {
    it('rolls up spending from child categories using the recursive scope query', () => {
      mockQueryOne.mockReturnValue({
        id: 'budget-1',
        household_id: 'hh-1',
        category_id: 'cat-food',
        name: 'Food & Meals',
        amount: 70000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2025-03-01',
        end_date: null,
        is_rollover: 0,
        created_at: '2025-03-01T00:00:00Z',
        updated_at: '2025-03-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
        spent_amount: 42350,
      });

      const budget = getBudgetWithSpending(mockDb, 'budget-1');

      expect(budget?.spentAmount.amount).toBe(42350);
      expect(budget?.remainingAmount.amount).toBe(27650);
      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WITH RECURSIVE budget_category_scope'),
        ['budget-1', 'budget-1'],
      );
      expect(mockQueryOne.mock.calls[0]?.[1]).toContain(
        't.category_id IN (SELECT id FROM budget_category_scope)',
      );
    });
  });

  describe('getBudgetSpendingBreakdown', () => {
    it('returns grouped spending rows ordered by highest spend', () => {
      mockQuery.mockReturnValue({
        columns: [],
        rows: [
          { category_id: 'cat-groceries', category_name: 'Groceries', spent_amount: 25000 },
          { category_id: 'cat-dining', category_name: 'Dining Out', spent_amount: 17350 },
        ],
      });

      const breakdown = getBudgetSpendingBreakdown(mockDb, 'budget-1');

      expect(breakdown).toEqual([
        {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          spentAmount: { amount: 25000 },
        },
        {
          categoryId: 'cat-dining',
          categoryName: 'Dining Out',
          spentAmount: { amount: 17350 },
        },
      ]);
      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('HAVING spent_amount > 0'),
        ['budget-1', 'budget-1'],
      );
    });
  });

  describe('createBudget', () => {
    beforeEach(() => {
      mockQueryOne.mockReturnValue({
        id: 'new-budget',
        household_id: 'hh-1',
        category_id: 'cat-1',
        name: 'New Budget',
        amount: 100000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2024-01-01',
        end_date: null,
        is_rollover: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });
    });

    it('should execute INSERT with correct parameters', () => {
      const input: CreateBudgetInput = {
        householdId: 'hh-1',
        categoryId: 'cat-1',
        name: 'New Budget',
        amount: { amount: 100000 },
        period: 'MONTHLY' as BudgetPeriod,
        startDate: '2024-01-01',
      };

      createBudget(mockDb, input);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('INSERT INTO budget'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'hh-1',
          'cat-1',
          'New Budget',
          100000,
          'USD', // Default currency
          'MONTHLY',
          '2024-01-01',
          null, // endDate
          0, // isRollover
        ]),
      );
    });

    it('should use ? placeholders not string interpolation', () => {
      const input: CreateBudgetInput = {
        householdId: 'hh-1',
        categoryId: 'cat-1',
        name: 'Budget',
        amount: { amount: 100000 },
        period: 'MONTHLY' as BudgetPeriod,
        startDate: '2024-01-01',
      };

      createBudget(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain('Budget');
    });

    it('should store amount as integer', () => {
      const input: CreateBudgetInput = {
        householdId: 'hh-1',
        categoryId: 'cat-1',
        name: 'Budget',
        amount: { amount: 987654 },
        period: 'YEARLY' as BudgetPeriod,
        startDate: '2024-01-01',
      };

      createBudget(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const amountParam = params[4]; // amount is 5th param
      expect(amountParam).toBe(987654);
      expect(Number.isInteger(amountParam as number)).toBe(true);
    });

    it('should default to USD when currency not provided', () => {
      const input: CreateBudgetInput = {
        householdId: 'hh-1',
        categoryId: 'cat-1',
        name: 'Budget',
        amount: { amount: 100000 },
        period: 'MONTHLY' as BudgetPeriod,
        startDate: '2024-01-01',
      };

      createBudget(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[5]).toBe('USD');
    });

    it('should handle optional fields', () => {
      const input: CreateBudgetInput = {
        householdId: 'hh-1',
        categoryId: 'cat-1',
        name: 'Budget',
        amount: { amount: 100000 },
        currency: Currencies.EUR,
        period: 'MONTHLY' as BudgetPeriod,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        isRollover: true,
      };

      createBudget(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[5]).toBe('EUR');
      expect(params[8]).toBe('2024-12-31');
      expect(params[9]).toBe(1); // isRollover
    });

    it('should accept valid budget periods', () => {
      const periods: BudgetPeriod[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

      periods.forEach((period) => {
        vi.clearAllMocks();
        mockQueryOne.mockReturnValue({
          id: 'budget-1',
          household_id: 'hh-1',
          category_id: 'cat-1',
          name: 'Budget',
          amount: 100000,
          currency: 'USD',
          period,
          start_date: '2024-01-01',
          end_date: null,
          is_rollover: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        });

        const input: CreateBudgetInput = {
          householdId: 'hh-1',
          categoryId: 'cat-1',
          name: 'Budget',
          amount: { amount: 100000 },
          period,
          startDate: '2024-01-01',
        };

        createBudget(mockDb, input);

        const params = mockExecute.mock.calls[0][2] as unknown[];
        expect(params[6]).toBe(period);
      });
    });
  });

  describe('createBudgetTemplate', () => {
    it('creates all student starter budgets and only creates missing categories', () => {
      mockGetAllCategories.mockReturnValue([
        {
          id: 'category-food-groceries',
          householdId: 'hh-1',
          name: 'Food & Groceries',
          icon: 'utensils',
          color: '#16A34A',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 1,
          ...syncMetadata,
        },
      ]);

      let createdCategoryCount = 0;
      mockCreateCategory.mockImplementation((_, input) => {
        const createInput = input as {
          householdId: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          sortOrder?: number;
        };

        createdCategoryCount += 1;
        return {
          id: `category-created-${createdCategoryCount}`,
          householdId: createInput.householdId,
          name: createInput.name,
          icon: createInput.icon ?? null,
          color: createInput.color ?? null,
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: createInput.sortOrder ?? createdCategoryCount,
          ...syncMetadata,
        };
      });

      mockQueryOne.mockImplementation((_, sql, params) => {
        if (typeof sql === 'string' && sql.includes('WHERE deleted_at IS NULL AND id = ?')) {
          const queryParams = (params ?? []) as unknown[];
          const budgetId = queryParams[0] as string;
          const executeCall = mockExecute.mock.calls.find(
            ([, , executeParams]) => (executeParams as unknown[] | undefined)?.[0] === budgetId,
          );
          const budgetParams = (executeCall?.[2] ?? []) as unknown[];
          return {
            id: budgetId,
            household_id: budgetParams[1],
            category_id: budgetParams[2],
            name: budgetParams[3],
            amount: budgetParams[4],
            currency: budgetParams[5],
            period: budgetParams[6],
            start_date: budgetParams[7],
            end_date: budgetParams[8],
            is_rollover: budgetParams[9],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            deleted_at: null,
            sync_version: 1,
            is_synced: 0,
          } satisfies Row;
        }

        return null;
      });

      const budgets = createBudgetTemplate(mockDb, {
        templateId: 'student',
        startDate: '2024-09-01',
      });

      expect(budgets).toHaveLength(9);
      expect(mockCreateCategory).toHaveBeenCalledTimes(8);
      expect(budgets.map((budget) => budget.name)).toContain('Rent/Housing');
      expect(budgets.map((budget) => budget.name)).toContain('Food & Groceries');
      expect(
        mockExecute.mock.calls.some(
          ([, sql, params]) =>
            typeof sql === 'string' &&
            sql.includes('INSERT INTO budget') &&
            params?.[3] === 'Savings' &&
            params?.[4] === 2000,
        ),
      ).toBe(true);
    });
  });

  describe('deleteBudget', () => {
    it('should soft-delete by setting deleted_at', () => {
      mockQueryOne.mockReturnValue({
        id: 'budget-1',
        household_id: 'hh-1',
        category_id: 'cat-1',
        name: 'Budget',
        amount: 100000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2024-01-01',
        end_date: null,
        is_rollover: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      const result = deleteBudget(mockDb, 'budget-1');

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.stringContaining('UPDATE budget'), [
        'budget-1',
      ]);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET deleted_at =');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
    });

    it('should return false when budget not found', () => {
      mockQueryOne.mockReturnValue(null);

      const result = deleteBudget(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should use parameterized query', () => {
      mockQueryOne.mockReturnValue({
        id: 'budget-1',
        household_id: 'hh-1',
        category_id: 'cat-1',
        name: 'Budget',
        amount: 100000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2024-01-01',
        end_date: null,
        is_rollover: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      deleteBudget(mockDb, 'budget-1');

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).not.toContain("id = 'budget-1'");
    });
  });

  describe('createBudgetTemplate', () => {
    it('creates a single Food & Meals budget while adding tracked child categories', () => {
      const createdFoodCategory: Category = {
        id: 'cat-food-meals',
        householdId: 'hh-1',
        name: 'Food & Meals',
        icon: 'utensils',
        color: '#16A34A',
        parentId: null,
        isIncome: false,
        isSystem: false,
        sortOrder: 5,
        ...syncMetadata,
      };
      const createdGroceriesCategory: Category = {
        id: 'cat-groceries',
        householdId: 'hh-1',
        name: 'Groceries',
        icon: '🛒',
        color: '#16A34A',
        parentId: 'cat-food-meals',
        isIncome: false,
        isSystem: false,
        sortOrder: 6,
        ...syncMetadata,
      };
      const createdDiningCategory: Category = {
        id: 'cat-dining',
        householdId: 'hh-1',
        name: 'Dining Out',
        icon: '🍽️',
        color: '#F97316',
        parentId: 'cat-food-meals',
        isIncome: false,
        isSystem: false,
        sortOrder: 7,
        ...syncMetadata,
      };
      const createdDeliveryCategory: Category = {
        id: 'cat-delivery',
        householdId: 'hh-1',
        name: 'Delivery & Takeout',
        icon: '🥡',
        color: '#FB7185',
        parentId: 'cat-food-meals',
        isIncome: false,
        isSystem: false,
        sortOrder: 8,
        ...syncMetadata,
      };
      const createdCoffeeCategory: Category = {
        id: 'cat-coffee',
        householdId: 'hh-1',
        name: 'Coffee & Snacks',
        icon: '☕',
        color: '#A16207',
        parentId: 'cat-food-meals',
        isIncome: false,
        isSystem: false,
        sortOrder: 9,
        ...syncMetadata,
      };
      const createdMealPrepCategory: Category = {
        id: 'cat-meal-prep',
        householdId: 'hh-1',
        name: 'Meal Prep',
        icon: '🥗',
        color: '#0F766E',
        parentId: 'cat-food-meals',
        isIncome: false,
        isSystem: false,
        sortOrder: 10,
        ...syncMetadata,
      };

      mockGetAllCategories.mockReturnValue([]);
      mockCreateCategory
        .mockReturnValueOnce(createdFoodCategory)
        .mockReturnValueOnce(createdGroceriesCategory)
        .mockReturnValueOnce(createdDiningCategory)
        .mockReturnValueOnce(createdDeliveryCategory)
        .mockReturnValueOnce(createdCoffeeCategory)
        .mockReturnValueOnce(createdMealPrepCategory);
      mockQueryOne.mockImplementation((_, sql, params) => {
        if (
          typeof sql === 'string' &&
          sql.includes('SELECT id FROM household WHERE deleted_at IS NULL')
        ) {
          return { id: 'hh-1' } satisfies Row;
        }

        if (typeof sql === 'string' && sql.includes('WHERE deleted_at IS NULL AND id = ?')) {
          const queryParams = (params ?? []) as unknown[];
          const budgetId = queryParams[0] as string;
          const executeCall = mockExecute.mock.calls.find(
            ([, , executeParams]) => (executeParams as unknown[] | undefined)?.[0] === budgetId,
          );
          const budgetParams = (executeCall?.[2] ?? []) as unknown[];
          return {
            id: budgetId,
            household_id: budgetParams[1],
            category_id: budgetParams[2],
            name: budgetParams[3],
            amount: budgetParams[4],
            currency: budgetParams[5],
            period: budgetParams[6],
            start_date: budgetParams[7],
            end_date: budgetParams[8],
            is_rollover: budgetParams[9],
            created_at: '2025-03-01T00:00:00Z',
            updated_at: '2025-03-01T00:00:00Z',
            deleted_at: null,
            sync_version: 1,
            is_synced: 0,
          } satisfies Row;
        }

        return null;
      });

      const budgets = createBudgetTemplate(mockDb, {
        templateId: 'food-meals',
        startDate: '2025-03-01',
      });

      expect(budgets).toHaveLength(1);
      expect(budgets[0]?.name).toBe('Food & Meals');
      expect(mockCreateCategory).toHaveBeenCalledTimes(6);
      expect(mockCreateCategory.mock.calls[1]?.[1]).toMatchObject({
        name: 'Groceries',
        parentId: 'cat-food-meals',
      });
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('parameterized placeholders', () => {
    it('should use ? placeholders in all queries', () => {
      // getAllBudgets
      mockQuery.mockReturnValue({ columns: [], rows: [] });
      getAllBudgets(mockDb);
      let sql = mockQuery.mock.calls[0][1];
      expect(sql).not.toContain("deleted_at = 'NULL'");

      // getBudgetById
      mockQueryOne.mockReturnValue(null);
      getBudgetById(mockDb, 'budget-1');
      sql = mockQueryOne.mock.calls[0][1];
      expect(sql).toContain('id = ?');

      // createBudget
      mockQueryOne.mockReturnValue({
        id: 'budget-1',
        household_id: 'hh-1',
        category_id: 'cat-1',
        name: 'Budget',
        amount: 100000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2024-01-01',
        end_date: null,
        is_rollover: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });
      const input: CreateBudgetInput = {
        householdId: 'hh-1',
        categoryId: 'cat-1',
        name: 'Budget',
        amount: { amount: 100000 },
        period: 'MONTHLY' as BudgetPeriod,
        startDate: '2024-01-01',
      };
      createBudget(mockDb, input);
      sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('?');
      expect(sql).not.toContain('100000');
    });
  });
});
