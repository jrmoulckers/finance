// SPDX-License-Identifier: BUSL-1.1

export const SLOW_NETWORK_TIMEOUT_MS = 1_500;
export const SPINNER_PROGRESS_TIMEOUT_MS = 3_000;
export const RETRY_BACKOFF_BASE_MS = 1_000;
export const RETRY_BACKOFF_MAX_MS = 30_000;

export type NetworkEffectiveType = 'slow-2g' | '2g' | '3g' | '4g' | string;

export interface NetworkConnectionLike {
  readonly effectiveType?: NetworkEffectiveType;
  readonly saveData?: boolean;
}

export interface NetworkDegradationState {
  readonly isOffline: boolean;
  readonly hasNetworkFailure: boolean;
  readonly hasSlowNetwork: boolean;
  readonly effectiveType?: NetworkEffectiveType;
  readonly saveData?: boolean;
  readonly lastAttemptAt: number | null;
}

export type NetworkStateKind = 'online' | 'offline' | 'slow' | 'stale-cache' | 'sync-failed';

export function shouldDeferHeavyNetworkWork(
  connection: NetworkConnectionLike | undefined | null,
): boolean {
  if (!connection) return false;
  if (connection.saveData === true) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

export function getRetryBackoffMs(
  failedAttemptCount: number,
  baseMs = RETRY_BACKOFF_BASE_MS,
  maxMs = RETRY_BACKOFF_MAX_MS,
): number {
  const attempt = Math.max(0, Math.floor(failedAttemptCount));
  return Math.min(baseMs * 2 ** attempt, maxMs);
}

export function describeNetworkState(state: NetworkDegradationState): {
  readonly kind: NetworkStateKind;
  readonly message: string;
} {
  if (state.isOffline) {
    return {
      kind: 'offline',
      message: 'You are offline. Changes will sync when connectivity is restored.',
    };
  }

  if (state.hasNetworkFailure) {
    return {
      kind: 'stale-cache',
      message: 'Connection failed. Showing cached finance data while retrying.',
    };
  }

  if (state.hasSlowNetwork || shouldDeferHeavyNetworkWork(state)) {
    return {
      kind: 'slow',
      message: 'Network is slow. Showing cached data while retrying in the background.',
    };
  }

  return { kind: 'online', message: 'Online' };
}

export function formatLastAttemptTime(timestamp: number | null, now = Date.now()): string | null {
  if (timestamp === null) return null;
  const elapsedMs = Math.max(0, now - timestamp);
  if (elapsedMs < 60_000) return 'just now';
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}
