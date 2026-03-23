// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountType } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, SqliteDb } from '../sqlite-wasm';
import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAllAccounts,
  updateAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from './accounts';

// Mock sqlite-wasm module
vi.mock('../sqlite-wasm', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

// Import mocked functions for control
import { execute, query, queryOne } from '../sqlite-wasm';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe('accounts repository', () => {
  const mockDb = {} as SqliteDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllAccounts', () => {
    it('should return mapped account objects', () => {
      const mockRows: Row[] = [
        {
          id: 'acc-1',
          household_id: 'hh-1',
          name: 'Checking',
          type: 'CHECKING',
          currency: 'USD',
          current_balance: 100000,
          is_archived: 0,
          sort_order: 1,
          icon: 'bank',
          color: '#3b82f6',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
        {
          id: 'acc-2',
          household_id: 'hh-1',
          name: 'Savings',
          type: 'SAVINGS',
          currency: 'EUR',
          current_balance: 250000,
          is_archived: 1,
          sort_order: 2,
          icon: null,
          color: null,
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          deleted_at: null,
          sync_version: 2,
          is_synced: 1,
        },
      ];

      mockQuery.mockReturnValue({
        columns: Object.keys(mockRows[0]),
        rows: mockRows,
      });

      const accounts = getAllAccounts(mockDb);

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

    it('should filter out deleted accounts via WHERE clause', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getAllAccounts(mockDb);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL'),
      );
    });

    it('should preserve monetary values as integers', () => {
      const mockRows: Row[] = [
        {
          id: 'acc-1',
          household_id: 'hh-1',
          name: 'Checking',
          type: 'CHECKING',
          currency: 'USD',
          current_balance: 12345,
          is_archived: 0,
          sort_order: 0,
          icon: null,
          color: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const accounts = getAllAccounts(mockDb);

      expect(accounts[0].currentBalance.amount).toBe(12345);
      expect(Number.isInteger(accounts[0].currentBalance.amount)).toBe(true);
    });
  });

  describe('getAccountById', () => {
    it('should return mapped account object when found', () => {
      const mockRow: Row = {
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Checking',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 100000,
        is_archived: 0,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      };

      mockQueryOne.mockReturnValue(mockRow);

      const account = getAccountById(mockDb, 'acc-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['acc-1'],
      );
      expect(account).not.toBeNull();
      expect(account?.id).toBe('acc-1');
      expect(account?.name).toBe('Checking');
    });

    it('should return null when account not found', () => {
      mockQueryOne.mockReturnValue(null);

      const account = getAccountById(mockDb, 'nonexistent');

      expect(account).toBeNull();
    });

    it('should use parameterized query with ? placeholder', () => {
      mockQueryOne.mockReturnValue(null);

      getAccountById(mockDb, 'acc-1');

      expect(mockQueryOne).toHaveBeenCalledWith(mockDb, expect.any(String), ['acc-1']);
      const sql = mockQueryOne.mock.calls[0][1];
      expect(sql).toContain('id = ?');
      expect(sql).not.toContain('id = acc-1');
    });
  });

  describe('createAccount', () => {
    beforeEach(() => {
      // Mock getAccountById to return created account
      mockQueryOne.mockReturnValue({
        id: 'new-acc-id',
        household_id: 'hh-1',
        name: 'New Account',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 50000,
        is_archived: 0,
        sort_order: 0,
        icon: null,
        color: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });
    });

    it('should execute INSERT with correct SQL and parameters', () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 50000 },
      };

      createAccount(mockDb, input);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('INSERT INTO account'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'hh-1',
          'New Account',
          'CHECKING',
          'USD', // Default currency
          50000,
          0, // isArchived
          0, // sortOrder
          null, // icon
          null, // color
        ]),
      );
    });

    it('should use ? placeholders not string interpolation for values', () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 50000 },
      };

      createAccount(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      // Should use ? for parameters
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      // Should not have interpolated household ID
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain('New Account');
    });

    it('should store monetary amount as integer', () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 123456 },
      };

      createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const amountParam = params[5]; // current_balance is 6th param
      expect(amountParam).toBe(123456);
      expect(Number.isInteger(amountParam as number)).toBe(true);
    });

    it('should use provided currency code', () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'Euro Account',
        type: 'CHECKING' as AccountType,
        currency: Currencies.EUR,
        currentBalance: { amount: 100000 },
      };

      createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[4]).toBe('EUR');
    });

    it('should default to USD when currency not provided', () => {
      const input: CreateAccountInput = {
        householdId: 'hh-1',
        name: 'Account',
        type: 'CHECKING' as AccountType,
        currentBalance: { amount: 100000 },
      };

      createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[4]).toBe('USD');
    });

    it('should handle optional fields', () => {
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

      createAccount(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[6]).toBe(1); // isArchived
      expect(params[7]).toBe(5); // sortOrder
      expect(params[8]).toBe('wallet'); // icon
      expect(params[9]).toBe('#ff0000'); // color
    });
  });

  describe('updateAccount', () => {
    beforeEach(() => {
      // Mock existing account
      mockQueryOne.mockReturnValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Old Name',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 50000,
        is_archived: 0,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      // Mock updated account
      mockQueryOne.mockReturnValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Updated Name',
        type: 'SAVINGS',
        currency: 'EUR',
        current_balance: 75000,
        is_archived: 1,
        sort_order: 2,
        icon: 'wallet',
        color: '#ff0000',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        deleted_at: null,
        sync_version: 2,
        is_synced: 0,
      });
    });

    it('should execute UPDATE with correct SQL and parameters', () => {
      const updates: UpdateAccountInput = {
        name: 'Updated Name',
        type: 'SAVINGS' as AccountType,
      };

      updateAccount(mockDb, 'acc-1', updates);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('UPDATE account'),
        expect.arrayContaining(['acc-1']),
      );
    });

    it('should use ? placeholders in UPDATE statement', () => {
      const updates: UpdateAccountInput = {
        name: 'Updated Name',
      };

      updateAccount(mockDb, 'acc-1', updates);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET household_id = ?');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
      expect(sql).not.toContain("name = 'Updated Name'");
    });

    it('should return null when account not found', () => {
      mockQueryOne.mockReset();
      mockQueryOne.mockReturnValue(null);

      const result = updateAccount(mockDb, 'nonexistent', { name: 'New' });

      expect(result).toBeNull();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should merge updates with existing values', () => {
      // Reset mocks
      mockQueryOne.mockReset();
      mockQueryOne.mockReturnValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Old Name',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 50000,
        is_archived: 0,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      const updates: UpdateAccountInput = {
        name: 'Updated Name',
      };

      updateAccount(mockDb, 'acc-1', updates);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      // Should include both updated and existing values
      expect(params).toContain('hh-1'); // unchanged household_id
      expect(params).toContain('Updated Name'); // updated name
      expect(params).toContain('CHECKING'); // unchanged type
      expect(params).toContain('USD'); // unchanged currency
    });

    it('should handle null values for optional fields', () => {
      mockQueryOne.mockReset();
      mockQueryOne.mockReturnValueOnce({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Account',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 50000,
        is_archived: 0,
        sort_order: 1,
        icon: 'bank',
        color: '#3b82f6',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      const updates: UpdateAccountInput = {
        icon: null,
        color: null,
      };

      updateAccount(mockDb, 'acc-1', updates);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params).toContain(null); // icon
      expect(params).toContain(null); // color
    });
  });

  describe('deleteAccount', () => {
    it('should soft-delete by setting deleted_at timestamp', () => {
      mockQueryOne.mockReturnValue({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Account',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 50000,
        is_archived: 0,
        sort_order: 1,
        icon: null,
        color: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      const result = deleteAccount(mockDb, 'acc-1');

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.stringContaining('UPDATE account'), [
        'acc-1',
      ]);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET deleted_at =');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
    });

    it('should return false when account not found', () => {
      mockQueryOne.mockReturnValue(null);

      const result = deleteAccount(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should use parameterized query for account ID', () => {
      mockQueryOne.mockReturnValue({
        id: 'acc-1',
        household_id: 'hh-1',
        name: 'Account',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 50000,
        is_archived: 0,
        sort_order: 1,
        icon: null,
        color: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      deleteAccount(mockDb, 'acc-1');

      expect(mockExecute).toHaveBeenCalledWith(mockDb, expect.any(String), ['acc-1']);
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).not.toContain("id = 'acc-1'");
    });
  });
});
