// SPDX-License-Identifier: BUSL-1.1

export { WebMutationQueue, type EnqueueInput } from './MutationQueue';
export { enqueueMutation, getMutationQueue, getPendingMutationCount } from './enqueueMutation';
export {
  replayMutations,
  type ReplayResult,
  type SyncConfig,
  getSyncConfig,
} from './replayMutations';
export {
  clearResolvedConflicts,
  getAllConflicts,
  getUnresolvedConflicts,
  resolveConflict,
  storeConflicts,
  type SyncConflict,
} from './sync-conflict';
export type {
  ClientToSwMessage,
  MutationOperation,
  QueuedMutation,
  SwToClientMessage,
  SyncStatus,
} from './types';
export {
  LAST_SYNC_TIME_KEY,
  MAX_RETRY_COUNT,
  MUTATION_QUEUE_DB_NAME,
  MUTATION_QUEUE_STORE_NAME,
  PERIODIC_SYNC_INTERVAL_MS,
  REPLAY_BATCH_SIZE,
  SYNC_TAG,
} from './types';
