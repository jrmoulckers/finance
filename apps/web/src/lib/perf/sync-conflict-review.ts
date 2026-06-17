// SPDX-License-Identifier: BUSL-1.1

export type ConflictChoice = 'local' | 'remote';

export interface ConflictValue<T = unknown> {
  readonly value: T;
  readonly timestamp: number;
  readonly sourceDevice?: string;
}

export interface SyncConflictInput<T = unknown> {
  readonly entityId: string;
  readonly field: string;
  readonly local: ConflictValue<T>;
  readonly remote: ConflictValue<T>;
}

export interface SyncConflictReviewItem<T = unknown> extends SyncConflictInput<T> {
  readonly id: string;
  readonly status: 'needs-review';
  readonly auditLabel: string;
}

export interface ConflictResolution<T = unknown> {
  readonly conflictId: string;
  readonly choice: ConflictChoice;
  readonly resolvedValue: T;
  readonly resolvedAt: number;
}

export interface SyncReviewSummaryCounts {
  readonly pending: number;
  readonly resolved: number;
}

export function createSyncConflictReviewItems(
  conflicts: readonly SyncConflictInput[],
): readonly SyncConflictReviewItem[] {
  return conflicts.map((conflict) => ({
    ...conflict,
    id: `${conflict.entityId}:${conflict.field}`,
    status: 'needs-review',
    auditLabel: createAuditLabel(conflict),
  }));
}

export function resolveSyncConflict<T>(
  item: SyncConflictReviewItem<T>,
  choice: ConflictChoice,
  resolvedAt: number,
): ConflictResolution<T> {
  return {
    conflictId: item.id,
    choice,
    resolvedValue: choice === 'local' ? item.local.value : item.remote.value,
    resolvedAt,
  };
}

export function summarizeConflictReview(
  items: readonly SyncConflictReviewItem[],
  resolutions: readonly ConflictResolution[],
): SyncReviewSummaryCounts {
  const resolvedIds = new Set(resolutions.map((resolution) => resolution.conflictId));
  return {
    pending: items.filter((item) => !resolvedIds.has(item.id)).length,
    resolved: resolvedIds.size,
  };
}

function createAuditLabel(conflict: SyncConflictInput): string {
  const localSource = conflict.local.sourceDevice ?? 'this device';
  const remoteSource = conflict.remote.sourceDevice ?? 'server';
  return `${conflict.field}: local from ${localSource} at ${conflict.local.timestamp}, remote from ${remoteSource} at ${conflict.remote.timestamp}`;
}
