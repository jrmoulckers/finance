// SPDX-License-Identifier: BUSL-1.1

/**
 * Offline CRUD & Sync Status UX tests (#1333)
 *
 * Validates offline behavior and sync status feedback:
 * - OfflineBanner displays when offline
 * - Sync status indicator shows pending changes count
 * - Queue management for offline mutations
 * - Sync resumes when online
 * - Conflict indicators in UI
 * - Data integrity after offline → online transition
 */

import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// OfflineBanner mock setup
// ---------------------------------------------------------------------------

const offlineStatusMock = vi.hoisted(() => ({
  isOffline: false,
  isOnline: true,
}));

vi.mock('../hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => offlineStatusMock,
}));

import { OfflineBanner } from '../components/OfflineBanner';

// ---------------------------------------------------------------------------
// useMutationQueue mock setup
// ---------------------------------------------------------------------------

const mockGetQueueSize = vi.fn<() => Promise<number>>();

vi.mock('../db/mutation-queue', () => ({
  getQueueSize: () => mockGetQueueSize(),
}));

import { useMutationQueue } from '../hooks/useMutationQueue';

// ---------------------------------------------------------------------------
// useSyncStatus mock setup
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

vi.mock('../db/sync/replayMutations', () => ({
  replayMutations: () => mockReplayMutations(),
}));

vi.mock('../db/sync/enqueueMutation', () => ({
  getPendingMutationCount: () => mockGetPendingMutationCount(),
}));

vi.mock('../db/sync/types', () => ({
  LAST_SYNC_TIME_KEY: 'finance-last-sync-time',
  PERIODIC_SYNC_INTERVAL_MS: 30_000,
}));

import { useSyncStatus } from '../hooks/useSyncStatus';

// ---------------------------------------------------------------------------
// Navigator stubs
// ---------------------------------------------------------------------------

let onlineState: boolean;
const swEventTarget = new EventTarget();

beforeEach(() => {
  onlineState = true;
  vi.clearAllMocks();
  mockGetQueueSize.mockResolvedValue(0);
  mockGetPendingMutationCount.mockResolvedValue(0);
  mockReplayMutations.mockResolvedValue({
    syncedCount: 0,
    failedCount: 0,
    conflictCount: 0,
    authError: false,
  });

  offlineStatusMock.isOffline = false;
  offlineStatusMock.isOnline = true;

  Object.defineProperty(navigator, 'onLine', {
    get: () => onlineState,
    configurable: true,
  });

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

  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// OfflineBanner
// ---------------------------------------------------------------------------

describe('OfflineBanner (#1333)', () => {
  it('shows the banner when offline', () => {
    offlineStatusMock.isOffline = true;
    offlineStatusMock.isOnline = false;

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).not.toHaveClass('offline-banner--hidden');
    expect(
      screen.getByText('You are offline. Changes will sync when connectivity is restored.'),
    ).toBeInTheDocument();
  });

  it('hides the banner when online', () => {
    offlineStatusMock.isOffline = false;
    offlineStatusMock.isOnline = true;

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveClass('offline-banner--hidden');
  });

  it('uses role="status" for assistive technology', () => {
    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-live="polite" for non-intrusive announcements', () => {
    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('transitions from online to offline state', () => {
    const { rerender } = render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveClass('offline-banner--hidden');

    offlineStatusMock.isOffline = true;
    offlineStatusMock.isOnline = false;
    rerender(<OfflineBanner />);

    expect(screen.getByRole('status')).not.toHaveClass('offline-banner--hidden');
  });

  it('transitions from offline to online state', () => {
    offlineStatusMock.isOffline = true;
    offlineStatusMock.isOnline = false;

    const { rerender } = render(<OfflineBanner />);
    expect(screen.getByRole('status')).not.toHaveClass('offline-banner--hidden');

    offlineStatusMock.isOffline = false;
    offlineStatusMock.isOnline = true;
    rerender(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveClass('offline-banner--hidden');
  });
});

// ---------------------------------------------------------------------------
// Mutation queue management
// ---------------------------------------------------------------------------

describe('Mutation queue management (#1333)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialises queue size to 0', () => {
    const { result } = renderHook(() => useMutationQueue());
    expect(result.current.queueSize).toBe(0);
  });

  it('fetches queue size from IndexedDB on mount', async () => {
    mockGetQueueSize.mockResolvedValue(7);

    await act(async () => {
      renderHook(() => useMutationQueue());
    });

    expect(mockGetQueueSize).toHaveBeenCalled();
  });

  it('reflects non-zero queue size for pending mutations', async () => {
    mockGetQueueSize.mockResolvedValue(3);

    let hookResult: ReturnType<typeof renderHook<ReturnType<typeof useMutationQueue>, unknown>>;
    await act(async () => {
      hookResult = renderHook(() => useMutationQueue());
    });

    expect(hookResult!.result.current.queueSize).toBe(3);
  });

  it('handles IndexedDB errors gracefully', async () => {
    mockGetQueueSize.mockRejectedValue(new Error('IndexedDB not available'));

    let hookResult: ReturnType<typeof renderHook<ReturnType<typeof useMutationQueue>, unknown>>;
    await act(async () => {
      hookResult = renderHook(() => useMutationQueue());
    });

    expect(hookResult!.result.current.queueSize).toBe(0);
  });

  it('polls queue size at regular intervals', async () => {
    mockGetQueueSize.mockResolvedValue(0);

    await act(async () => {
      renderHook(() => useMutationQueue());
    });

    const callCountAfterMount = mockGetQueueSize.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(mockGetQueueSize.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });

  it('tracks replay lifecycle via service worker messages', () => {
    const { result } = renderHook(() => useMutationQueue());

    expect(result.current.isReplaying).toBe(false);

    act(() => {
      swEventTarget.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'MUTATION_REPLAY_STARTED' },
        }),
      );
    });

    expect(result.current.isReplaying).toBe(true);

    act(() => {
      swEventTarget.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'MUTATION_REPLAY_FINISHED', queueSize: 0 },
        }),
      );
    });

    expect(result.current.isReplaying).toBe(false);
    expect(result.current.queueSize).toBe(0);
  });

  it('sends REPLAY_MUTATIONS message when replay is triggered with SW controller', () => {
    const mockPostMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: { postMessage: mockPostMessage },
        addEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
          swEventTarget.addEventListener(type, listener),
        removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
          swEventTarget.removeEventListener(type, listener),
      },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useMutationQueue());

    act(() => {
      result.current.replay();
    });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'REPLAY_MUTATIONS' });
    expect(result.current.isReplaying).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sync status UX
// ---------------------------------------------------------------------------

describe('Sync status UX (#1333)', () => {
  it('reports isOnline when navigator.onLine is true', () => {
    onlineState = true;
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('reports isOffline when navigator.onLine is false', () => {
    onlineState = false;
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  it('initialises pending mutations to 0', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.pendingMutations).toBe(0);
  });

  it('initialises isSyncing to false', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.isSyncing).toBe(false);
  });

  it('reads lastSyncTime from localStorage', () => {
    const timestamp = '2025-06-01T12:00:00.000Z';
    localStorage.setItem('finance-last-sync-time', timestamp);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.lastSyncTime).toBe(timestamp);
  });

  it('returns null for lastSyncTime when no previous sync', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.lastSyncTime).toBeNull();
  });

  it('exposes authError flag for re-authentication prompts', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.authError).toBe(false);
  });

  it('exposes conflictCount for conflict resolution UI', () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.conflictCount).toBe(0);
  });

  it('responds to online event transition', async () => {
    onlineState = false;
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOffline).toBe(true);

    await act(async () => {
      onlineState = true;
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('responds to offline event transition', async () => {
    onlineState = true;
    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.isOnline).toBe(true);

    await act(async () => {
      onlineState = false;
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOffline).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Conflict indicators
// ---------------------------------------------------------------------------

describe('Conflict indicators (#1333)', () => {
  it('sets conflictCount from sync replay result', async () => {
    mockReplayMutations.mockResolvedValue({
      syncedCount: 5,
      failedCount: 0,
      conflictCount: 2,
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
      expect(result.current.conflictCount).toBe(2);
    });
  });

  it('sets authError when sync encounters authentication failure', async () => {
    mockReplayMutations.mockResolvedValue({
      syncedCount: 0,
      failedCount: 3,
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

  it('clears authError on successful sync', async () => {
    // First: trigger an auth error
    mockReplayMutations.mockResolvedValue({
      syncedCount: 0,
      failedCount: 1,
      conflictCount: 0,
      authError: true,
    });

    const { result } = renderHook(() => useSyncStatus());

    // Trigger first sync and wait for authError to be set
    await act(async () => {
      result.current.syncNow();
    });

    // Allow all microtasks and state updates to flush
    await act(async () => {
      await vi.waitFor(() => expect(result.current.authError).toBe(true));
    });

    // Then: successful sync should clear the error
    mockReplayMutations.mockResolvedValue({
      syncedCount: 1,
      failedCount: 0,
      conflictCount: 0,
      authError: false,
    });

    await act(async () => {
      result.current.syncNow();
    });

    await act(async () => {
      await vi.waitFor(() => expect(result.current.authError).toBe(false));
    });
  });
});

// ---------------------------------------------------------------------------
// Data integrity after offline → online transition
// ---------------------------------------------------------------------------

describe('Data integrity after offline → online (#1333)', () => {
  it('syncNow triggers mutation replay', async () => {
    const { result } = renderHook(() => useSyncStatus());

    await act(async () => {
      result.current.syncNow();
      await vi.waitFor(() => {
        expect(mockReplayMutations).toHaveBeenCalled();
      });
    });
  });

  it('pending count is refreshed after sync completes', async () => {
    mockGetPendingMutationCount.mockResolvedValue(5);

    const { result } = renderHook(() => useSyncStatus());

    await act(async () => {
      result.current.syncNow();
      await vi.waitFor(() => {
        expect(mockReplayMutations).toHaveBeenCalled();
      });
    });

    expect(mockGetPendingMutationCount).toHaveBeenCalled();
  });

  it('syncNow is idempotent — does not double-trigger while already syncing', async () => {
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

    act(() => {
      result.current.syncNow();
    });

    act(() => {
      result.current.syncNow();
    });

    expect(mockReplayMutations).toHaveBeenCalledTimes(1);

    // Clean up
    await act(async () => {
      resolveReplay!({ syncedCount: 0, failedCount: 0, conflictCount: 0, authError: false });
      await replayPromise;
    });
  });
});
