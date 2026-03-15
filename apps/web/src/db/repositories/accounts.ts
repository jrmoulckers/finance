// SPDX-License-Identifier: BUSL-1.1

import type { Account, AccountType, Currency, SyncId } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
  toBoolean,
} from './helpers';

const ACCOUNT_COLUMNS = [
  'id',
  'household_id',
  'name',
  'type',
  'currency',
  'current_balance',
  'is_archived',
  'sort_order',
  'icon',
  'color',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const ACCOUNT_BASE_QUERY = `SELECT ${ACCOUNT_COLUMNS} FROM account WHERE deleted_at IS NULL`;

/** Input used when creating a new account record. */
export interface CreateAccountInput {
  householdId: SyncId;
  name: string;
  type: AccountType;
  currency?: Currency;
  currentBalance: { amount: number };
  isArchived?: boolean;
  sortOrder?: number;
  icon?: string | null;
  color?: string | null;
}

/** Input used when updating an existing account record. */
export interface UpdateAccountInput {
  householdId?: SyncId;
  name?: string;
  type?: AccountType;
  currency?: Currency;
  currentBalance?: { amount: number };
  isArchived?: boolean;
  sortOrder?: number;
  icon?: string | null;
  color?: string | null;
}

function mapAccount(row: Row): Account {
  return {
    id: requireString(row.id, 'account.id'),
    householdId: requireString(row.household_id, 'account.household_id'),
    name: requireString(row.name, 'account.name'),
    type: requireString(row.type, 'account.type') as AccountType,
    currency: mapCurrency(row.currency),
    currentBalance: mapCents(row.current_balance, 'account.current_balance'),
    isArchived: toBoolean(row.is_archived),
    sortOrder: requireNumber(row.sort_order, 'account.sort_order'),
    icon: optionalString(row.icon),
    color: optionalString(row.color),
    ...mapSyncMetadata(row),
  };
}

/** Return every non-deleted account ordered by sort order and name. */
export function getAllAccounts(db: SqliteDb): Account[] {
  return query<Row>(db, `${ACCOUNT_BASE_QUERY} ORDER BY sort_order ASC, name ASC`).rows.map(
    mapAccount,
  );
}

/** Find a single non-deleted account by its identifier. */
export function getAccountById(db: SqliteDb, accountId: SyncId): Account | null {
  const row = queryOne<Row>(db, `${ACCOUNT_BASE_QUERY} AND id = ?`, [accountId]);
  return row ? mapAccount(row) : null;
}

/** Insert a new account row and return the created account. */
export function createAccount(db: SqliteDb, input: CreateAccountInput): Account {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO account (
      id,
      household_id,
      name,
      type,
      currency,
      current_balance,
      is_archived,
      sort_order,
      icon,
      color,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.householdId,
      input.name,
      input.type,
      currency.code,
      input.currentBalance.amount,
      input.isArchived ? 1 : 0,
      input.sortOrder ?? 0,
      input.icon ?? null,
      input.color ?? null,
    ],
  );

  const createdAccount = getAccountById(db, id);
  if (!createdAccount) {
    throw new Error('Failed to create account.');
  }

  return createdAccount;
}

/** Update an account row and return the refreshed account. */
export function updateAccount(
  db: SqliteDb,
  accountId: SyncId,
  updates: UpdateAccountInput,
): Account | null {
  const existingAccount = getAccountById(db, accountId);
  if (!existingAccount) {
    return null;
  }

  const mergedAccount = {
    householdId: updates.householdId ?? existingAccount.householdId,
    name: updates.name ?? existingAccount.name,
    type: updates.type ?? existingAccount.type,
    currency: updates.currency ?? existingAccount.currency,
    currentBalance: updates.currentBalance ?? existingAccount.currentBalance,
    isArchived: updates.isArchived ?? existingAccount.isArchived,
    sortOrder: updates.sortOrder ?? existingAccount.sortOrder,
    icon: updates.icon !== undefined ? updates.icon : existingAccount.icon,
    color: updates.color !== undefined ? updates.color : existingAccount.color,
  };

  execute(
    db,
    `UPDATE account
        SET household_id = ?,
            name = ?,
            type = ?,
            currency = ?,
            current_balance = ?,
            is_archived = ?,
            sort_order = ?,
            icon = ?,
            color = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedAccount.householdId,
      mergedAccount.name,
      mergedAccount.type,
      mergedAccount.currency.code,
      mergedAccount.currentBalance.amount,
      mergedAccount.isArchived ? 1 : 0,
      mergedAccount.sortOrder,
      mergedAccount.icon,
      mergedAccount.color,
      accountId,
    ],
  );

  return getAccountById(db, accountId);
}

/** Soft-delete an account row by marking its deleted timestamp. */
export function deleteAccount(db: SqliteDb, accountId: SyncId): boolean {
  const existingAccount = getAccountById(db, accountId);
  if (!existingAccount) {
    return false;
  }

  execute(
    db,
    `UPDATE account
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [accountId],
  );

  return true;
}

/** Return all non-deleted accounts for a specific account type. */
export function getAccountsByType(db: SqliteDb, type: AccountType): Account[] {
  return query<Row>(db, `${ACCOUNT_BASE_QUERY} AND type = ? ORDER BY sort_order ASC, name ASC`, [
    type,
  ]).rows.map(mapAccount);
}
