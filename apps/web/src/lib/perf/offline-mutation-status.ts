// SPDX-License-Identifier: BUSL-1.1

export type OfflineMutationEntity = 'account' | 'transaction';
export type OfflineMutationOperation = 'create' | 'edit' | 'delete' | 'categorize' | 'add-note';
export type OfflineMutationState = 'queued' | 'syncing' | 'synced' | 'failed' | 'conflicted';

export interface OfflineMutationRecord {
  readonly id: string;
  readonly entity: OfflineMutationEntity;
  readonly entityId: string;
  readonly operation: OfflineMutationOperation;
  readonly state: OfflineMutationState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly errorMessage?: string;
}

export interface OfflineMutationViewModel {
  readonly id: string;
  readonly entityId: string;
  readonly status: OfflineMutationState;
  readonly label: string;
  readonly detail: string;
  readonly canRetry: boolean;
  readonly canReview: boolean;
}

export function serializeOfflineMutations(records: readonly OfflineMutationRecord[]): string {
  return JSON.stringify(records);
}

export function deserializeOfflineMutations(raw: string): readonly OfflineMutationRecord[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isOfflineMutationRecord);
}

export function buildOfflineMutationStatusViewModels(
  records: readonly OfflineMutationRecord[],
): readonly OfflineMutationViewModel[] {
  return records
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((record, index) => ({
      id: record.id,
      entityId: record.entityId,
      status: record.state,
      label: labelForMutation(record, index + 1),
      detail: detailForMutation(record),
      canRetry: record.state === 'failed',
      canReview: record.state === 'conflicted',
    }));
}

export function shouldStartOfflineReplay(input: {
  readonly pendingCount: number;
  readonly cameOnlineAt: number;
  readonly now: number;
  readonly maxDelayMs?: number;
}): boolean {
  if (input.pendingCount <= 0 || input.now < input.cameOnlineAt) return false;
  return input.now - input.cameOnlineAt <= (input.maxDelayMs ?? 5_000);
}

function labelForMutation(record: OfflineMutationRecord, position: number): string {
  switch (record.state) {
    case 'queued':
      return `Queued ${record.entity} change #${position}`;
    case 'syncing':
      return `Syncing ${record.entity} change`;
    case 'synced':
      return `${capitalize(record.entity)} change synced`;
    case 'failed':
      return `${capitalize(record.entity)} sync failed`;
    case 'conflicted':
      return `${capitalize(record.entity)} needs review`;
  }
}

function detailForMutation(record: OfflineMutationRecord): string {
  if (record.state === 'failed' && record.errorMessage !== undefined) return record.errorMessage;
  if (record.state === 'queued') return 'Saved locally and will sync automatically after reconnect.';
  if (record.state === 'conflicted') return 'Review local and server values before replay continues.';
  if (record.state === 'syncing') return 'Uploading this saved offline action now.';
  return 'Saved locally and online.';
}

function isOfflineMutationRecord(value: unknown): value is OfflineMutationRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<OfflineMutationRecord>;
  return (
    typeof record.id === 'string' &&
    (record.entity === 'account' || record.entity === 'transaction') &&
    typeof record.entityId === 'string' &&
    typeof record.operation === 'string' &&
    typeof record.state === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number'
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
