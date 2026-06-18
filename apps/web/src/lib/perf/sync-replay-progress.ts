// SPDX-License-Identifier: BUSL-1.1

export interface SyncReplayProgressInput {
  readonly totalCount: number;
  readonly completedCount: number;
  readonly mergedCount: number;
  readonly failedCount: number;
  readonly conflictCount: number;
  readonly now: number;
  readonly lastBroadcastAt: number | null;
}

export interface SyncReplayProgressMessage {
  readonly type: 'sync-replay-progress';
  readonly totalCount: number;
  readonly completedCount: number;
  readonly remainingCount: number;
  readonly percentComplete: number;
  readonly mergedCount: number;
  readonly failedCount: number;
  readonly conflictCount: number;
  readonly emittedAt: number;
}

export interface SyncReplayToastSummary {
  readonly tone: 'success' | 'warning' | 'danger';
  readonly message: string;
}

export function shouldBroadcastReplayProgress(
  input: SyncReplayProgressInput,
  intervalMs = 2_000,
): boolean {
  if (input.totalCount <= 10) return false;
  if (input.lastBroadcastAt === null) return true;
  return input.now - input.lastBroadcastAt >= intervalMs;
}

export function createSyncReplayProgressMessage(
  input: SyncReplayProgressInput,
): SyncReplayProgressMessage {
  const remainingCount = Math.max(0, input.totalCount - input.completedCount);
  const percentComplete =
    input.totalCount === 0 ? 100 : Math.round((input.completedCount / input.totalCount) * 100);
  return {
    type: 'sync-replay-progress',
    totalCount: input.totalCount,
    completedCount: input.completedCount,
    remainingCount,
    percentComplete: Math.min(100, Math.max(0, percentComplete)),
    mergedCount: input.mergedCount,
    failedCount: input.failedCount,
    conflictCount: input.conflictCount,
    emittedAt: input.now,
  };
}

export function createSyncReplayToastSummary(input: {
  readonly syncedCount: number;
  readonly mergedCount: number;
  readonly failedCount: number;
  readonly conflictCount: number;
}): SyncReplayToastSummary {
  const message = `${input.syncedCount} synced, ${input.mergedCount} merged, ${input.failedCount} failed, ${input.conflictCount} conflicted.`;
  if (input.failedCount > 0) return { tone: 'danger', message };
  if (input.conflictCount > 0) return { tone: 'warning', message };
  return { tone: 'success', message };
}

export function shouldApplyReplayMutation(
  mutationId: string,
  alreadyAppliedMutationIds: ReadonlySet<string>,
): boolean {
  return !alreadyAppliedMutationIds.has(mutationId);
}
