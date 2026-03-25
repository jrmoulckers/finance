// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMutationQueue } from '../useMutationQueue';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetQueueSize = vi.fn<() => Promise<number>>();

vi.mock('../../db/mutation-queue', () => ({
  getQueueSize: () => mockGetQueueSize(),
}));

// ---------------------------------------------------------------------------
// Navigator stubs
// ---------------------------------------------------------------------------

const swEventTarget = new EventTarget();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetQueueSize.mockResolvedValue(0);

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMutationQueue', () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('initialises queueSize to 0', async () => {
    const { result } = renderHook(() => useMutationQueue());

    expect(result.current.queueSize).toBe(0);
  });

  it('initialises isReplaying to false', () => {
    const { result } = renderHook(() => useMutationQueue());

    expect(result.current.isReplaying).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Queue size fetching
  // -----------------------------------------------------------------------

  it('fetches queue size on mount', async () => {
    mockGetQueueSize.mockResolvedValue(5);

    await act(async () => {
      renderHook(() => useMutationQueue());
    });

    expect(mockGetQueueSize).toHaveBeenCalled();
  });

  it('updates queueSize from getQueueSize', async () => {
    mockGetQueueSize.mockResolvedValue(3);

    let hookResult: ReturnType<typeof renderHook<ReturnType<typeof useMutationQueue>, unknown>>;
    await act(async () => {
      hookResult = renderHook(() => useMutationQueue());
    });

    expect(hookResult!.result.current.queueSize).toBe(3);
  });

  it('sets queueSize to 0 when getQueueSize throws', async () => {
    mockGetQueueSize.mockRejectedValue(new Error('DB error'));

    let hookResult: ReturnType<typeof renderHook<ReturnType<typeof useMutationQueue>, unknown>>;
    await act(async () => {
      hookResult = renderHook(() => useMutationQueue());
    });

    expect(hookResult!.result.current.queueSize).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Polling
  // -----------------------------------------------------------------------

  it('polls queue size periodically', async () => {
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

  it('clears polling interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    let hookResult: ReturnType<typeof renderHook<ReturnType<typeof useMutationQueue>, unknown>>;
    await act(async () => {
      hookResult = renderHook(() => useMutationQueue());
    });

    hookResult!.unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // replay()
  // -----------------------------------------------------------------------

  it('sends REPLAY_MUTATIONS message when replay is called with controller', () => {
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

  it('does nothing when replay is called without controller', () => {
    const { result } = renderHook(() => useMutationQueue());

    act(() => {
      result.current.replay();
    });

    // Should not throw, and isReplaying should remain false
    expect(result.current.isReplaying).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Service worker messages
  // -----------------------------------------------------------------------

  it('sets isReplaying true on MUTATION_REPLAY_STARTED message', () => {
    const { result } = renderHook(() => useMutationQueue());

    act(() => {
      swEventTarget.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'MUTATION_REPLAY_STARTED' },
        }),
      );
    });

    expect(result.current.isReplaying).toBe(true);
  });

  it('sets isReplaying false and updates queueSize on MUTATION_REPLAY_FINISHED message', () => {
    const { result } = renderHook(() => useMutationQueue());

    // Start replaying
    act(() => {
      swEventTarget.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'MUTATION_REPLAY_STARTED' },
        }),
      );
    });

    expect(result.current.isReplaying).toBe(true);

    // Finish replaying
    act(() => {
      swEventTarget.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'MUTATION_REPLAY_FINISHED', queueSize: 2 },
        }),
      );
    });

    expect(result.current.isReplaying).toBe(false);
    expect(result.current.queueSize).toBe(2);
  });
});
