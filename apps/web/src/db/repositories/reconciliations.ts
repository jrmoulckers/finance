// SPDX-License-Identifier: BUSL-1.1

import type { LocalDate, SyncId, TransactionStatus, TransactionType } from '../../kmp/bridge';
import {
  calculateReconciliationDifference,
  isTransactionEligibleForReconciliation,
  type ReconciliationTransactionInput,
} from '../../lib/reconciliation';
import {
  beginSavepoint,
  execute,
  query,
  queryOne,
  releaseSavepoint,
  rollbackToSavepoint,
  type AsyncDb,
  type Row,
} from '../async-db';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapSyncMetadata,
  requireNumber,
  requireString,
} from './helpers';

const RECONCILIATION_COLUMNS = [
  'id',
  'account_id',
  'household_id',
  'statement_date',
  'statement_balance',
  'starting_balance',
  'cleared_transaction_count',
  'transaction_ids',
  'created_by',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

const RECONCILIATION_BASE_QUERY = `SELECT ${RECONCILIATION_COLUMNS} FROM account_reconciliations WHERE deleted_at IS NULL`;

export interface AccountReconciliationSnapshot {
  readonly id: SyncId;
  readonly accountId: SyncId;
  readonly householdId: SyncId;
  readonly statementDate: LocalDate;
  readonly statementBalance: { amount: number };
  readonly startingBalance: { amount: number };
  readonly clearedTransactionCount: number;
  readonly transactionIds: readonly SyncId[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly syncVersion: number;
  readonly isSynced: boolean;
}

export interface CloseReconciliationInput {
  readonly accountId: SyncId;
  readonly householdId: SyncId;
  readonly statementDate: LocalDate;
  readonly statementBalance: { amount: number };
  readonly startingBalance: { amount: number };
  readonly transactionIds: readonly SyncId[];
  readonly createdBy?: string;
}

function parseTransactionIds(value: unknown): readonly SyncId[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

function mapReconciliation(row: Row): AccountReconciliationSnapshot {
  return {
    id: requireString(row.id, 'account_reconciliation.id'),
    accountId: requireString(row.account_id, 'account_reconciliation.account_id'),
    householdId: requireString(row.household_id, 'account_reconciliation.household_id'),
    statementDate: requireString(row.statement_date, 'account_reconciliation.statement_date'),
    statementBalance: mapCents(row.statement_balance, 'account_reconciliation.statement_balance'),
    startingBalance: mapCents(row.starting_balance, 'account_reconciliation.starting_balance'),
    clearedTransactionCount: requireNumber(
      row.cleared_transaction_count,
      'account_reconciliation.cleared_transaction_count',
    ),
    transactionIds: parseTransactionIds(row.transaction_ids),
    createdBy: requireString(row.created_by, 'account_reconciliation.created_by'),
    ...mapSyncMetadata(row),
  };
}

export async function getReconciliationHistory(
  db: AsyncDb,
  accountId: SyncId,
): Promise<AccountReconciliationSnapshot[]> {
  const { rows } = await query<Row>(
    db,
    `${RECONCILIATION_BASE_QUERY} AND account_id = ? ORDER BY statement_date DESC, created_at DESC`,
    [accountId],
  );
  return rows.map(mapReconciliation);
}

export async function getLastReconciliation(
  db: AsyncDb,
  accountId: SyncId,
): Promise<AccountReconciliationSnapshot | null> {
  const row = await queryOne<Row>(
    db,
    `${RECONCILIATION_BASE_QUERY} AND account_id = ? ORDER BY statement_date DESC, created_at DESC LIMIT 1`,
    [accountId],
  );
  return row ? mapReconciliation(row) : null;
}

function mapReconciliationTransaction(row: Row): ReconciliationTransactionInput {
  return {
    id: requireString(row.id, 'transaction.id'),
    type: requireString(row.type, 'transaction.type') as TransactionType,
    status: requireString(row.status, 'transaction.status') as TransactionStatus,
    amount: { amount: requireNumber(row.amount_cents, 'transaction.amount_cents') },
    date: requireString(row.date, 'transaction.date'),
  };
}

async function getTransactionsForClose(
  db: AsyncDb,
  accountId: SyncId,
  transactionIds: readonly SyncId[],
): Promise<ReconciliationTransactionInput[]> {
  if (transactionIds.length === 0) {
    return [];
  }

  const placeholders = transactionIds.map(() => '?').join(', ');
  const { rows } = await query<Row>(
    db,
    `SELECT id, type, status, amount_cents, date
       FROM transactions
      WHERE account_id = ?
        AND deleted_at IS NULL
        AND id IN (${placeholders})`,
    [accountId, ...transactionIds],
  );

  if (rows.length !== transactionIds.length) {
    throw new Error('One or more selected transactions cannot be reconciled.');
  }

  return rows.map(mapReconciliationTransaction);
}

export async function getUnclearedTransactionCount(
  db: AsyncDb,
  accountId: SyncId,
): Promise<number> {
  const row = await queryOne<Row>(
    db,
    `SELECT COUNT(*) AS count
       FROM transactions
      WHERE account_id = ?
        AND deleted_at IS NULL
        AND status NOT IN ('RECONCILED', 'VOID')`,
    [accountId],
  );

  return requireNumber(row?.count ?? 0, 'uncleared_transaction_count');
}

export async function closeReconciliation(
  db: AsyncDb,
  input: CloseReconciliationInput,
): Promise<AccountReconciliationSnapshot> {
  const id = crypto.randomUUID();
  const createdBy = input.createdBy?.trim() || 'local-user';
  const uniqueTransactionIds = [...new Set(input.transactionIds)];
  const closeTransactions = await getTransactionsForClose(
    db,
    input.accountId,
    uniqueTransactionIds,
  );

  if (
    closeTransactions.some(
      (transaction) => !isTransactionEligibleForReconciliation(transaction, input.statementDate),
    )
  ) {
    throw new Error('Only unreconciled transactions through the statement date can be reconciled.');
  }

  const calculation = calculateReconciliationDifference({
    startingBalance: input.startingBalance.amount,
    statementEndingBalance: input.statementBalance.amount,
    transactions: closeTransactions,
    clearedTransactionIds: uniqueTransactionIds,
  });

  if (!calculation.canClose) {
    throw new Error('Reconciliation cannot close until the difference is zero.');
  }

  const savepointName = 'close_reconciliation';

  await beginSavepoint(db, savepointName);

  try {
    await execute(
      db,
      `INSERT INTO account_reconciliations (
        id,
        account_id,
        household_id,
        statement_date,
        statement_balance,
        starting_balance,
        cleared_transaction_count,
        transaction_ids,
        created_by,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ${SQLITE_NOW_EXPRESSION},
        ${SQLITE_NOW_EXPRESSION},
        NULL
      )`,
      [
        id,
        input.accountId,
        input.householdId,
        input.statementDate,
        input.statementBalance.amount,
        input.startingBalance.amount,
        uniqueTransactionIds.length,
        JSON.stringify(uniqueTransactionIds),
        createdBy,
      ],
    );

    for (const transactionId of uniqueTransactionIds) {
      await execute(
        db,
        `UPDATE transactions
            SET status = 'RECONCILED',
                updated_at = ${SQLITE_NOW_EXPRESSION}
          WHERE id = ?
            AND account_id = ?
            AND deleted_at IS NULL
            AND status <> 'VOID'`,
        [transactionId, input.accountId],
      );
    }

    await releaseSavepoint(db, savepointName);
  } catch (error) {
    try {
      await rollbackToSavepoint(db, savepointName);
      await releaseSavepoint(db, savepointName);
    } catch {
      // Preserve the original close error if SQLite already ended the savepoint.
    }
    throw error;
  }

  const snapshot = await queryOne<Row>(db, `${RECONCILIATION_BASE_QUERY} AND id = ?`, [id]);
  if (!snapshot) {
    throw new Error('Failed to record reconciliation snapshot.');
  }

  return mapReconciliation(snapshot);
}
