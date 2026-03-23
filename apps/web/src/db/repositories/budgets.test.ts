// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetPeriod } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, SqliteDb } from '../sqlite-wasm';
import {
  createBudget,
  deleteBudget,
  getAllBudgets,
  getBudgetById,
  type CreateBudgetInput,
} from './budgets';

// Mock sqlite-wasm module
vi.mock('../sqlite-wasm', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

// Import mocked functions
import { execute, query, queryOne } from '../sqlite-wasm';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe('budgets repository', () => {
  const mockDb = {} as SqliteDb;

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
