// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSyncStatus } from '../useSyncStatus';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReplayMutations = vi.fn<
  () => Promise<{
    syncedCount: number;
    failedCount: number;
    conflictCount: number;
    authError: boolean;
  }>
>();
const mockGetPendingMutationCount = vi.fn<() => Promise<number>>();

vi.mock('../../db/sync/replayMutations', () => ({
  replayMutations: () => mockReplayMutations(),
}));

vi.mock('../../db/sync/enqueueMutation', () => ({
  getPendingMutationCount: () => mockGetPendingMutationCount(),
}));

vi.mock('../../db/sync/types', () => ({
  LAST_SYNC_TIME_KEY: 'finance-last-sync-time',
  PERIODIC_SYNC_INTERVAL_MS: 30_000,
}));

// ---------------------------------------------------------------------------
// Navigator stubs
// ---------------------------------------------------------------------------

let onlineState: boolean;
const swEventTarget = new EventTarget();

beforeEach(() => {
  onlineState = true;
  vi.clearAllMocks();
  mockGetPendingMutationCount.mockResolvedValue(0);
  mockReplayMutations.mockResolvedValue({
    syncedCount: 0,
    failedCount: 0,
    conflictCount: 0,
    authError: false,
  });

  // Mock navigator.onLine
  Object.defineProperty(navigator, 'onLine', {
    get: () => onlineState,
    configurable: true,
  });

  // Provide a minimal serviceWorker stub so `'serviceWorker' in navigator`
  // evaluates to true but no controller is available (main-thread fallback).
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: null,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        swEventTarget.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        swEventTarget.removeEventListener(type, listener),
    },
    configurable: true,
    writable: true,
  });

  // Clear localStorage
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSyncStatus', () => {
  // -----------------------------------------------------------------------
  // Online / offline state
  // -----------------------------------------------------------------------

  it('reports isOnline as true when navigator.onLine is true', () => {
    onlineState = true;

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('reports isOffline as true when navigator.onLine is false', () => {
    onlineState = false;

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  it('updates isOnline when online event fires', async () => {
    onlineState = false;

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOnline).toBe(false);

    await act(async () => {
      onlineState = true;
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('updates isOffline when offline event fires', async () => {
    onlineState = true;

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOffline).toBe(false);

    await act(async () => {
      onlineState = false;
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Pending count
  // -----------------------------------------------------------------------

  it('initialises pendingMutations to 0', () => {
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.pendingMutations).toBe(0);
  });

  it('calls getPendingMutationCount on mount', async () => {
    mockGetPendingMutationCount.mockResolvedValue(5);

    await act(async () => {
      renderHook(() => useSyncStatus());
    });

    expect(mockGetPendingMutationCount).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Last sync time
  // -----------------------------------------------------------------------

  it('reads lastSyncTime from localStorage on mount', () => {
    const timestamp = '2025-03-06T12:00:00.000Z';
    localStorage.setItem('finance-last-sync-time', timestamp);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.lastSyncTime).toBe(timestamp);
  });

  it('returns null for lastSyncTime when localStorage is empty', () => {
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.lastSyncTime).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Syncing state
  // -----------------------------------------------------------------------

  it('initialises isSyncing to false', () => {
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isSyncing).toBe(false);
  });

  // -----------------------------------------------------------------------
  // syncNow — main-thread fallback (no service worker)
  // -----------------------------------------------------------------------

  it('performs main-thread sync when syncNow is called without service worker', async () => {
    const { result } = renderHook(() => useSyncStatus());

    await act(async () => {
      result.current.syncNow();
      // Allow the async performMainThreadSync to complete
      await vi.waitFor(() => {
        expect(mockReplayMutations).toHaveBeenCalled();
      });
    });
  });

  it('does not call syncNow when already syncing', async () => {
    // Set up a long-running replay to keep isSyncing true
    type ReplayResultType = {
      syncedCount: number;
      failedCount: number;
      conflictCount: number;
      authError: boolean;
    };
    let resolveReplay: (value: ReplayResultType) => void;
    const replayPromise = new Promise<ReplayResultType>((resolve) => {
      resolveReplay = resolve;
    });
    mockReplayMutations.mockReturnValue(replayPromise);

    const { result } = renderHook(() => useSyncStatus());

    // Trigger first sync
    act(() => {
      result.current.syncNow();
    });

    // Try to sync again while still syncing
    act(() => {
      result.current.syncNow();
    });

    // Should only have been called once
    expect(mockReplayMutations).toHaveBeenCalledTimes(1);

    // Clean up
    await act(async () => {
      resolveReplay!({ syncedCount: 0, failedCount: 0, conflictCount: 0, authError: false });
      await replayPromise;
    });
  });

  // -----------------------------------------------------------------------
  // Auth error and conflict count
  // -----------------------------------------------------------------------

  it('initialises authError to false', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.authError).toBe(false);
  });

  it('initialises conflictCount to 0', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.conflictCount).toBe(0);
  });

  it('sets authError when replayMutations returns authError', async () => {
    mockReplayMutations.mockResolvedValue({
      syncedCount: 0,
      failedCount: 1,
      conflictCount: 0,
      authError: true,
    });
    const { result } = renderHook(() => useSyncStatus());

    await act(async () => {
      result.current.syncNow();
      await vi.waitFor(() => {
        expect(mockReplayMutations).toHaveBeenCalled();
      });
    });

    await vi.waitFor(() => {
      expect(result.current.authError).toBe(true);
    });
  });

  it('sets conflictCount from replayMutations result', async () => {
    mockReplayMutations.mockResolvedValue({
      syncedCount: 1,
      failedCount: 0,
      conflictCount: 3,
      authError: false,
    });
    const { result } = renderHook(() => useSyncStatus());

    await act(async () => {
      result.current.syncNow();
      await vi.waitFor(() => {
        expect(mockReplayMutations).toHaveBeenCalled();
      });
    });

    await vi.waitFor(() => {
      expect(result.current.conflictCount).toBe(3);
    });
  });
});
