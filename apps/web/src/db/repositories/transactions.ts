// SPDX-License-Identifier: BUSL-1.1

import type {
  Currency,
  LocalDate,
  SyncId,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import { recomputeAccountBalance } from './accounts';
import {
  SQLITE_NOW_EXPRESSION,
  createLikePattern,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  parseCustomFields,
  parseTags,
  requireString,
  serializeCustomFields,
  serializeTags,
  toBoolean,
} from './helpers';

const TRANSACTION_COLUMNS = [
  'id',
  'household_id',
  'account_id',
  'category_id',
  'type',
  'status',
  'amount',
  'currency',
  'payee',
  'note',
  'date',
  'transfer_account_id',
  'transfer_transaction_id',
  'is_recurring',
  'recurring_rule_id',
  'tags',
  'mood_tag',
  'merchant_address',
  'merchant_city',
  'merchant_state',
  'merchant_zip',
  'merchant_country',
  'external_reference_id',
  'statement_description',
  'custom_fields',
  'extra_notes',
  'counterparty_name',
  'counterparty_account_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const TRANSACTION_BASE_QUERY = `SELECT ${TRANSACTION_COLUMNS} FROM "transaction" WHERE deleted_at IS NULL`;

/** Shared filter options for transaction list queries. */
export interface TransactionFilters {
  searchTerm?: string;
  type?: TransactionType;
  limit?: number;
}

/** Input used when creating a new transaction record. */
export interface CreateTransactionInput {
  householdId: SyncId;
  accountId: SyncId;
  categoryId?: SyncId | null;
  type: TransactionType;
  status?: TransactionStatus;
  amount: { amount: number };
  currency?: Currency;
  payee?: string | null;
  note?: string | null;
  date: LocalDate;
  transferAccountId?: SyncId | null;
  transferTransactionId?: SyncId | null;
  isRecurring?: boolean;
  recurringRuleId?: SyncId | null;
  tags?: readonly string[];
  moodTag?: string | null;
  merchantAddress?: string | null;
  merchantCity?: string | null;
  merchantState?: string | null;
  merchantZip?: string | null;
  merchantCountry?: string | null;
  externalReferenceId?: string | null;
  statementDescription?: string | null;
  customFields?: Record<string, string> | null;
  extraNotes?: string | null;
  counterpartyName?: string | null;
  counterpartyAccountId?: SyncId | null;
}

/** Input used when updating an existing transaction record. */
export interface UpdateTransactionInput {
  householdId?: SyncId;
  accountId?: SyncId;
  categoryId?: SyncId | null;
  type?: TransactionType;
  status?: TransactionStatus;
  amount?: { amount: number };
  currency?: Currency;
  payee?: string | null;
  note?: string | null;
  date?: LocalDate;
  transferAccountId?: SyncId | null;
  transferTransactionId?: SyncId | null;
  isRecurring?: boolean;
  recurringRuleId?: SyncId | null;
  tags?: readonly string[];
  moodTag?: string | null;
  merchantAddress?: string | null;
  merchantCity?: string | null;
  merchantState?: string | null;
  merchantZip?: string | null;
  merchantCountry?: string | null;
  externalReferenceId?: string | null;
  statementDescription?: string | null;
  customFields?: Record<string, string> | null;
  extraNotes?: string | null;
  counterpartyName?: string | null;
  counterpartyAccountId?: SyncId | null;
}

function mapTransaction(row: Row): Transaction {
  return {
    id: requireString(row.id, 'transaction.id'),
    householdId: requireString(row.household_id, 'transaction.household_id'),
    accountId: requireString(row.account_id, 'transaction.account_id'),
    categoryId: optionalString(row.category_id),
    type: requireString(row.type, 'transaction.type') as TransactionType,
    status: requireString(row.status, 'transaction.status') as TransactionStatus,
    amount: mapCents(row.amount, 'transaction.amount'),
    currency: mapCurrency(row.currency),
    payee: optionalString(row.payee),
    note: optionalString(row.note),
    date: requireString(row.date, 'transaction.date'),
    transferAccountId: optionalString(row.transfer_account_id),
    transferTransactionId: optionalString(row.transfer_transaction_id),
    isRecurring: toBoolean(row.is_recurring),
    recurringRuleId: optionalString(row.recurring_rule_id),
    tags: parseTags(row.tags),
    moodTag: optionalString(row.mood_tag),
    merchantAddress: optionalString(row.merchant_address),
    merchantCity: optionalString(row.merchant_city),
    merchantState: optionalString(row.merchant_state),
    merchantZip: optionalString(row.merchant_zip),
    merchantCountry: optionalString(row.merchant_country),
    externalReferenceId: optionalString(row.external_reference_id),
    statementDescription: optionalString(row.statement_description),
    customFields: parseCustomFields(row.custom_fields),
    extraNotes: optionalString(row.extra_notes),
    counterpartyName: optionalString(row.counterparty_name),
    counterpartyAccountId: optionalString(row.counterparty_account_id),
    ...mapSyncMetadata(row),
  };
}

function buildTransactionQuery(additionalClauses: string[] = [], filters: TransactionFilters = {}) {
  const clauses = ['deleted_at IS NULL', ...additionalClauses];
  const params: unknown[] = [];

  if (filters.searchTerm?.trim()) {
    const pattern = createLikePattern(filters.searchTerm);
    const searchConditions = [
      `COALESCE(payee, '') LIKE ?`,
      `COALESCE(note, '') LIKE ?`,
      `COALESCE(tags, '') LIKE ?`,
      `status LIKE ?`,
      `COALESCE(counterparty_name, '') LIKE ?`,
      `COALESCE((SELECT name FROM category WHERE category.id = "transaction".category_id AND category.deleted_at IS NULL), '') LIKE ?`,
      `COALESCE((SELECT name FROM account WHERE account.id = "transaction".account_id AND account.deleted_at IS NULL), '') LIKE ?`,
    ];
    const searchParams: unknown[] = [pattern, pattern, pattern, pattern, pattern, pattern, pattern];

    // If the search term looks numeric, also match the amount (in cents)
    const numericSearch = filters.searchTerm.trim().replace(/[$,]/g, '');
    if (/^\d+(\.\d+)?$/.test(numericSearch)) {
      const amountCents = Math.round(parseFloat(numericSearch) * 100);
      searchConditions.push(`amount = ?`);
      searchParams.push(amountCents);
    }

    clauses.push(`(${searchConditions.join(' OR ')})`);
    params.push(...searchParams);
  }

  if (filters.type) {
    clauses.push('type = ?');
    params.push(filters.type);
  }

  let sql = `SELECT ${TRANSACTION_COLUMNS} FROM "transaction" WHERE ${clauses.join(
    ' AND ',
  )} ORDER BY date DESC, created_at DESC`;

  if (typeof filters.limit === 'number') {
    sql += ' LIMIT ?';
    params.push(Math.max(1, Math.trunc(filters.limit)));
  }

  return { sql, params };
}

function listTransactions(
  db: SqliteDb,
  additionalClauses: string[] = [],
  additionalParams: unknown[] = [],
  filters: TransactionFilters = {},
): Transaction[] {
  const { sql, params } = buildTransactionQuery(additionalClauses, filters);
  return query<Row>(db, sql, [...additionalParams, ...params]).rows.map(mapTransaction);
}

/** Return all non-deleted transactions using optional text and type filters. */
export function getAllTransactions(db: SqliteDb, filters: TransactionFilters = {}): Transaction[] {
  return listTransactions(db, [], [], filters);
}

/** Find a single non-deleted transaction by its identifier. */
export function getTransactionById(db: SqliteDb, transactionId: SyncId): Transaction | null {
  const row = queryOne<Row>(db, `${TRANSACTION_BASE_QUERY} AND id = ?`, [transactionId]);
  return row ? mapTransaction(row) : null;
}

/** Insert a new transaction row and return the created transaction. */
export function createTransaction(db: SqliteDb, input: CreateTransactionInput): Transaction {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO "transaction" (
      id,
      household_id,
      account_id,
      category_id,
      type,
      status,
      amount,
      currency,
      payee,
      note,
      date,
      transfer_account_id,
      transfer_transaction_id,
      is_recurring,
      recurring_rule_id,
      tags,
      mood_tag,
      merchant_address,
      merchant_city,
      merchant_state,
      merchant_zip,
      merchant_country,
      external_reference_id,
      statement_description,
      custom_fields,
      extra_notes,
      counterparty_name,
      counterparty_account_id,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.householdId,
      input.accountId,
      input.categoryId ?? null,
      input.type,
      input.status ?? 'CLEARED',
      input.amount.amount,
      currency.code,
      input.payee ?? null,
      input.note ?? null,
      input.date,
      input.transferAccountId ?? null,
      input.transferTransactionId ?? null,
      input.isRecurring ? 1 : 0,
      input.recurringRuleId ?? null,
      serializeTags(input.tags ?? []),
      input.moodTag ?? null,
      input.merchantAddress ?? null,
      input.merchantCity ?? null,
      input.merchantState ?? null,
      input.merchantZip ?? null,
      input.merchantCountry ?? null,
      input.externalReferenceId ?? null,
      input.statementDescription ?? null,
      serializeCustomFields(input.customFields ?? null),
      input.extraNotes ?? null,
      input.counterpartyName ?? null,
      input.counterpartyAccountId ?? null,
    ],
  );

  const createdTransaction = getTransactionById(db, id);
  if (!createdTransaction) {
    throw new Error('Failed to create transaction.');
  }

  recomputeAccountBalance(db, input.accountId);

  return createdTransaction;
}

/** Update a transaction row and return the refreshed transaction. */
export function updateTransaction(
  db: SqliteDb,
  transactionId: SyncId,
  updates: UpdateTransactionInput,
): Transaction | null {
  const existingTransaction = getTransactionById(db, transactionId);
  if (!existingTransaction) {
    return null;
  }

  const mergedTransaction = {
    householdId: updates.householdId ?? existingTransaction.householdId,
    accountId: updates.accountId ?? existingTransaction.accountId,
    categoryId:
      updates.categoryId !== undefined ? updates.categoryId : existingTransaction.categoryId,
    type: updates.type ?? existingTransaction.type,
    status: updates.status ?? existingTransaction.status,
    amount: updates.amount ?? existingTransaction.amount,
    currency: updates.currency ?? existingTransaction.currency,
    payee: updates.payee !== undefined ? updates.payee : existingTransaction.payee,
    note: updates.note !== undefined ? updates.note : existingTransaction.note,
    date: updates.date ?? existingTransaction.date,
    transferAccountId:
      updates.transferAccountId !== undefined
        ? updates.transferAccountId
        : existingTransaction.transferAccountId,
    transferTransactionId:
      updates.transferTransactionId !== undefined
        ? updates.transferTransactionId
        : existingTransaction.transferTransactionId,
    isRecurring: updates.isRecurring ?? existingTransaction.isRecurring,
    recurringRuleId:
      updates.recurringRuleId !== undefined
        ? updates.recurringRuleId
        : existingTransaction.recurringRuleId,
    tags: updates.tags ?? existingTransaction.tags,
    moodTag: updates.moodTag !== undefined ? updates.moodTag : existingTransaction.moodTag,
    merchantAddress:
      updates.merchantAddress !== undefined
        ? updates.merchantAddress
        : existingTransaction.merchantAddress,
    merchantCity:
      updates.merchantCity !== undefined ? updates.merchantCity : existingTransaction.merchantCity,
    merchantState:
      updates.merchantState !== undefined
        ? updates.merchantState
        : existingTransaction.merchantState,
    merchantZip:
      updates.merchantZip !== undefined ? updates.merchantZip : existingTransaction.merchantZip,
    merchantCountry:
      updates.merchantCountry !== undefined
        ? updates.merchantCountry
        : existingTransaction.merchantCountry,
    externalReferenceId:
      updates.externalReferenceId !== undefined
        ? updates.externalReferenceId
        : existingTransaction.externalReferenceId,
    statementDescription:
      updates.statementDescription !== undefined
        ? updates.statementDescription
        : existingTransaction.statementDescription,
    customFields:
      updates.customFields !== undefined ? updates.customFields : existingTransaction.customFields,
    extraNotes:
      updates.extraNotes !== undefined ? updates.extraNotes : existingTransaction.extraNotes,
    counterpartyName:
      updates.counterpartyName !== undefined
        ? updates.counterpartyName
        : existingTransaction.counterpartyName,
    counterpartyAccountId:
      updates.counterpartyAccountId !== undefined
        ? updates.counterpartyAccountId
        : existingTransaction.counterpartyAccountId,
  };

  execute(
    db,
    `UPDATE "transaction"
        SET household_id = ?,
            account_id = ?,
            category_id = ?,
            type = ?,
            status = ?,
            amount = ?,
            currency = ?,
            payee = ?,
            note = ?,
            date = ?,
            transfer_account_id = ?,
            transfer_transaction_id = ?,
            is_recurring = ?,
            recurring_rule_id = ?,
            tags = ?,
            mood_tag = ?,
            merchant_address = ?,
            merchant_city = ?,
            merchant_state = ?,
            merchant_zip = ?,
            merchant_country = ?,
            external_reference_id = ?,
            statement_description = ?,
            custom_fields = ?,
            extra_notes = ?,
            counterparty_name = ?,
            counterparty_account_id = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedTransaction.householdId,
      mergedTransaction.accountId,
      mergedTransaction.categoryId,
      mergedTransaction.type,
      mergedTransaction.status,
      mergedTransaction.amount.amount,
      mergedTransaction.currency.code,
      mergedTransaction.payee,
      mergedTransaction.note,
      mergedTransaction.date,
      mergedTransaction.transferAccountId,
      mergedTransaction.transferTransactionId,
      mergedTransaction.isRecurring ? 1 : 0,
      mergedTransaction.recurringRuleId,
      serializeTags(mergedTransaction.tags),
      mergedTransaction.moodTag,
      mergedTransaction.merchantAddress,
      mergedTransaction.merchantCity,
      mergedTransaction.merchantState,
      mergedTransaction.merchantZip,
      mergedTransaction.merchantCountry,
      mergedTransaction.externalReferenceId,
      mergedTransaction.statementDescription,
      serializeCustomFields(mergedTransaction.customFields ?? null),
      mergedTransaction.extraNotes,
      mergedTransaction.counterpartyName,
      mergedTransaction.counterpartyAccountId,
      transactionId,
    ],
  );

  if (existingTransaction.accountId !== mergedTransaction.accountId) {
    recomputeAccountBalance(db, existingTransaction.accountId);
  }
  recomputeAccountBalance(db, mergedTransaction.accountId);

  return getTransactionById(db, transactionId);
}

/** Soft-delete a transaction row by marking its deleted timestamp. */
export function deleteTransaction(db: SqliteDb, transactionId: SyncId): boolean {
  const existingTransaction = getTransactionById(db, transactionId);
  if (!existingTransaction) {
    return false;
  }

  execute(
    db,
    `UPDATE "transaction"
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [transactionId],
  );

  recomputeAccountBalance(db, existingTransaction.accountId);

  return true;
}

/** Erase all mood tags from local transactions. */
export function eraseAllMoodTags(db: SqliteDb): void {
  execute(
    db,
    `UPDATE "transaction" SET mood_tag = NULL, updated_at = ${SQLITE_NOW_EXPRESSION}, sync_version = 1, is_synced = 0 WHERE mood_tag IS NOT NULL`,
  );
}

/** Return transactions for a single account with optional filters applied. */
export function getTransactionsByAccount(
  db: SqliteDb,
  accountId: SyncId,
  filters: TransactionFilters = {},
): Transaction[] {
  return listTransactions(db, ['account_id = ?'], [accountId], filters);
}

/** Return transactions for a single category with optional filters applied. */
export function getTransactionsByCategory(
  db: SqliteDb,
  categoryId: SyncId,
  filters: TransactionFilters = {},
): Transaction[] {
  return listTransactions(db, ['category_id = ?'], [categoryId], filters);
}

/** Return transactions within an inclusive local-date range. */
export function getTransactionsByDateRange(
  db: SqliteDb,
  startDate: LocalDate,
  endDate: LocalDate,
  filters: TransactionFilters = {},
): Transaction[] {
  return listTransactions(db, ['date >= ?', 'date <= ?'], [startDate, endDate], filters);
}

/** Return the most recent transactions, ordered newest-first. */
export function getRecentTransactions(
  db: SqliteDb,
  limit = 10,
  filters: Omit<TransactionFilters, 'limit'> = {},
): Transaction[] {
  return listTransactions(db, [], [], { ...filters, limit });
}
