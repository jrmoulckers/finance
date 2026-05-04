// SPDX-License-Identifier: BUSL-1.1

/**
 * SQLite-WASM repository for investment holdings.
 *
 * Handles CRUD operations for the `investment` table, following the same
 * patterns established by the accounts and goals repositories.
 *
 * References: issue #1105
 */

import type { Currency, Investment, InvestmentType, SyncId } from '../../kmp/bridge';
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
} from './helpers';

const INVESTMENT_COLUMNS = [
  'id',
  'household_id',
  'account_id',
  'symbol',
  'name',
  'type',
  'shares',
  'cost_basis_per_share',
  'current_price_per_share',
  'currency',
  'last_price_update',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const INVESTMENT_BASE_QUERY = `SELECT ${INVESTMENT_COLUMNS} FROM investment WHERE deleted_at IS NULL`;

/** Input used when creating a new investment record. */
export interface CreateInvestmentInput {
  householdId: SyncId;
  accountId?: SyncId | null;
  symbol: string;
  name: string;
  type: InvestmentType;
  shares: number;
  costBasisPerShare: { amount: number };
  currentPricePerShare: { amount: number };
  currency?: Currency;
}

/** Input used when updating an existing investment record. */
export interface UpdateInvestmentInput {
  accountId?: SyncId | null;
  symbol?: string;
  name?: string;
  type?: InvestmentType;
  shares?: number;
  costBasisPerShare?: { amount: number };
  currentPricePerShare?: { amount: number };
  currency?: Currency;
}

/** Map a raw database row to an Investment domain object. */
function mapInvestment(row: Row): Investment {
  return {
    id: requireString(row.id, 'investment.id'),
    householdId: requireString(row.household_id, 'investment.household_id'),
    accountId: optionalString(row.account_id),
    symbol: requireString(row.symbol, 'investment.symbol'),
    name: requireString(row.name, 'investment.name'),
    type: requireString(row.type, 'investment.type') as InvestmentType,
    shares: requireNumber(row.shares, 'investment.shares'),
    costBasisPerShare: mapCents(row.cost_basis_per_share, 'investment.cost_basis_per_share'),
    currentPricePerShare: mapCents(
      row.current_price_per_share,
      'investment.current_price_per_share',
    ),
    currency: mapCurrency(row.currency),
    lastPriceUpdate: optionalString(row.last_price_update),
    ...mapSyncMetadata(row),
  };
}

/** Return every non-deleted investment ordered by symbol. */
export function getAllInvestments(db: SqliteDb): Investment[] {
  return query<Row>(db, `${INVESTMENT_BASE_QUERY} ORDER BY symbol ASC, name ASC`).rows.map(
    mapInvestment,
  );
}

/** Find a single non-deleted investment by its identifier. */
export function getInvestmentById(db: SqliteDb, investmentId: SyncId): Investment | null {
  const row = queryOne<Row>(db, `${INVESTMENT_BASE_QUERY} AND id = ?`, [investmentId]);
  return row ? mapInvestment(row) : null;
}

/** Return all non-deleted investments for a specific account. */
export function getInvestmentsByAccount(db: SqliteDb, accountId: SyncId): Investment[] {
  return query<Row>(db, `${INVESTMENT_BASE_QUERY} AND account_id = ? ORDER BY symbol ASC`, [
    accountId,
  ]).rows.map(mapInvestment);
}

/** Insert a new investment row and return the created investment. */
export function createInvestment(db: SqliteDb, input: CreateInvestmentInput): Investment {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO investment (
      id,
      household_id,
      account_id,
      symbol,
      name,
      type,
      shares,
      cost_basis_per_share,
      current_price_per_share,
      currency,
      last_price_update,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.householdId,
      input.accountId ?? null,
      input.symbol,
      input.name,
      input.type,
      input.shares,
      input.costBasisPerShare.amount,
      input.currentPricePerShare.amount,
      currency.code,
    ],
  );

  const created = getInvestmentById(db, id);
  if (!created) {
    throw new Error('Failed to create investment.');
  }

  return created;
}

/** Update an investment row and return the refreshed investment. */
export function updateInvestment(
  db: SqliteDb,
  investmentId: SyncId,
  updates: UpdateInvestmentInput,
): Investment | null {
  const existing = getInvestmentById(db, investmentId);
  if (!existing) {
    return null;
  }

  const merged = {
    accountId: updates.accountId !== undefined ? updates.accountId : existing.accountId,
    symbol: updates.symbol ?? existing.symbol,
    name: updates.name ?? existing.name,
    type: updates.type ?? existing.type,
    shares: updates.shares ?? existing.shares,
    costBasisPerShare: updates.costBasisPerShare ?? existing.costBasisPerShare,
    currentPricePerShare: updates.currentPricePerShare ?? existing.currentPricePerShare,
    currency: updates.currency ?? existing.currency,
  };

  execute(
    db,
    `UPDATE investment
        SET account_id = ?,
            symbol = ?,
            name = ?,
            type = ?,
            shares = ?,
            cost_basis_per_share = ?,
            current_price_per_share = ?,
            currency = ?,
            last_price_update = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      merged.accountId,
      merged.symbol,
      merged.name,
      merged.type,
      merged.shares,
      merged.costBasisPerShare.amount,
      merged.currentPricePerShare.amount,
      merged.currency.code,
      investmentId,
    ],
  );

  return getInvestmentById(db, investmentId);
}

/** Soft-delete an investment row by marking its deleted timestamp. */
export function deleteInvestment(db: SqliteDb, investmentId: SyncId): boolean {
  const existing = getInvestmentById(db, investmentId);
  if (!existing) {
    return false;
  }

  execute(
    db,
    `UPDATE investment
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [investmentId],
  );

  return true;
}
