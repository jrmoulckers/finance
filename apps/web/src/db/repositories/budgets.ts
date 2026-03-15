// SPDX-License-Identifier: BUSL-1.1

import type { Budget, BudgetPeriod, Currency, SyncId } from '../../kmp/bridge';
import { Currencies, cents } from '../../kmp/bridge';
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

const BUDGET_COLUMNS = [
  'id',
  'household_id',
  'category_id',
  'name',
  'amount',
  'currency',
  'period',
  'start_date',
  'end_date',
  'is_rollover',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const BUDGET_BASE_QUERY = `SELECT ${BUDGET_COLUMNS} FROM budget WHERE deleted_at IS NULL`;

/** Input used when creating a new budget record. */
export interface CreateBudgetInput {
  householdId: SyncId;
  categoryId: SyncId;
  name: string;
  amount: { amount: number };
  currency?: Currency;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string | null;
  isRollover?: boolean;
}

/** Input used when updating an existing budget record. */
export interface UpdateBudgetInput {
  householdId?: SyncId;
  categoryId?: SyncId;
  name?: string;
  amount?: { amount: number };
  currency?: Currency;
  period?: BudgetPeriod;
  startDate?: string;
  endDate?: string | null;
  isRollover?: boolean;
}

/** Budget shape enriched with calculated spending totals. */
export interface BudgetWithSpending extends Budget {
  readonly spentAmount: { amount: number };
  readonly remainingAmount: { amount: number };
}

function mapBudget(row: Row): Budget {
  return {
    id: requireString(row.id, 'budget.id'),
    householdId: requireString(row.household_id, 'budget.household_id'),
    categoryId: requireString(row.category_id, 'budget.category_id'),
    name: requireString(row.name, 'budget.name'),
    amount: mapCents(row.amount, 'budget.amount'),
    currency: mapCurrency(row.currency),
    period: requireString(row.period, 'budget.period') as BudgetPeriod,
    startDate: requireString(row.start_date, 'budget.start_date'),
    endDate: optionalString(row.end_date),
    isRollover: toBoolean(row.is_rollover),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted budgets ordered by period start date. */
export function getAllBudgets(db: SqliteDb): Budget[] {
  return query<Row>(db, `${BUDGET_BASE_QUERY} ORDER BY start_date DESC, name ASC`).rows.map(mapBudget);
}

/** Find a single non-deleted budget by its identifier. */
export function getBudgetById(db: SqliteDb, budgetId: SyncId): Budget | null {
  const row = queryOne<Row>(db, `${BUDGET_BASE_QUERY} AND id = ?`, [budgetId]);
  return row ? mapBudget(row) : null;
}

/** Insert a new budget row and return the created budget. */
export function createBudget(db: SqliteDb, input: CreateBudgetInput): Budget {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO budget (
      id,
      household_id,
      category_id,
      name,
      amount,
      currency,
      period,
      start_date,
      end_date,
      is_rollover,
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
      input.categoryId,
      input.name,
      input.amount.amount,
      currency.code,
      input.period,
      input.startDate,
      input.endDate ?? null,
      input.isRollover ? 1 : 0,
    ],
  );

  const createdBudget = getBudgetById(db, id);
  if (!createdBudget) {
    throw new Error('Failed to create budget.');
  }

  return createdBudget;
}

/** Update a budget row and return the refreshed budget. */
export function updateBudget(
  db: SqliteDb,
  budgetId: SyncId,
  updates: UpdateBudgetInput,
): Budget | null {
  const existingBudget = getBudgetById(db, budgetId);
  if (!existingBudget) {
    return null;
  }

  const mergedBudget = {
    householdId: updates.householdId ?? existingBudget.householdId,
    categoryId: updates.categoryId ?? existingBudget.categoryId,
    name: updates.name ?? existingBudget.name,
    amount: updates.amount ?? existingBudget.amount,
    currency: updates.currency ?? existingBudget.currency,
    period: updates.period ?? existingBudget.period,
    startDate: updates.startDate ?? existingBudget.startDate,
    endDate: updates.endDate !== undefined ? updates.endDate : existingBudget.endDate,
    isRollover: updates.isRollover ?? existingBudget.isRollover,
  };

  execute(
    db,
    `UPDATE budget
        SET household_id = ?,
            category_id = ?,
            name = ?,
            amount = ?,
            currency = ?,
            period = ?,
            start_date = ?,
            end_date = ?,
            is_rollover = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedBudget.householdId,
      mergedBudget.categoryId,
      mergedBudget.name,
      mergedBudget.amount.amount,
      mergedBudget.currency.code,
      mergedBudget.period,
      mergedBudget.startDate,
      mergedBudget.endDate,
      mergedBudget.isRollover ? 1 : 0,
      budgetId,
    ],
  );

  return getBudgetById(db, budgetId);
}

/** Soft-delete a budget row by marking its deleted timestamp. */
export function deleteBudget(db: SqliteDb, budgetId: SyncId): boolean {
  const existingBudget = getBudgetById(db, budgetId);
  if (!existingBudget) {
    return false;
  }

  execute(
    db,
    `UPDATE budget
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [budgetId],
  );

  return true;
}

/** Return all non-deleted budgets for a given cadence. */
export function getBudgetsByPeriod(db: SqliteDb, period: BudgetPeriod): Budget[] {
  return query<Row>(db, `${BUDGET_BASE_QUERY} AND period = ? ORDER BY start_date DESC, name ASC`, [
    period,
  ]).rows.map(mapBudget);
}

/** Return a budget alongside its calculated spending and remaining amounts. */
export function getBudgetWithSpending(db: SqliteDb, budgetId: SyncId): BudgetWithSpending | null {
  const row = queryOne<Row>(
    db,
    `SELECT b.id AS id,
            b.household_id AS household_id,
            b.category_id AS category_id,
            b.name AS name,
            b.amount AS amount,
            b.currency AS currency,
            b.period AS period,
            b.start_date AS start_date,
            b.end_date AS end_date,
            b.is_rollover AS is_rollover,
            b.created_at AS created_at,
            b.updated_at AS updated_at,
            b.deleted_at AS deleted_at,
            b.sync_version AS sync_version,
            b.is_synced AS is_synced,
            COALESCE(
              SUM(
                CASE
                  WHEN t.type = 'EXPENSE' THEN ABS(t.amount)
                  ELSE 0
                END
              ),
              0
            ) AS spent_amount
       FROM budget b
       LEFT JOIN "transaction" t
         ON t.category_id = b.category_id
        AND t.household_id = b.household_id
        AND t.deleted_at IS NULL
        AND t.date >= b.start_date
        AND (b.end_date IS NULL OR t.date <= b.end_date)
      WHERE b.deleted_at IS NULL
        AND b.id = ?
      GROUP BY b.id,
               b.household_id,
               b.category_id,
               b.name,
               b.amount,
               b.currency,
               b.period,
               b.start_date,
               b.end_date,
               b.is_rollover,
               b.created_at,
               b.updated_at,
               b.deleted_at,
               b.sync_version,
               b.is_synced`,
    [budgetId],
  );

  if (!row) {
    return null;
  }

  const budget = mapBudget(row);
  const spentAmount = mapCents(row.spent_amount, 'budget.spent_amount');

  return {
    ...budget,
    spentAmount,
    remainingAmount: cents(budget.amount.amount - spentAmount.amount),
  };
}
