// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountType } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, AsyncDb } from '../async-db';
import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAllAccounts,
  updateAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from './accounts';

// Mock async-db module
vi.mock('../async-db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

// Import mocked functions for control
import { execute, query, queryOne } from '../async-db';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe('accounts repository', () => {
  const mockDb = {} as AsyncDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllAccounts', () => {
    it('should return mapped account objects', async () => {
      const mockRows: Row[] = [
        {
          id: 'acc-1',
          household_id: 'hh-1',
          name: 'Checking',
          type: 'CHECKING',
          purpose: 'business',
          currency_code: 'USD',
          balance_cents: 100000,
          is_active: 1,
          sort_order: 1,
          icon: 'bank',
          color: '#3b82f6',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
        },
        {
          id: 'acc-2',
          household_id: 'hh-1',
          name: 'Savings',
          type: 'SAVINGS',
          purpose: 'personal',
          currency_code: 'EUR',
          balance_cents: 250000,
          is_active: 0,
          sort_order: 2,
          icon: null,
          color: null,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          deleted_at: null,
        },
      ];

      mockQuery.mockResolvedValue({
        columns: Object.keys(mockRows[0]),
        rows: mockRows,
      });

      const accounts = await getAllAccounts(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('ORDER BY sort_order ASC, name ASC'),
      );
      expect(accounts).toHaveLength(2);
      expect(accounts[0]).toMatchObject({
        id: 'acc-1',
        name: 'Checking',
        type: 'CHECKING',
        purpose: 'business',
        currency: Currencies.USD,
        currentBalance: { amount: 100000 },
        isArchived: false,
        sortOrder: 1,
        icon: 'bank',
        color: '#3b82f6',
      });
      expect(accounts[1]).toMatchObject({
        id: 'acc-2',
        name: 'Savings',
        isArchived: true,
        icon: null,
        color: null,
      });
    });

    it('should filter out deleted accounts via WHERE clause', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getAllAccounts(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
      );
    });

    it('should preserve monetary values as integers', async () => {
      const mockRows: Row[] = [
        {
          id: 'acc-1',
          household_id: 'hh-1',
          name: 'Checking',
          type: 'CHECKING',
          currency_code: 'USD',
          balance_cents: 12345,
          is_active: 1,
          sort_order: 0,
          icon: null,
          color: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
        },
      ];

      mockQuery.mockResolvedValue({ columns: [], rows: mockRows });

      const accounts = await getAllAccounts(mockDb);

      expect(accounts[0].currentBalance.amount).toBe(12345);
      expect(Number.isInteger(accounts[0].currentBalance.amount)).toBe(true);
    });
  });

  describe('getAccountById', () => {
    it('should return mapped account object when found', async () => {
      const mockRow: Row = {
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Checking',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 100000,
        is_active: 1,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      };

      mockQueryOne.mockResolvedValue(mockRow);

      const account = await getAccountById(mockDb, 'acc-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['acc-1'],
      );
      expect(account).not.toBeNull();
      expect(account?.id).toBe('acc-1');
      expect(account?.name).toBe('Checking');
    });

    it('should return null when account not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const account = await getAccountById(mockDb, 'nonexistent');

      expect(account).toBeNull();
    });

    it('should use parameterized query with ? placeholder', async () => {
      mockQueryOne.mockResolvedValue(null);

      await getAccountById(mockDb, 'acc-1');

      expect(mockQueryOne).toHaveBeenCalledWith(mockDb, expect.any(String), ['acc-1']);
      const sql = mockQueryOne.mock.calls[0][1];
      expect(sql).toContain('id = ?');
      expect(sql).not.toContain('id = acc-1');
    });
  });

  describe('createAccount', () => {
    beforeEach(() => {
      // Mock getAccountById to return created account
      mockQueryOne.mockResolvedValue({
        id: 'new-acc-id',
        household_id: 'hh-1',
        name: 'New Account',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 50000,
        is_active: 1,
        sort_order: 0,
        icon: null,
        color: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });
    });

    it('should execute INSERT with correct SQL and parameters', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 50000 },
      };

      await createAccount(mockDb, input);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('INSERT INTO accounts'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'hh-1',
          'New Account',
          'CHECKING',
          'personal',
          'USD', // Default currency
          50000,
          1, // is_active (not archived)
          0, // sortOrder
          null, // icon
          null, // color
        ]),
      );
    });

    it('should use ? placeholders not string interpolation for values', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 50000 },
      };

      await createAccount(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      // Should use ? for parameters
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      // Should not have interpolated household ID
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain('New Account');
    });

    it('should store monetary amount as integer', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 123456 },
      };

      await createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const amountParam = params[9]; // balance_cents (index 9, after retirement metadata params)
      expect(amountParam).toBe(123456);
      expect(Number.isInteger(amountParam as number)).toBe(true);
    });

    it('should use provided currency code', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'Euro Account',
        type: 'CHECKING' as AccountType,
        currency: Currencies.EUR,
        currentBalance: { amount: 100000 },
      };

      await createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[8]).toBe('EUR');
    });

    it('should default to USD when currency not provided', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 100000 },
      };

      await createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[8]).toBe('USD');
    });

    it('should handle optional fields', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'Custom Account',
        type: 'SAVINGS' as AccountType,
        currentBalance: { amount: 100000 },
        isArchived: true,
        sortOrder: 5,
        icon: 'wallet',
        color: '#ff0000',
      };

      await createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[10]).toBe(0); // is_active (isArchived: true -> is_active 0)
      expect(params[11]).toBe(5); // sortOrder
      expect(params[12]).toBe('wallet'); // icon
      expect(params[13]).toBe('#ff0000'); // color
    });

    it('stores retirement classification metadata', async () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'Roth IRA',
        type: 'INVESTMENT' as AccountType,
        currentBalance: { amount: 100000 },
        retirementAccountType: 'ROTH_IRA',
        retirementTaxTreatment: 'ROTH',
      };

      await createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[5]).toBe('ROTH_IRA');
      expect(params[6]).toBe('ROTH');
      expect(params[7]).toBeNull();
    });
  });

  describe('updateAccount', () => {
    beforeEach(() => {
      // Mock existing account
      mockQueryOne.mockResolvedValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Old Name',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 50000,
        is_active: 1,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      // Mock updated account
      mockQueryOne.mockResolvedValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Updated Name',
        type: 'SAVINGS',
        currency_code: 'EUR',
        balance_cents: 75000,
        is_active: 0,
        sort_order: 2,
        icon: 'wallet',
        color: '#ff0000',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        deleted_at: null,
      });
    });

    it('should execute UPDATE with correct SQL and parameters', async () => {
      const updates: UpdateAccountInput = {
        name: 'Updated Name',
        type: 'SAVINGS' as AccountType,
      };

      await updateAccount(mockDb, 'acc-1', updates);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('UPDATE accounts'),
        expect.arrayContaining(['acc-1']),
      );
    });

    it('should use ? placeholders in UPDATE statement', async () => {
      const updates: UpdateAccountInput = {
        name: 'Updated Name',
      };

      await updateAccount(mockDb, 'acc-1', updates);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET household_id = ?');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
      expect(sql).not.toContain("name = 'Updated Name'");
    });

    it('should return null when account not found', async () => {
      mockQueryOne.mockReset();
      mockQueryOne.mockResolvedValue(null);

      const result = await updateAccount(mockDb, 'nonexistent', { name: 'New' });

      expect(result).toBeNull();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should merge updates with existing values', async () => {
      // Reset mocks
      mockQueryOne.mockReset();
      mockQueryOne.mockResolvedValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Old Name',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 50000,
        is_active: 1,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      const updates: UpdateAccountInput = {
        name: 'Updated Name',
      };

      await updateAccount(mockDb, 'acc-1', updates);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      // Should include both updated and existing values
      expect(params).toContain('hh-1'); // unchanged household_id
      expect(params).toContain('Updated Name'); // updated name
      expect(params).toContain('CHECKING'); // unchanged type
      expect(params).toContain('personal'); // unchanged purpose
      expect(params).toContain('USD'); // unchanged currency
    });

    it('should handle null values for optional fields', async () => {
      mockQueryOne.mockReset();
      mockQueryOne.mockResolvedValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Account',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 50000,
        is_active: 1,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      const updates: UpdateAccountInput = {
        icon: null,
        color: null,
      };

      await updateAccount(mockDb, 'acc-1', updates);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params).toContain(null); // icon
      expect(params).toContain(null); // color
    });
  });

  describe('deleteAccount', () => {
    it('should soft-delete by setting deleted_at timestamp', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Account',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 50000,
        is_active: 1,
        sort_order: 1,
        icon: null,
        color: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      const result = await deleteAccount(mockDb, 'acc-1');

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.stringContaining('UPDATE accounts'), [
        'acc-1',
      ]);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET deleted_at =');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
    });

    it('should return false when account not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await deleteAccount(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should use parameterized query for account ID', async () => {
      mockQueryOne.mockResolvedValue({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Account',
        type: 'CHECKING',
        currency_code: 'USD',
        balance_cents: 50000,
        is_active: 1,
        sort_order: 1,
        icon: null,
        color: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      });

      await deleteAccount(mockDb, 'acc-1');

      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.any(String), ['acc-1']);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).not.toContain("id = 'acc-1'");
    });
  });
});
