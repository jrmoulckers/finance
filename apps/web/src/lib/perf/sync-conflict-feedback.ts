// SPDX-License-Identifier: BUSL-1.1

export type ConflictResolutionMode = 'clean' | 'auto-merged' | 'needs-review';

export interface FieldConflict {
  readonly field: string;
  readonly baseValue: unknown;
  readonly localValue: unknown;
  readonly remoteValue: unknown;
}

export interface MergeInput<T extends Record<string, unknown>> {
  readonly base: T;
  readonly local: T;
  readonly remote: T;
  readonly protectedFields?: readonly string[];
}

export interface MergeResult<T extends Record<string, unknown>> {
  readonly mode: ConflictResolutionMode;
  readonly merged: T;
  readonly autoMergedFields: readonly string[];
  readonly conflicts: readonly FieldConflict[];
}

export interface ReplaySummaryInput {
  readonly syncedCount: number;
  readonly mergedCount: number;
  readonly failedCount: number;
  readonly conflictCount: number;
}

export interface ReplaySummary {
  readonly severity: 'success' | 'warning' | 'error';
  readonly title: string;
  readonly detail: string;
}

export function mergeNonOverlappingChanges<T extends Record<string, unknown>>(
  input: MergeInput<T>,
): MergeResult<T> {
  const protectedFields = new Set(input.protectedFields ?? []);
  const fields = new Set([
    ...Object.keys(input.base),
    ...Object.keys(input.local),
    ...Object.keys(input.remote),
  ]);
  const merged: Record<string, unknown> = { ...input.remote };
  const autoMergedFields: string[] = [];
  const conflicts: FieldConflict[] = [];

  for (const field of fields) {
    const baseValue = input.base[field];
    const localValue = input.local[field];
    const remoteValue = input.remote[field];
    const localChanged = !isSameValue(localValue, baseValue);
    const remoteChanged = !isSameValue(remoteValue, baseValue);

    if (!localChanged && !remoteChanged) {
      merged[field] = baseValue;
      continue;
    }

    if (localChanged && !remoteChanged) {
      merged[field] = localValue;
      autoMergedFields.push(field);
      continue;
    }

    if (!localChanged && remoteChanged) {
      merged[field] = remoteValue;
      continue;
    }

    if (isSameValue(localValue, remoteValue)) {
      merged[field] = localValue;
      continue;
    }

    if (protectedFields.has(field)) {
      conflicts.push({ field, baseValue, localValue, remoteValue });
      continue;
    }

    conflicts.push({ field, baseValue, localValue, remoteValue });
  }

  return {
    mode:
      conflicts.length > 0 ? 'needs-review' : autoMergedFields.length > 0 ? 'auto-merged' : 'clean',
    merged: merged as T,
    autoMergedFields,
    conflicts,
  };
}

export function summarizeReplay(input: ReplaySummaryInput): ReplaySummary {
  if (input.conflictCount > 0) {
    return {
      severity: 'warning',
      title: 'Sync needs review',
      detail: `${input.syncedCount} synced, ${input.mergedCount} merged, ${input.failedCount} failed, ${input.conflictCount} need review.`,
    };
  }

  if (input.failedCount > 0) {
    return {
      severity: 'error',
      title: 'Some changes did not sync',
      detail: `${input.syncedCount} synced, ${input.mergedCount} merged, ${input.failedCount} failed.`,
    };
  }

  return {
    severity: 'success',
    title: input.mergedCount > 0 ? 'Changes synced and merged' : 'Changes synced',
    detail: `${input.syncedCount} synced, ${input.mergedCount} merged, 0 failed.`,
  };
}

export function shouldEmitSyncProgress(input: {
  readonly pendingCount: number;
  readonly lastEmittedAt: number | null;
  readonly now: number;
  readonly intervalMs?: number;
}): boolean {
  if (input.pendingCount <= 10) return false;
  if (input.lastEmittedAt === null) return true;
  return input.now - input.lastEmittedAt >= (input.intervalMs ?? 2_000);
}

function isSameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
