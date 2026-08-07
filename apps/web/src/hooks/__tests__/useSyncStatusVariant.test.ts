// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression tests for the shared sync-status derivation.
 *
 * The original bug (#3960) was that the global banner and the Settings sync
 * row derived "offline" from different sources, so the app could show
 * "Offline. Changes saved locally" and "All synced" at the same time. These
 * tests pin the single-source-of-truth behaviour so both surfaces agree.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncStatusMock = {
  isOnline: true,
  isOffline: false,
  pendingMutations: 0,
  lastSyncTime: null as string | null,
  isSyncing: false,
  syncNow: vi.fn(),
  authError: false,
  conflictCount: 0,
};

const liveStatusMock = {
  connected: false,
  connecting: false,
  syncing: false,
  hasSynced: false,
  hasError: false,
  lastSyncedAt: null as string | null,
};

const powerSyncEnabledMock = { value: false };

vi.mock('../useSyncStatus', () => ({
  useSyncStatus: () => syncStatusMock,
}));

vi.mock('../useLivePowerSyncStatus', () => ({
  useLivePowerSyncStatus: () => liveStatusMock,
}));

vi.mock('../../db/sync/powersync/database', () => ({
  isPowerSyncEnabled: () => powerSyncEnabledMock.value,
}));

vi.mock('../../db/sync/sync-conflict', () => ({
  getUnresolvedConflicts: vi.fn().mockResolvedValue([]),
}));

import {
  describeSyncVariant,
  isDisconnectedVariant,
  useSyncStatusVariant,
} from '../useSyncStatusVariant';

function resetMocks(): void {
  syncStatusMock.isOnline = true;
  syncStatusMock.isOffline = false;
  syncStatusMock.pendingMutations = 0;
  syncStatusMock.lastSyncTime = null;
  syncStatusMock.isSyncing = false;
  syncStatusMock.conflictCount = 0;

  liveStatusMock.connected = false;
  liveStatusMock.connecting = false;
  liveStatusMock.syncing = false;
  liveStatusMock.hasSynced = false;
  liveStatusMock.hasError = false;
  liveStatusMock.lastSyncedAt = null;

  powerSyncEnabledMock.value = false;
}

describe('useSyncStatusVariant', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('reports "synced" when online with no pending mutations (PowerSync off)', () => {
    const { result } = renderHook(() => useSyncStatusVariant());

    expect(result.current.variant).toBe('synced');
    expect(result.current.isOffline).toBe(false);
  });

  it('reports "offline" when the browser is offline', () => {
    syncStatusMock.isOffline = true;

    const { result } = renderHook(() => useSyncStatusVariant());

    expect(result.current.variant).toBe('offline');
    expect(result.current.isOffline).toBe(true);
  });

  it('reports "pending" when mutations are queued (PowerSync off)', () => {
    syncStatusMock.pendingMutations = 3;

    const { result } = renderHook(() => useSyncStatusVariant());

    expect(result.current.variant).toBe('pending');
    expect(result.current.pendingMutations).toBe(3);
  });

  it('reports "offline" when PowerSync is enabled but the live client is not connected', () => {
    // This is the exact #3960 scenario: browser is online but the live
    // PowerSync connection has not been established. The single source of
    // truth must report offline so the banner and Settings row agree.
    powerSyncEnabledMock.value = true;
    syncStatusMock.isOffline = false;

    const { result } = renderHook(() => useSyncStatusVariant());

    expect(result.current.variant).toBe('offline');
    expect(result.current.isOffline).toBe(true);
  });

  it('reports "synced" when PowerSync is enabled and the live client is connected', () => {
    powerSyncEnabledMock.value = true;
    liveStatusMock.connected = true;
    liveStatusMock.hasSynced = true;

    const { result } = renderHook(() => useSyncStatusVariant());

    expect(result.current.variant).toBe('synced');
    expect(result.current.isOffline).toBe(false);
  });

  it('surfaces unresolved conflicts as the "conflict" variant', async () => {
    const { getUnresolvedConflicts } = await import('../../db/sync/sync-conflict');
    vi.mocked(getUnresolvedConflicts).mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }] as never);

    const { result } = renderHook(() => useSyncStatusVariant());

    await waitFor(() => {
      expect(result.current.variant).toBe('conflict');
    });
    expect(result.current.conflictCount).toBe(2);
    expect(result.current.isOffline).toBe(true);
  });
});

describe('describeSyncVariant', () => {
  it('produces stable labels for every variant', () => {
    expect(describeSyncVariant('synced', 0, 0)).toBe('All synced');
    expect(describeSyncVariant('offline', 0, 0)).toBe('Offline. Changes saved locally');
    expect(describeSyncVariant('syncing', 0, 0)).toBe('Syncing\u2026');
    expect(describeSyncVariant('error', 0, 0)).toBe('Sync failed');
    expect(describeSyncVariant('pending', 1, 0)).toBe('1 pending change');
    expect(describeSyncVariant('pending', 3, 0)).toBe('3 pending changes');
    expect(describeSyncVariant('conflict', 0, 1)).toBe('1 conflict need attention');
    expect(describeSyncVariant('conflict', 0, 2)).toBe('2 conflicts need attention');
  });
});

describe('isDisconnectedVariant', () => {
  it('treats offline, error, and conflict as disconnected', () => {
    expect(isDisconnectedVariant('offline')).toBe(true);
    expect(isDisconnectedVariant('error')).toBe(true);
    expect(isDisconnectedVariant('conflict')).toBe(true);
    expect(isDisconnectedVariant('synced')).toBe(false);
    expect(isDisconnectedVariant('pending')).toBe(false);
    expect(isDisconnectedVariant('syncing')).toBe(false);
  });
});
