// SPDX-License-Identifier: BUSL-1.1

import { buildTeenLearningAccount } from './teen-education';
import type { TeenLearningAccount, TeenLearningAction } from './teen-education';

export interface TeenLearningChoreSeed {
  readonly id: string;
  readonly value: number;
  readonly completedThisWeek: boolean;
}

export interface TeenLearningChildSeed {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly balance: number;
  readonly chores: readonly TeenLearningChoreSeed[];
}

export interface TeenLearningLocalRecord {
  readonly id: string;
  readonly householdId: string;
  readonly childProfileId: string;
  readonly account: TeenLearningAccount;
  readonly updatedAt: string;
}

export interface TeenLearningPersistencePayload {
  readonly householdId: string;
  readonly records: readonly TeenLearningLocalRecord[];
  readonly privacyNotice: string;
}

function dollarsToCents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
}

function completedChoreCents(child: Pick<TeenLearningChildSeed, 'chores'>): number {
  return child.chores.reduce((total, chore) => {
    if (!chore.completedThisWeek) return total;
    return total + dollarsToCents(chore.value);
  }, 0);
}

export function buildTeenLearningRecordFromChild(
  householdId: string,
  child: TeenLearningChildSeed,
  updatedAt: string,
  requireApprovalFor?: readonly TeenLearningAction[],
): TeenLearningLocalRecord {
  const account = buildTeenLearningAccount({
    teenId: child.id,
    displayName: child.name,
    age: child.age,
    allowanceBalanceCents: dollarsToCents(child.balance),
    completedChoreEarningsCents: completedChoreCents(child),
    requireApprovalFor,
  });

  return {
    id: `teen-learning:${householdId}:${child.id}`,
    householdId,
    childProfileId: child.id,
    account,
    updatedAt,
  };
}

export function upsertTeenLearningRecord(
  records: readonly TeenLearningLocalRecord[],
  next: TeenLearningLocalRecord,
): readonly TeenLearningLocalRecord[] {
  const withoutDuplicate = records.filter(
    (record) =>
      record.householdId !== next.householdId || record.childProfileId !== next.childProfileId,
  );
  return [...withoutDuplicate, next];
}

export function buildTeenLearningPayload(
  householdId: string,
  records: readonly TeenLearningLocalRecord[],
): TeenLearningPersistencePayload {
  return {
    householdId,
    records: records.filter((record) => record.householdId === householdId),
    privacyNotice:
      'Teen learning payloads persist practice records linked to child profile IDs only; adult accounts, transactions, and net worth are excluded.',
  };
}
