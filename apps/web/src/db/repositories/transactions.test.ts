// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionType } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, SqliteDb } from '../sqlite-wasm';
import {
  createTransaction,
  deleteTransaction,
  getAllTransactions,
  getTransactionById,
  getTransactionsByDateRange,
  type CreateTransactionInput,
  type TransactionFilters,
} from './transactions';

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

describe('transactions repository', () => {
  const mockDb = {} as SqliteDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllTransactions', () => {
    it('should return mapped transaction objects', () => {
      const mockRows: Row[] = [
        {
          id: 'txn-1',
          household_id: 'hh-1',
          account_id: 'acc-1',
          category_id: 'cat-1',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: -5000,
          currency: 'USD',
          payee: 'Coffee Shop',
          note: 'Morning coffee',
          date: '2024-01-15',
          transfer_account_id: null,
          transfer_transaction_id: null,
          is_recurring: 0,
          recurring_rule_id: null,
          tags: '["food","beverage"]',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const transactions = getAllTransactions(mockDb);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        id: 'txn-1',
        type: 'EXPENSE',
        amount: { amount: -5000 },
        payee: 'Coffee Shop',
        note: 'Morning coffee',
        date: '2024-01-15',
        tags: ['food', 'beverage'],
      });
    });

    it('should filter by search term using LIKE with parameterization', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: 'coffee',
      };

      getAllTransactions(mockDb, filters);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('LIKE ?'),
        expect.arrayContaining(['%coffee%', '%coffee%']),
      );
      const sql = mockQuery.mock.calls[0][1];
      // Should use COALESCE for nullable fields
      expect(sql).toContain('COALESCE(payee,');
      expect(sql).toContain('COALESCE(note,');
      // Should not interpolate search term
      expect(sql).not.toContain("LIKE '%coffee%'");
    });

    it('should filter by transaction type with ? placeholder', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        type: 'EXPENSE' as TransactionType,
      };

      getAllTransactions(mockDb, filters);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('type = ?'),
        expect.arrayContaining(['EXPENSE']),
      );
    });

    it('should apply limit with parameterized query', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        limit: 10,
      };

      getAllTransactions(mockDb, filters);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([10]),
      );
      const sql = mockQuery.mock.calls[0][1];
      expect(sql).not.toContain('LIMIT 10');
    });

    it('should combine search, type, and limit filters', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: 'grocery',
        type: 'EXPENSE' as TransactionType,
        limit: 5,
      };

      getAllTransactions(mockDb, filters);

      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual(['%grocery%', '%grocery%', 'EXPENSE', 5]);
    });

    it('should preserve monetary amounts as integers', () => {
      const mockRows: Row[] = [
        {
          id: 'txn-1',
          household_id: 'hh-1',
          account_id: 'acc-1',
          category_id: null,
          type: 'INCOME',
          status: 'CLEARED',
          amount: 250075,
          currency: 'USD',
          payee: null,
          note: null,
          date: '2024-01-15',
          transfer_account_id: null,
          transfer_transaction_id: null,
          is_recurring: 0,
          recurring_rule_id: null,
          tags: null,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const transactions = getAllTransactions(mockDb);

      expect(transactions[0].amount.amount).toBe(250075);
      expect(Number.isInteger(transactions[0].amount.amount)).toBe(true);
    });

    it('should parse tags from JSON string', () => {
      const mockRows: Row[] = [
        {
          id: 'txn-1',
          household_id: 'hh-1',
          account_id: 'acc-1',
          category_id: null,
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: -1000,
          currency: 'USD',
          payee: null,
          note: null,
          date: '2024-01-15',
          transfer_account_id: null,
          transfer_transaction_id: null,
          is_recurring: 0,
          recurring_rule_id: null,
          tags: '["tag1","tag2","tag3"]',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          deleted_at: null,
          sync_version: 1,
          is_synced: 0,
        },
      ];

      mockQuery.mockReturnValue({ columns: [], rows: mockRows });

      const transactions = getAllTransactions(mockDb);

      expect(transactions[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction when found', () => {
      const mockRow: Row = {
        id: 'txn-1',
        household_id: 'hh-1',
        account_id: 'acc-1',
        category_id: 'cat-1',
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: -5000,
        currency: 'USD',
        payee: 'Store',
        note: 'Purchase',
        date: '2024-01-15',
        transfer_account_id: null,
        transfer_transaction_id: null,
        is_recurring: 0,
        recurring_rule_id: null,
        tags: '[]',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      };

      mockQueryOne.mockReturnValue(mockRow);

      const transaction = getTransactionById(mockDb, 'txn-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['txn-1'],
      );
      expect(transaction).not.toBeNull();
      expect(transaction?.id).toBe('txn-1');
    });

    it('should return null when not found', () => {
      mockQueryOne.mockReturnValue(null);

      const transaction = getTransactionById(mockDb, 'nonexistent');

      expect(transaction).toBeNull();
    });
  });

  describe('createTransaction', () => {
    beforeEach(() => {
      mockQueryOne.mockReturnValue({
        id: 'new-txn',
        household_id: 'hh-1',
        account_id: 'acc-1',
        category_id: 'cat-1',
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: -5000,
        currency: 'USD',
        payee: 'Store',
        note: 'Purchase',
        date: '2024-01-15',
        transfer_account_id: null,
        transfer_transaction_id: null,
        is_recurring: 0,
        recurring_rule_id: null,
        tags: '["shopping"]',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });
    });

    it('should execute INSERT with correct parameters', () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        date: '2024-01-15',
      };

      createTransaction(mockDb, input);

      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('INSERT INTO "transaction"'),
        expect.arrayContaining([
          expect.any(String), // UUID
          'hh-1',
          'acc-1',
          'cat-1',
          'EXPENSE',
          'CLEARED', // Default status
          -5000,
          'USD', // Default currency
          null, // payee
          null, // note
          '2024-01-15',
          null, // transfer_account_id
          null, // transfer_transaction_id
          0, // is_recurring
          null, // recurring_rule_id
          '[]', // tags serialized
        ]),
      );
    });

    it('should store amount as integer cents', () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -12345 },
        date: '2024-01-15',
      };

      createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const amountParam = params[6]; // amount is 7th param
      expect(amountParam).toBe(-12345);
      expect(Number.isInteger(amountParam as number)).toBe(true);
    });

    it('should serialize tags as JSON array', () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        date: '2024-01-15',
        tags: ['food', 'restaurant', 'dinner'],
      };

      createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const tagsParam = params[15]; // tags is last param
      expect(tagsParam).toBe('["food","restaurant","dinner"]');
    });

    it('should use ? placeholders not string interpolation', () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        payee: "Bob's Store",
        date: '2024-01-15',
      };

      createTransaction(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain("Bob's Store");
    });

    it('should handle optional fields', () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        status: 'PENDING',
        amount: { amount: -5000 },
        currency: Currencies.EUR,
        payee: 'Store',
        note: 'Test note',
        date: '2024-01-15',
        isRecurring: true,
        recurringRuleId: 'rule-1',
        tags: ['test'],
      };

      createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params).toContain('PENDING');
      expect(params).toContain('EUR');
      expect(params).toContain('Store');
      expect(params).toContain('Test note');
      expect(params).toContain(1); // isRecurring
      expect(params).toContain('rule-1');
      expect(params).toContain('["test"]');
    });
  });

  describe('getTransactionsByDateRange', () => {
    it('should filter by date range with parameterized queries', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      getTransactionsByDateRange(mockDb, '2024-01-01', '2024-01-31');

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('date >= ?'),
        expect.arrayContaining(['2024-01-01', '2024-01-31']),
      );
      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('date <= ?'),
        expect.anything(),
      );
    });

    it('should combine date range with other filters', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        type: 'EXPENSE' as TransactionType,
        searchTerm: 'coffee',
      };

      getTransactionsByDateRange(mockDb, '2024-01-01', '2024-01-31', filters);

      const params = mockQuery.mock.calls[0][2] as unknown[];
      // Should have date range params first, then filter params
      expect(params[0]).toBe('2024-01-01');
      expect(params[1]).toBe('2024-01-31');
      expect(params).toContain('EXPENSE');
      expect(params).toContain('%coffee%');
    });
  });

  describe('deleteTransaction', () => {
    it('should soft-delete by setting deleted_at', () => {
      mockQueryOne.mockReturnValue({
        id: 'txn-1',
        household_id: 'hh-1',
        account_id: 'acc-1',
        category_id: null,
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: -5000,
        currency: 'USD',
        payee: null,
        note: null,
        date: '2024-01-15',
        transfer_account_id: null,
        transfer_transaction_id: null,
        is_recurring: 0,
        recurring_rule_id: null,
        tags: null,
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      });

      const result = deleteTransaction(mockDb, 'txn-1');

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('UPDATE "transaction"'),
        ['txn-1'],
      );
      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('SET deleted_at =');
      expect(sql).toContain('WHERE id = ?');
      expect(sql).toContain('AND deleted_at IS NULL');
    });

    it('should return false when transaction not found', () => {
      mockQueryOne.mockReturnValue(null);

      const result = deleteTransaction(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('LIKE parameterization edge cases', () => {
    it('should handle search term with SQL wildcards safely', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: '100%',
      };

      getAllTransactions(mockDb, filters);

      // Should wrap in % but not escape internal wildcards (basic LIKE)
      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual(['%100%%', '%100%%']);
    });

    it('should trim search term whitespace', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: '  coffee  ',
      };

      getAllTransactions(mockDb, filters);

      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual(['%coffee%', '%coffee%']);
    });

    it('should not add LIKE clause for empty search term', () => {
      mockQuery.mockReturnValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: '   ',
      };

      getAllTransactions(mockDb, filters);

      const sql = mockQuery.mock.calls[0][1];
      expect(sql).not.toContain('LIKE');
      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual([]);
    });
  });
});
