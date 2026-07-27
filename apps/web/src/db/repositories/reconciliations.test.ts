// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsyncDb, Row } from '../async-db';

vi.mock('../async-db', () => ({
  beginSavepoint: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  releaseSavepoint: vi.fn(),
  rollbackToSavepoint: vi.fn(),
}));

import { beginSavepoint, execute, query, queryOne, releaseSavepoint } from '../async-db';
import { closeReconciliation, getUnclearedTransactionCount } from './reconciliations';

const mockBeginSavepoint = vi.mocked(beginSavepoint);
const mockExecute = vi.mocked(execute);
const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockReleaseSavepoint = vi.mocked(releaseSavepoint);

const mockDb = {} as AsyncDb;
const generatedId = '00000000-0000-4000-8000-000000000001';

function snapshotRow(overrides: Partial<Row> = {}): Row {
  return {
    id: generatedId,
    account_id: 'account-1',
    household_id: 'household-1',
    statement_date: '2025-03-31',
    statement_balance: 12500,
    starting_balance: 10000,
    cleared_transaction_count: 2,
    transaction_ids: '["tx-income","tx-expense"]',
    created_by: 'local-user',
    created_at: '2025-04-01T00:00:00Z',
    updated_at: '2025-04-01T00:00:00Z',
    deleted_at: null,
    sync_version: 1,
    is_synced: 0,
    ...overrides,
  };
}

describe('reconciliations repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedId);
  });

  it('records a snapshot and locks transactions when the difference is zero', async () => {
    mockQuery.mockResolvedValueOnce({
      columns: [],
      rows: [
        { id: 'tx-income', type: 'INCOME', status: 'PENDING', amount: 5000, date: '2025-03-10' },
        { id: 'tx-expense', type: 'EXPENSE', status: 'CLEARED', amount: 2500, date: '2025-03-12' },
      ],
    });
    mockQueryOne.mockResolvedValueOnce(snapshotRow());

    const snapshot = await closeReconciliation(mockDb, {
      accountId: 'account-1',
      householdId: 'household-1',
      statementDate: '2025-03-31',
      statementBalance: { amount: 12500 },
      startingBalance: { amount: 10000 },
      transactionIds: ['tx-income', 'tx-expense'],
    });

    expect(snapshot).toMatchObject({
      id: generatedId,
      accountId: 'account-1',
      statementBalance: { amount: 12500 },
      clearedTransactionCount: 2,
      transactionIds: ['tx-income', 'tx-expense'],
    });
    expect(mockBeginSavepoint).toHaveBeenCalledWith(mockDb, 'close_reconciliation');
    expect(mockExecute.mock.calls[0][1]).toContain('INSERT INTO account_reconciliation');
    expect(mockExecute.mock.calls[1][1]).toContain("SET status = 'RECONCILED'");
    expect(mockExecute.mock.calls[2][1]).toContain("SET status = 'RECONCILED'");
    expect(mockReleaseSavepoint).toHaveBeenCalledWith(mockDb, 'close_reconciliation');
  });

  it('refuses to close when selected transactions do not match the statement balance', async () => {
    mockQuery.mockResolvedValueOnce({
      columns: [],
      rows: [
        { id: 'tx-income', type: 'INCOME', status: 'PENDING', amount: 5000, date: '2025-03-10' },
      ],
    });

    await expect(
      closeReconciliation(mockDb, {
        accountId: 'account-1',
        householdId: 'household-1',
        statementDate: '2025-03-31',
        statementBalance: { amount: 16000 },
        startingBalance: { amount: 10000 },
        transactionIds: ['tx-income'],
      }),
    ).rejects.toThrow('difference is zero');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('counts only unreconciled, non-void transactions as uncleared', async () => {
    mockQueryOne.mockResolvedValueOnce({ count: 4 });

    expect(await getUnclearedTransactionCount(mockDb, 'account-1')).toBe(4);
    expect(mockQueryOne).toHaveBeenCalledWith(
      mockDb,
      expect.stringContaining("status NOT IN ('RECONCILED', 'VOID')"),
      ['account-1'],
    );
  });
});
