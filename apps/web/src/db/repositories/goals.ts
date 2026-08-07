// SPDX-License-Identifier: BUSL-1.1

import type { Currency, Goal, GoalStatus, SyncId } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { execute, query, queryOne, type AsyncDb, type Row } from '../async-db';
import { notifyMilestoneDataChanged } from '../../lib/milestones';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
} from './helpers';

const GOAL_COLUMNS = [
  'id',
  'household_id',
  'name',
  'description',
  'target_cents',
  'current_cents',
  'currency_code',
  'target_date',
  'status',
  'icon',
  'color',
  'account_id',
  'sort_order',
  'created_at',
  'updated_at',
  'deleted_at',
].join(', ');

const GOAL_BASE_QUERY = `SELECT ${GOAL_COLUMNS} FROM goals WHERE deleted_at IS NULL`;

/** Input used when creating a new goal record. */
export interface CreateGoalInput {
  householdId: SyncId;
  name: string;
  description?: string | null;
  targetAmount: { amount: number };
  currentAmount?: { amount: number };
  currency?: Currency;
  targetDate?: string | null;
  status?: GoalStatus;
  icon?: string | null;
  color?: string | null;
  accountId?: SyncId | null;
  sortOrder?: number;
}

/** Input used when updating an existing goal record. */
export interface UpdateGoalInput {
  householdId?: SyncId;
  name?: string;
  description?: string | null;
  targetAmount?: { amount: number };
  currentAmount?: { amount: number };
  currency?: Currency;
  targetDate?: string | null;
  status?: GoalStatus;
  icon?: string | null;
  color?: string | null;
  accountId?: SyncId | null;
  sortOrder?: number;
}

/** Input used when adding progress to an existing goal. */
export interface GoalContributionInput {
  goalId: SyncId;
  amount: { amount: number };
  note?: string | null;
}

/** A single recorded goal-progress contribution, oldest-first friendly. */
export interface GoalContributionRecord {
  /** ISO-8601 timestamp the contribution was recorded. */
  readonly date: string;
  /** Signed contribution amount in cents (negative for withdrawals). */
  readonly amountCents: number;
  /** Cumulative saved amount in cents after this contribution. */
  readonly runningTotalCents: number;
}

function mapGoal(row: Row): Goal {
  return {
    id: requireString(row.id, 'goal.id'),
    householdId: requireString(row.household_id, 'goal.household_id'),
    name: requireString(row.name, 'goal.name'),
    description: optionalString(row.description),
    targetAmount: mapCents(row.target_cents, 'goal.target_cents'),
    currentAmount: mapCents(row.current_cents, 'goal.current_cents'),
    currency: mapCurrency(row.currency_code),
    targetDate: optionalString(row.target_date),
    status: requireString(row.status, 'goal.status') as GoalStatus,
    icon: optionalString(row.icon),
    color: optionalString(row.color),
    accountId: optionalString(row.account_id),
    sortOrder: row.sort_order == null ? 0 : requireNumber(row.sort_order, 'goal.sort_order'),
    ...mapSyncMetadata(row),
  };
}

/** Return all non-deleted goals ordered by persisted sort order. */
export async function getAllGoals(db: AsyncDb): Promise<Goal[]> {
  const { rows } = await query<Row>(
    db,
    `${GOAL_BASE_QUERY} ORDER BY sort_order ASC, (target_date IS NULL) ASC, target_date ASC, name ASC`,
  );
  return rows.map(mapGoal);
}

/** Find a single non-deleted goal by its identifier. */
export async function getGoalById(db: AsyncDb, goalId: SyncId): Promise<Goal | null> {
  const row = await queryOne<Row>(db, `${GOAL_BASE_QUERY} AND id = ?`, [goalId]);
  return row ? mapGoal(row) : null;
}

/** Insert a new goal row and return the created goal. */
export async function createGoal(db: AsyncDb, input: CreateGoalInput): Promise<Goal> {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;
  const sortOrder = input.sortOrder ?? 0;

  const targetAmount = input.targetAmount.amount;
  const currentAmount = input.currentAmount?.amount ?? 0;
  // A goal created already at or above its target is complete on arrival, so it
  // is never left in a self-contradictory "Active but reached" state (#3776,
  // item 8). An explicitly supplied status always wins.
  const status =
    input.status ?? (targetAmount > 0 && currentAmount >= targetAmount ? 'COMPLETED' : 'ACTIVE');

  await execute(
    db,
    `INSERT INTO goals (
      id,
      household_id,
      name,
      description,
      target_cents,
      current_cents,
      currency_code,
      target_date,
      status,
      icon,
      color,
      account_id,
      sort_order,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL
    )`,
    [
      id,
      input.householdId,
      input.name,
      input.description ?? null,
      input.targetAmount.amount,
      input.currentAmount?.amount ?? 0,
      currency.code,
      input.targetDate ?? null,
      status,
      input.icon ?? null,
      input.color ?? null,
      input.accountId ?? null,
      sortOrder,
    ],
  );

  const createdGoal = await getGoalById(db, id);
  if (!createdGoal) {
    throw new Error('Failed to create goal.');
  }

  notifyMilestoneDataChanged();
  return createdGoal;
}

/** Update a goal row and return the refreshed goal. */
export async function updateGoal(
  db: AsyncDb,
  goalId: SyncId,
  updates: UpdateGoalInput,
): Promise<Goal | null> {
  const existingGoal = await getGoalById(db, goalId);
  if (!existingGoal) {
    return null;
  }

  const mergedGoal = {
    householdId: updates.householdId ?? existingGoal.householdId,
    name: updates.name ?? existingGoal.name,
    description: updates.description !== undefined ? updates.description : existingGoal.description,
    targetAmount: updates.targetAmount ?? existingGoal.targetAmount,
    currentAmount: updates.currentAmount ?? existingGoal.currentAmount,
    currency: updates.currency ?? existingGoal.currency,
    targetDate: updates.targetDate !== undefined ? updates.targetDate : existingGoal.targetDate,
    status: updates.status ?? existingGoal.status,
    icon: updates.icon !== undefined ? updates.icon : existingGoal.icon,
    color: updates.color !== undefined ? updates.color : existingGoal.color,
    accountId: updates.accountId !== undefined ? updates.accountId : existingGoal.accountId,
    sortOrder: updates.sortOrder ?? existingGoal.sortOrder ?? 0,
  };

  await execute(
    db,
    `UPDATE goals
        SET household_id = ?,
            name = ?,
            description = ?,
            target_cents = ?,
            current_cents = ?,
            currency_code = ?,
            target_date = ?,
            status = ?,
            icon = ?,
            color = ?,
            account_id = ?,
            sort_order = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      mergedGoal.householdId,
      mergedGoal.name,
      mergedGoal.description,
      mergedGoal.targetAmount.amount,
      mergedGoal.currentAmount.amount,
      mergedGoal.currency.code,
      mergedGoal.targetDate,
      mergedGoal.status,
      mergedGoal.icon,
      mergedGoal.color,
      mergedGoal.accountId,
      mergedGoal.sortOrder,
      goalId,
    ],
  );

  const updatedGoal = await getGoalById(db, goalId);
  if (updatedGoal) {
    notifyMilestoneDataChanged();
  }

  return updatedGoal;
}

/**
 * Apply a signed adjustment to a goal's current progress.
 *
 * A positive amount records a contribution; a negative amount records a
 * withdrawal or correction. A withdrawal cannot exceed the amount already
 * saved, and a goal that drops back below its target is reverted from
 * `COMPLETED` to `ACTIVE`.
 */
export async function contributeToGoal(
  db: AsyncDb,
  goalId: SyncId,
  input: GoalContributionInput,
): Promise<Goal | null> {
  const existingGoal = await getGoalById(db, goalId);
  if (!existingGoal) {
    return null;
  }

  if (!Number.isFinite(input.amount.amount) || input.amount.amount === 0) {
    throw new Error('Adjustment amount must be a non-zero value.');
  }

  const nextCurrentAmount = existingGoal.currentAmount.amount + input.amount.amount;
  if (nextCurrentAmount < 0) {
    throw new Error('A withdrawal cannot exceed the amount saved for this goal.');
  }

  const nextStatus =
    nextCurrentAmount >= existingGoal.targetAmount.amount
      ? 'COMPLETED'
      : existingGoal.status === 'COMPLETED'
        ? 'ACTIVE'
        : existingGoal.status;

  const contributionId = crypto.randomUUID();

  await execute(
    db,
    `UPDATE goals
        SET current_cents = ?,
            status = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [nextCurrentAmount, nextStatus, goalId],
  );

  await execute(
    db,
    `INSERT INTO goal_progress_contributions (
      id,
      goal_id,
      household_id,
      amount,
      currency,
      note,
      contributed_at,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL
    )`,
    [
      contributionId,
      goalId,
      existingGoal.householdId,
      input.amount.amount,
      existingGoal.currency.code,
      input.note?.trim() || null,
    ],
  );

  const updatedGoal = await getGoalById(db, goalId);
  if (updatedGoal) {
    notifyMilestoneDataChanged();
  }

  return updatedGoal;
}

export async function reorderGoals(db: AsyncDb, orderedGoalIds: readonly SyncId[]): Promise<void> {
  for (const [sortOrder, goalId] of orderedGoalIds.entries()) {
    await execute(
      db,
      `UPDATE goals
          SET sort_order = ?,
              updated_at = ${SQLITE_NOW_EXPRESSION}
        WHERE id = ?
          AND deleted_at IS NULL`,
      [sortOrder, goalId],
    );
  }
}

/** Soft-delete a goal row by marking its deleted timestamp. */
export async function deleteGoal(db: AsyncDb, goalId: SyncId): Promise<boolean> {
  const existingGoal = await getGoalById(db, goalId);
  if (!existingGoal) {
    return false;
  }

  await execute(
    db,
    `UPDATE goals
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION}
      WHERE id = ?
        AND deleted_at IS NULL`,
    [goalId],
  );

  notifyMilestoneDataChanged();
  return true;
}

/** Return goals that are currently active. */
export async function getActiveGoals(db: AsyncDb): Promise<Goal[]> {
  const { rows } = await query<Row>(
    db,
    `${GOAL_BASE_QUERY} AND status = ? ORDER BY sort_order ASC, (target_date IS NULL) ASC, target_date ASC, name ASC`,
    ['ACTIVE'],
  );
  return rows.map(mapGoal);
}

/** Return goals that have been completed. */
export async function getCompletedGoals(db: AsyncDb): Promise<Goal[]> {
  const { rows } = await query<Row>(
    db,
    `${GOAL_BASE_QUERY} AND status = ? ORDER BY sort_order ASC, updated_at DESC, name ASC`,
    ['COMPLETED'],
  );
  return rows.map(mapGoal);
}

/**
 * Return a goal's real contribution history, oldest first, with a cumulative
 * running total.
 *
 * These are the actual rows written by {@link contributeToGoal} into
 * `goal_progress_contribution`. Consumers use the timestamps and per-entry
 * amounts to compute a genuine monthly pace and projected completion date,
 * rather than fabricating a single lump-sum contribution from the goal's
 * current balance (#3381).
 */
export async function getGoalProgressContributions(
  db: AsyncDb,
  goalId: SyncId,
): Promise<GoalContributionRecord[]> {
  const { rows } = await query<Row>(
    db,
    `SELECT amount, contributed_at
       FROM goal_progress_contributions
      WHERE goal_id = ?
        AND deleted_at IS NULL
      ORDER BY contributed_at ASC, created_at ASC`,
    [goalId],
  );

  let runningTotalCents = 0;
  return rows.map((row) => {
    const amountCents = requireNumber(row.amount, 'goal_progress_contribution.amount');
    runningTotalCents += amountCents;
    return {
      date: requireString(row.contributed_at, 'goal_progress_contribution.contributed_at'),
      amountCents,
      runningTotalCents,
    };
  });
}
