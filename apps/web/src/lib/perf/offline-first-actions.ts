// SPDX-License-Identifier: BUSL-1.1

export type OfflineEntity = 'account' | 'transaction' | 'budget' | 'receipt' | 'settings';
export type OfflineOperation = 'create' | 'edit' | 'delete' | 'categorize' | 'add-note' | 'view';
export type OfflineActionStatus = 'queued' | 'syncing' | 'synced' | 'failed' | 'needs-review' | 'disabled';

export interface OfflineActionRequest {
  readonly entity: OfflineEntity;
  readonly operation: OfflineOperation;
  readonly hasLocalReplica: boolean;
  readonly requiresNetworkAuth?: boolean;
}

export interface OfflineActionDecision {
  readonly supported: boolean;
  readonly status: OfflineActionStatus;
  readonly reason: string | null;
  readonly shouldPersistMutation: boolean;
}

export interface QueuedActionViewModel {
  readonly status: OfflineActionStatus;
  readonly label: string;
  readonly description: string;
  readonly canRetry: boolean;
  readonly canReview: boolean;
}

const OFFLINE_WRITE_SUPPORT: Readonly<Record<OfflineEntity, ReadonlySet<OfflineOperation>>> = {
  account: new Set(['create', 'edit', 'delete', 'view']),
  transaction: new Set(['create', 'edit', 'delete', 'categorize', 'add-note', 'view']),
  budget: new Set(['view']),
  receipt: new Set(['view']),
  settings: new Set(['view']),
};

export function decideOfflineAction(request: OfflineActionRequest): OfflineActionDecision {
  if (request.requiresNetworkAuth === true) {
    return disabled('This action needs a fresh sign-in before it can be queued offline.');
  }

  if (!request.hasLocalReplica && request.operation !== 'create') {
    return disabled('Open this item once online before editing it offline.');
  }

  const supportedOperations = OFFLINE_WRITE_SUPPORT[request.entity];
  if (!supportedOperations.has(request.operation)) {
    return disabled('This action is read-only offline until a local sync adapter is available.');
  }

  return {
    supported: true,
    status: request.operation === 'view' ? 'synced' : 'queued',
    reason: null,
    shouldPersistMutation: request.operation !== 'view',
  };
}

export function describeQueuedAction(status: OfflineActionStatus, pendingPosition?: number): QueuedActionViewModel {
  switch (status) {
    case 'queued':
      return {
        status,
        label: pendingPosition === undefined ? 'Queued offline' : `Queued offline #${pendingPosition}`,
        description: 'Saved locally and will sync automatically when the connection returns.',
        canRetry: false,
        canReview: false,
      };
    case 'syncing':
      return {
        status,
        label: 'Syncing',
        description: 'Uploading this local change now.',
        canRetry: false,
        canReview: false,
      };
    case 'synced':
      return {
        status,
        label: 'Synced',
        description: 'This change is saved on this device and the server.',
        canRetry: false,
        canReview: false,
      };
    case 'failed':
      return {
        status,
        label: 'Sync failed',
        description: 'The local change is safe. Retry sync when the connection is stable.',
        canRetry: true,
        canReview: false,
      };
    case 'needs-review':
      return {
        status,
        label: 'Needs review',
        description: 'Another device changed the same field. Review both versions before saving.',
        canRetry: false,
        canReview: true,
      };
    case 'disabled':
      return {
        status,
        label: 'Unavailable offline',
        description: 'Reconnect to complete this action.',
        canRetry: false,
        canReview: false,
      };
  }
}

export function shouldStartReplayOnOnline(
  input: { readonly cameOnlineAt: number; readonly now: number; readonly pendingCount: number },
  replayWindowMs = 5_000,
): boolean {
  if (input.pendingCount <= 0) return false;
  if (input.now < input.cameOnlineAt) return false;
  return input.now - input.cameOnlineAt <= replayWindowMs;
}

function disabled(reason: string): OfflineActionDecision {
  return {
    supported: false,
    status: 'disabled',
    reason,
    shouldPersistMutation: false,
  };
}
