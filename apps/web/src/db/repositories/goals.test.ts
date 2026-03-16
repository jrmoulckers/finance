// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalStatus } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, SqliteDb } from '../sqlite-wasm';
import {
  createGoal,
  deleteGoal,
  getActiveGoals,
  getAllGoals,
  getGoalById,
  type CreateGoalInput,
} from './goals';

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

describe('goals repository', () => {
  const mockDb = {} as SqliteDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllGoals', () => {
    it('should return mapped goal objects', () => {
      const mockRows: Row[] = [
        {
          id: 'goal-1',
          household_id: 'hh-1',
          name: 'Emergency Fund',
          target_amount: 1000000,
          current_amount: 500000,
          currency: 'USD',
          target_date: '2024-12-31',
          status: 'ACTIVE',
          icon: 'piggy-bank',
          color: '#10b981',
          account_id: 'acc-1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
        {
          id: 'goal-2',
          household_id: 'hh-1',
          name: 'Vacation',
          target_amount: 200000,
          current_amount: 150000,
          currency: 'EUR',
          target_date: null,
          status: 'ACTIVE',
          icon: null,
          color: null,
          account_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 1,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const goals = getAllGoals(mockDb);

      expect(goals).toHaveLength(2);
      expect(goals[0]).toMatchObject({
        id: 'goal-1',
        name: 'Emergency Fund',
        targetAmount: { amount: 1000000 },
        currentAmount: { amount: 500000 },
        currency: Currencies.USD,
        targetDate: '2024-12-31',
        status: 'ACTIVE',
        icon: 'piggy-bank',
        color: '#10b981',
        accountId: 'acc-1',
      });
      expect(goals[1]).toMatchObject({
        id: 'goal-2',
        name: 'Vacation',
        targetDate: null,
        icon: null,
        color: null,
        accountId: null,
      });
    });

    it('should filter out deleted goals via WHERE clause', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getAllGoals(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
      );
    });

    it('should order by target_date and name', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getAllGoals(mockDb);

      const sql = mockQuery.mock.calls[0][1];
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('target_date');
      expect(sql).toContain('name ASC');
    });

    it('should preserve monetary amounts as integers', () => {
      const mockRows: Row[] = [
        {
          id: 'goal-1',
          household_id: 'hh-1',
          name: 'Goal',
          target_amount: 123456,
          current_amount: 789012,
          currency: 'USD',
          target_date: null,
          status: 'ACTIVE',
          icon: null,
          color: null,
          account_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const goals = getAllGoals(mockDb);

      expect(goals[0].targetAmount.amount).toBe(123456);
      expect(goals[0].currentAmount.amount).toBe(789012);
      expect(Number.isInteger(goals[0].targetAmount.amount)).toBe(true);
      expect(Number.isInteger(goals[0].currentAmount.amount)).toBe(true);
    });
  });

  describe('getGoalById', () => {
    it('should return goal when found', () => {
      const mockRow: Row = {
        id: 'goal-1',
        household_id: 'hh-1',
        name: 'Goal',
        target_amount: 100000,
        current_amount: 50000,
        currency: 'USD',
        target_date: '2024-12-31',
        status: 'ACTIVE',
        icon: null,
        color: null,
        account_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      };

      mockQueryOne.mockReturnValue(mockRow);

      const goal = getGoalById(mockDb, 'goal-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['goal-1'],
      );
      expect(goal).not.toBeNull();
      expect(goal?.id).toBe('goal-1');
    });

    it('should return null when not found', () => {
      mockQueryOne.mockReturnValue(null);

      const goal = getGoalById(mockDb, 'nonexistent');

      expect(goal).toBeNull();
    });

    it('should use parameterized query', () => {
      mockQueryOne.mockReturnValue(null);

      getGoalById(mockDb, 'goal-1');

      const sql = mockQueryOne.mock.calls[0][1];
      expect(sql).toContain('id = ?');
      expect(sql).not.toContain("id = 'goal-1'");
    });
  });

  describe('createGoal', () => {
    beforeEach(() => {
      mockQueryOne.mockReturnValue({
        id: 'new-goal',
        household_id: 'hh-1',
        name: 'New Goal',
        target_amount: 100000,
        current_amount: 0,
        currency: 'USD',
        target_date: null,
        status: 'ACTIVE',
        icon: null,
        color: null,
        account_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });
    });

    it('should execute INSERT with correct parameters', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'New Goal',
        targetAmount: { amount: 100000 },
      };

      createGoal(mockDb, input);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('INSERT INTO goal'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'hh-1',
          'New Goal',
          100000,
          0, // Default currentAmount
          'USD', // Default currency
          null, // targetDate
          'ACTIVE', // Default status
          null, // icon
          null, // color
          null, // accountId
        ]),
      );
    });

    it('should use ? placeholders not string interpolation', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'New Goal',
        targetAmount: { amount: 100000 },
      };

      createGoal(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain('New Goal');
    });

    it('should store amounts as integers', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'Goal',
        targetAmount: { amount: 999888 },
        currentAmount: { amount: 111222 },
      };

      createGoal(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[3]).toBe(999888); // targetAmount
      expect(params[4]).toBe(111222); // currentAmount
      expect(Number.isInteger(params[3] as number)).toBe(true);
      expect(Number.isInteger(params[4] as number)).toBe(true);
    });

    it('should default currentAmount to 0 when not provided', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'Goal',
        targetAmount: { amount: 100000 },
      };

      createGoal(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[4]).toBe(0);
    });

    it('should default to USD when currency not provided', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'Goal',
        targetAmount: { amount: 100000 },
      };

      createGoal(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[5]).toBe('USD');
    });

    it('should default status to ACTIVE when not provided', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'Goal',
        targetAmount: { amount: 100000 },
      };

      createGoal(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[7]).toBe('ACTIVE');
    });

    it('should handle optional fields', () => {
      const input: CreateGoalInput = {
        householdId: 'hh-1',
        name: 'Custom Goal',
        targetAmount: { amount: 500000 },
        currentAmount: { amount: 100000 },
        currency: Currencies.EUR,
        targetDate: '2025-06-30',
        status: 'COMPLETED' as GoalStatus,
        icon: 'trophy',
        color: '#fbbf24',
        accountId: 'acc-1',
      };

      createGoal(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[4]).toBe(100000); // currentAmount
      expect(params[5]).toBe('EUR');
      expect(params[6]).toBe('2025-06-30');
      expect(params[7]).toBe('COMPLETED');
      expect(params[8]).toBe('trophy');
      expect(params[9]).toBe('#fbbf24');
      expect(params[10]).toBe('acc-1');
    });
  });

  describe('getActiveGoals', () => {
    it('should filter by ACTIVE status', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getActiveGoals(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(mockDb, expect.stringContaining('status = ?'), [
        'ACTIVE',
      ]);
    });

    it('should filter out deleted goals', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getActiveGoals(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
        expect.anything(),
      );
    });

    it('should use parameterized status query', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getActiveGoals(mockDb);

      const sql = mockQuery.mock.calls[0][1];
      expect(sql).toContain('status = ?');
      expect(sql).not.toContain("status = 'ACTIVE'");
    });

    it('should return only active goals', () => {
      const mockRows: Row[] = [
        {
          id: 'goal-1',
          household_id: 'hh-1',
          name: 'Active Goal',
          target_amount: 100000,
          current_amount: 50000,
          currency: 'USD',
          target_date: null,
          status: 'ACTIVE',
          icon: null,
          color: null,
          account_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const goals = getActiveGoals(mockDb);

      expect(goals).toHaveLength(1);
      expect(goals[0].status).toBe('ACTIVE');
    });
  });

  describe('deleteGoal', () => {
    it('should soft-delete by setting deleted_at', () => {
      mockQueryOne.mockReturnValue({
        id: 'goal-1',
        household_id: 'hh-1',
        name: 'Goal',
        target_amount: 100000,
        current_amount: 0,
        currency: 'USD',
        target_date: null,
        status: 'ACTIVE',
        icon: null,
        color: null,
        account_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      const result = deleteGoal(mockDb, 'goal-1');

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.stringContaining('UPDATE goal'), [
        'goal-1',
      ]);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET deleted_at =');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
    });

    it('should return false when goal not found', () => {
      mockQueryOne.mockReturnValue(null);

      const result = deleteGoal(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should use parameterized query', () => {
      mockQueryOne.mockReturnValue({
        id: 'goal-1',
        household_id: 'hh-1',
        name: 'Goal',
        target_amount: 100000,
        current_amount: 0,
        currency: 'USD',
        target_date: null,
        status: 'ACTIVE',
        icon: null,
        color: null,
        account_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      deleteGoal(mockDb, 'goal-1');

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).not.toContain("id = 'goal-1'");
    });
  });
});
