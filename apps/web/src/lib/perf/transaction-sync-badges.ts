// SPDX-License-Identifier: BUSL-1.1

export type TransactionSyncState = 'saved-local' | 'queued' | 'syncing' | 'failed' | 'conflicted' | 'synced';
export type TransactionSyncTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type TransactionSyncAction = 'retry-sync' | 'review-conflict' | null;

export interface TransactionQueueState {
  readonly transactionId: string;
  readonly state: Exclude<TransactionSyncState, 'saved-local' | 'synced'>;
  readonly queuePosition?: number;
  readonly canRetry?: boolean;
  readonly canResolveConflict?: boolean;
}

export interface TransactionSyncBadge {
  readonly transactionId: string;
  readonly state: TransactionSyncState;
  readonly label: string;
  readonly description: string;
  readonly ariaLabel: string;
  readonly tone: TransactionSyncTone;
  readonly action: TransactionSyncAction;
  readonly announcePolitely: boolean;
}

export function createTransactionSyncBadge(
  transactionId: string,
  queueState: TransactionQueueState | null,
  savedLocally = false,
): TransactionSyncBadge {
  if (queueState !== null) {
    return badgeFromQueueState(queueState);
  }

  if (savedLocally) {
    return createBadge(
      transactionId,
      'saved-local',
      'Saved locally',
      'Saved on this device — will sync when online.',
      'info',
      null,
      true,
    );
  }

  return createBadge(
    transactionId,
    'synced',
    'Synced',
    'Saved on this device and backed up online.',
    'success',
    null,
    false,
  );
}

export function mapTransactionSyncBadges(
  transactionIds: readonly string[],
  queueStates: readonly TransactionQueueState[],
  locallySavedIds: ReadonlySet<string> = new Set(),
): readonly TransactionSyncBadge[] {
  const statesById = new Map(queueStates.map((state) => [state.transactionId, state] as const));
  return transactionIds.map((transactionId) =>
    createTransactionSyncBadge(
      transactionId,
      statesById.get(transactionId) ?? null,
      locallySavedIds.has(transactionId),
    ),
  );
}

function badgeFromQueueState(queueState: TransactionQueueState): TransactionSyncBadge {
  switch (queueState.state) {
    case 'queued': {
      const label = queueState.queuePosition === undefined ? 'Queued' : `Queued #${queueState.queuePosition}`;
      return createBadge(
        queueState.transactionId,
        'queued',
        label,
        'Saved on this device — will sync when online.',
        'info',
        null,
        true,
      );
    }
    case 'syncing':
      return createBadge(
        queueState.transactionId,
        'syncing',
        'Syncing',
        'Uploading this transaction now.',
        'neutral',
        null,
        true,
      );
    case 'failed':
      return createBadge(
        queueState.transactionId,
        'failed',
        'Sync failed',
        'This transaction is saved locally. Retry sync when the connection is stable.',
        'danger',
        queueState.canRetry === true ? 'retry-sync' : null,
        true,
      );
    case 'conflicted':
      return createBadge(
        queueState.transactionId,
        'conflicted',
        'Needs review',
        'Another device changed this transaction. Review the conflict before syncing.',
        'warning',
        queueState.canResolveConflict === true ? 'review-conflict' : null,
        true,
      );
  }
}

function createBadge(
  transactionId: string,
  state: TransactionSyncState,
  label: string,
  description: string,
  tone: TransactionSyncTone,
  action: TransactionSyncAction,
  announcePolitely: boolean,
): TransactionSyncBadge {
  return {
    transactionId,
    state,
    label,
    description,
    ariaLabel: `${label}. ${description}`,
    tone,
    action,
    announcePolitely,
  };
}
