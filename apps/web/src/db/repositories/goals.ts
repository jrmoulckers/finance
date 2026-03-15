// SPDX-License-Identifier: BUSL-1.1

import type { Currency, Goal, GoalStatus, SyncId } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireString,
} from './helpers';

const GOAL_COLUMNS = [
  'id',
  'household_id',
  'name',
  'target_amount',
  'current_amount',
  'currency',
  'target_date',
  'status',
  'icon',
  'color',
  'account_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const GOAL_BASE_QUERY = `SELECT ${GOAL_COLUMNS} FROM goal WHERE deleted_at IS NULL`;

/** Input used when creating a new goal record. */
export interface CreateGoalInput {
  householdId: SyncId;
  name: string;
  targetAmount: { amount: number };
  currentAmount?: { amount: number };
  currency?: Currency;
  targetDate?: string | null;
  status?: GoalStatus;
  icon?: string | null;
  color?: string | null;
  accountId?: SyncId | null;
}

/** Input used when updating an existing goal record. */
export interface UpdateGoalInput {
  householdId?: SyncId;
  name?: string;
  targetAmount?: { amount: number };
  currentAmount?: { amount: number };
  currency?: Currency;
  targetDate?: string | null;
  status?: GoalStatus;
  icon?: string | null;
  color?: string | null;
  accountId?: SyncId | null;
}

function mapGoal(row: Row): Goal {
  return {
    id: requireString(row.id, 'goal.id'),
    householdId: requireString(row.household_id, 'goal.household_id'),
    name: requireString(row.name, 'goal.name'),
    targetAmount: mapCents(row.target_amount, 'goal.target_amount'),
    currentAmount: mapCents(row.current_amount, 'goal.current_amount'),
    currency: mapCurrency(row.currency),
    targetDate: optionalString(row.target_date),
    status: requireString(row.status, 'goal.status') as GoalStatus,
    icon: optionalString(row.icon),
    color: optionalString(row.color),
    accountId: optionalString(row.account_id),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted goals ordered by target date and name. */
export function getAllGoals(db: SqliteDb): Goal[] {
  return query<Row>(
    db,
    `${GOAL_BASE_QUERY} ORDER BY (target_date IS NULL) ASC, target_date ASC, name ASC`,
  ).rows.map(mapGoal);
}

/** Find a single non-deleted goal by its identifier. */
export function getGoalById(db: SqliteDb, goalId: SyncId): Goal | null {
  const row = queryOne<Row>(db, `${GOAL_BASE_QUERY} AND id = ?`, [goalId]);
  return row ? mapGoal(row) : null;
}

/** Insert a new goal row and return the created goal. */
export function createGoal(db: SqliteDb, input: CreateGoalInput): Goal {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO goal (
      id,
      household_id,
      name,
      target_amount,
      current_amount,
      currency,
      target_date,
      status,
      icon,
      color,
      account_id,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
      input.targetAmount.amount,
      input.currentAmount?.amount ?? 0,
      currency.code,
      input.targetDate ?? null,
      input.status ?? 'ACTIVE',
      input.icon ?? null,
      input.color ?? null,
      input.accountId ?? null,
    ],
  );

  const createdGoal = getGoalById(db, id);
  if (!createdGoal) {
    throw new Error('Failed to create goal.');
  }

  return createdGoal;
}

/** Update a goal row and return the refreshed goal. */
export function updateGoal(db: SqliteDb, goalId: SyncId, updates: UpdateGoalInput): Goal | null {
  const existingGoal = getGoalById(db, goalId);
  if (!existingGoal) {
    return null;
  }

  const mergedGoal = {
    householdId: updates.householdId ?? existingGoal.householdId,
    name: updates.name ?? existingGoal.name,
    targetAmount: updates.targetAmount ?? existingGoal.targetAmount,
    currentAmount: updates.currentAmount ?? existingGoal.currentAmount,
    currency: updates.currency ?? existingGoal.currency,
    targetDate: updates.targetDate !== undefined ? updates.targetDate : existingGoal.targetDate,
    status: updates.status ?? existingGoal.status,
    icon: updates.icon !== undefined ? updates.icon : existingGoal.icon,
    color: updates.color !== undefined ? updates.color : existingGoal.color,
    accountId: updates.accountId !== undefined ? updates.accountId : existingGoal.accountId,
  };

  execute(
    db,
    `UPDATE goal
        SET household_id = ?,
            name = ?,
            target_amount = ?,
            current_amount = ?,
            currency = ?,
            target_date = ?,
            status = ?,
            icon = ?,
            color = ?,
            account_id = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedGoal.householdId,
      mergedGoal.name,
      mergedGoal.targetAmount.amount,
      mergedGoal.currentAmount.amount,
      mergedGoal.currency.code,
      mergedGoal.targetDate,
      mergedGoal.status,
      mergedGoal.icon,
      mergedGoal.color,
      mergedGoal.accountId,
      goalId,
    ],
  );

  return getGoalById(db, goalId);
}

/** Soft-delete a goal row by marking its deleted timestamp. */
export function deleteGoal(db: SqliteDb, goalId: SyncId): boolean {
  const existingGoal = getGoalById(db, goalId);
  if (!existingGoal) {
    return false;
  }

  execute(
    db,
    `UPDATE goal
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [goalId],
  );

  return true;
}

/** Return goals that are currently active. */
export function getActiveGoals(db: SqliteDb): Goal[] {
  return query<Row>(
    db,
    `${GOAL_BASE_QUERY} AND status = ? ORDER BY (target_date IS NULL) ASC, target_date ASC, name ASC`,
    ['ACTIVE'],
  ).rows.map(mapGoal);
}

/** Return goals that have been completed. */
export function getCompletedGoals(db: SqliteDb): Goal[] {
  return query<Row>(db, `${GOAL_BASE_QUERY} AND status = ? ORDER BY updated_at DESC, name ASC`, [
    'COMPLETED',
  ]).rows.map(mapGoal);
}
