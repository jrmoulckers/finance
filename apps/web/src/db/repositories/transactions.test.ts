// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionType } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import type { Row, AsyncDb } from '../async-db';
import {
  createTransaction,
  deleteTransaction,
  getAllTransactions,
  getTransactionById,
  getTransactionsByDateRange,
  updateTransaction,
  type CreateTransactionInput,
  type TransactionFilters,
} from './transactions';

// Mock async-db module
vi.mock('../async-db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

// Import mocked functions
import { execute, query, queryOne } from '../async-db';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

describe('transactions repository', () => {
  const mockDb = {} as AsyncDb;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllTransactions', () => {
    it('should return mapped transaction objects', async () => {
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

      mockQuery.mockResolvedValue({ columns: [], rows: mockRows });

      const transactions = await getAllTransactions(mockDb);

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

    it('should filter by search term using LIKE with parameterization', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: 'coffee',
      };

      await getAllTransactions(mockDb, filters);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('LIKE ?'),
        expect.arrayContaining([
          '%coffee%',
          '%coffee%',
          '%coffee%',
          '%coffee%',
          '%coffee%',
          '%coffee%',
        ]),
      );
      const sql = mockQuery.mock.calls[0][1];
      // Should use COALESCE for nullable fields
      expect(sql).toContain('COALESCE(payee,');
      expect(sql).toContain('COALESCE(note,');
      expect(sql).toContain('COALESCE(tags,');
      expect(sql).toContain('status LIKE');
      // Should not interpolate search term
      expect(sql).not.toContain("LIKE '%coffee%'");
    });

    it('should filter by transaction type with ? placeholder', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        type: 'EXPENSE' as TransactionType,
      };

      await getAllTransactions(mockDb, filters);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('type = ?'),
        expect.arrayContaining(['EXPENSE']),
      );
    });

    it('should apply limit with parameterized query', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        limit: 10,
      };

      await getAllTransactions(mockDb, filters);

      expect(mockQuery).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([10]),
      );
      const sql = mockQuery.mock.calls[0][1];
      expect(sql).not.toContain('LIMIT 10');
    });

    it('should combine search, type, and limit filters', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: 'grocery',
        type: 'EXPENSE' as TransactionType,
        limit: 5,
      };

      await getAllTransactions(mockDb, filters);

      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual([
        '%grocery%',
        '%grocery%',
        '%grocery%',
        '%grocery%',
        '%grocery%',
        '%grocery%',
        '%grocery%',
        'EXPENSE',
        5,
      ]);
    });

    it('should preserve monetary amounts as integers', async () => {
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

      mockQuery.mockResolvedValue({ columns: [], rows: mockRows });

      const transactions = await getAllTransactions(mockDb);

      expect(transactions[0].amount.amount).toBe(250075);
      expect(Number.isInteger(transactions[0].amount.amount)).toBe(true);
    });

    it('should parse tags from JSON string', async () => {
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

      mockQuery.mockResolvedValue({ columns: [], rows: mockRows });

      const transactions = await getAllTransactions(mockDb);

      expect(transactions[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction when found', async () => {
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

      mockQueryOne.mockResolvedValue(mockRow);

      const transaction = await getTransactionById(mockDb, 'txn-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        mockDb,
        expect.stringContaining('WHERE deleted_at IS NULL AND id = ?'),
        ['txn-1'],
      );
      expect(transaction).not.toBeNull();
      expect(transaction?.id).toBe('txn-1');
    });

    it('should return null when not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const transaction = await getTransactionById(mockDb, 'nonexistent');

      expect(transaction).toBeNull();
    });
  });

  describe('createTransaction', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue({
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

    it('should execute INSERT with correct parameters', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        categoryId: 'cat-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        date: '2024-01-15',
      };

      await createTransaction(mockDb, input);

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

    it('should store amount as integer cents', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -12345 },
        date: '2024-01-15',
      };

      await createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const amountParam = params[6]; // amount is 7th param
      expect(amountParam).toBe(-12345);
      expect(Number.isInteger(amountParam as number)).toBe(true);
    });

    it('should serialize tags as JSON array', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        date: '2024-01-15',
        tags: ['food', 'restaurant', 'dinner'],
      };

      await createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      const tagsParam = params[15];
      expect(tagsParam).toBe('["food","restaurant","dinner"]');
    });

    it('should serialize balanced split lines as JSON', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: 5000 },
        date: '2024-01-15',
        splits: [
          { id: 'split-1', categoryId: 'cat-food', amount: { amount: 3200 }, note: 'Groceries' },
          { id: 'split-2', categoryId: 'cat-home', amount: { amount: 1800 }, note: null },
        ],
      };

      await createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[18]).toBe(
        '[{"id":"split-1","categoryId":"cat-food","amount":3200,"note":"Groceries"},{"id":"split-2","categoryId":"cat-home","amount":1800,"note":null}]',
      );
    });

    it('stores retirement contribution tagging metadata', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'TRANSFER' as TransactionType,
        amount: { amount: 650000 },
        date: '2025-01-15',
        retirementContributionYear: 2024,
        retirementContributionDesignation: 'EMPLOYEE',
      };

      await createTransaction(mockDb, input);

      const params = mockExecute.mock.calls[0][2] as unknown[];
      expect(params[16]).toBe(2024);
      expect(params[17]).toBe('EMPLOYEE');
    });

    it('should reject split lines that do not match the transaction total', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: 5000 },
        date: '2024-01-15',
        splits: [{ categoryId: 'cat-food', amount: { amount: 3200 }, note: null }],
      };

      await expect(createTransaction(mockDb, input)).rejects.toThrow(
        'Split amounts must equal the transaction total.',
      );
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should use ? placeholders not string interpolation', async () => {
      const input: CreateTransactionInput = {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        payee: "Bob's Store",
        date: '2024-01-15',
      };

      await createTransaction(mockDb, input);

      const sql = mockExecute.mock.calls[0][1];
      expect(sql).toContain('VALUES (');
      expect(sql).toContain('?');
      expect(sql).not.toContain('hh-1');
      expect(sql).not.toContain("Bob's Store");
    });

    it('should handle optional fields', async () => {
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

      await createTransaction(mockDb, input);

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
    it('should filter by date range with parameterized queries', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      await getTransactionsByDateRange(mockDb, '2024-01-01', '2024-01-31');

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

    it('should combine date range with other filters', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        type: 'EXPENSE' as TransactionType,
        searchTerm: 'coffee',
      };

      await getTransactionsByDateRange(mockDb, '2024-01-01', '2024-01-31', filters);

      const params = mockQuery.mock.calls[0][2] as unknown[];
      // Should have date range params first, then filter params
      expect(params[0]).toBe('2024-01-01');
      expect(params[1]).toBe('2024-01-31');
      expect(params).toContain('EXPENSE');
      expect(params).toContain('%coffee%');
    });
  });

  describe('deleteTransaction', () => {
    it('should soft-delete by setting deleted_at', async () => {
      mockQueryOne.mockResolvedValue({
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

      const result = await deleteTransaction(mockDb, 'txn-1');

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

    it('should return false when transaction not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await deleteTransaction(mockDb, 'nonexistent');

      expect(result).toBe(false);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('LIKE parameterization edge cases', () => {
    it('should handle search term with SQL wildcards safely', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: '100%',
      };

      await getAllTransactions(mockDb, filters);

      // Should wrap in % but not escape internal wildcards (basic LIKE)
      const params = mockQuery.mock.calls[0][2] as unknown[];
      // 7 LIKE patterns (numeric check doesn't match "100%" due to trailing %)
      expect(params).toEqual([
        '%100%%',
        '%100%%',
        '%100%%',
        '%100%%',
        '%100%%',
        '%100%%',
        '%100%%',
      ]);
    });

    it('should trim search term whitespace', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: '  coffee  ',
      };

      await getAllTransactions(mockDb, filters);

      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual([
        '%coffee%',
        '%coffee%',
        '%coffee%',
        '%coffee%',
        '%coffee%',
        '%coffee%',
        '%coffee%',
      ]);
    });

    it('should not add LIKE clause for empty search term', async () => {
      mockQuery.mockResolvedValue({ columns: [], rows: [] });

      const filters: TransactionFilters = {
        searchTerm: '   ',
      };

      await getAllTransactions(mockDb, filters);

      const sql = mockQuery.mock.calls[0][1];
      expect(sql).not.toContain('LIKE');
      const params = mockQuery.mock.calls[0][2] as unknown[];
      expect(params).toEqual([]);
    });
  });

  describe('balance recomputation', () => {
    const transactionRow = (overrides: Partial<Row> = {}): Row => ({
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
      tags: '[]',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      deleted_at: null,
      sync_version: 1,
      is_synced: 0,
      ...overrides,
    });

    const expectBalanceRecomputeFor = (callIndex: number, accountId: string) => {
      expect(mockExecute).toHaveBeenNthCalledWith(
        callIndex,
        mockDb,
        expect.stringContaining('UPDATE account'),
        [accountId, accountId],
      );
      const sql = mockExecute.mock.calls[callIndex - 1][1];
      expect(sql).toContain('SELECT COALESCE(SUM(amount), 0)');
      expect(sql).toContain('deleted_at IS NULL');
    };

    it('recomputes the account balance after insert', async () => {
      mockQueryOne.mockResolvedValue(transactionRow());

      await createTransaction(mockDb, {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE' as TransactionType,
        amount: { amount: -5000 },
        date: '2024-01-15',
      });

      expectBalanceRecomputeFor(2, 'acc-1');
    });

    it('recomputes the account balance after an amount update', async () => {
      mockQueryOne.mockResolvedValue(transactionRow());

      await updateTransaction(mockDb, 'txn-1', { amount: { amount: -7500 } });

      expectBalanceRecomputeFor(2, 'acc-1');
    });

    it('recomputes both accounts when a transaction moves accounts', async () => {
      mockQueryOne
        .mockResolvedValueOnce(transactionRow({ account_id: 'acc-1' }))
        .mockResolvedValueOnce(transactionRow({ account_id: 'acc-2' }));

      await updateTransaction(mockDb, 'txn-1', { accountId: 'acc-2' });

      expectBalanceRecomputeFor(2, 'acc-1');
      expectBalanceRecomputeFor(3, 'acc-2');
    });

    it('recomputes the account balance after delete', async () => {
      mockQueryOne.mockResolvedValue(transactionRow());

      await deleteTransaction(mockDb, 'txn-1');

      expectBalanceRecomputeFor(2, 'acc-1');
    });
  });
});
