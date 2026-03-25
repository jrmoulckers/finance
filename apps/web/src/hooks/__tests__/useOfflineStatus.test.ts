// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOfflineStatus } from '../useOfflineStatus';

// ---------------------------------------------------------------------------
// Navigator stubs
// ---------------------------------------------------------------------------

let onlineState: boolean;

beforeEach(() => {
  onlineState = true;
  vi.clearAllMocks();

  Object.defineProperty(navigator, 'onLine', {
    get: () => onlineState,
    configurable: true,
  });

  // Provide a minimal serviceWorker stub
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOfflineStatus', () => {
  // -----------------------------------------------------------------------
  // Initial online / offline state
  // -----------------------------------------------------------------------

  it('returns isOnline true when navigator.onLine is true', () => {
    onlineState = true;

    const { result } = renderHook(() => useOfflineStatus());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('returns isOffline true when navigator.onLine is false', () => {
    onlineState = false;

    const { result } = renderHook(() => useOfflineStatus());

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Event-driven state transitions
  // -----------------------------------------------------------------------

  it('updates to online when online event fires', () => {
    onlineState = false;

    const { result } = renderHook(() => useOfflineStatus());

    expect(result.current.isOnline).toBe(false);

    act(() => {
      onlineState = true;
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isOffline).toBe(false);
  });

  it('updates to offline when offline event fires', () => {
    onlineState = true;

    const { result } = renderHook(() => useOfflineStatus());

    expect(result.current.isOffline).toBe(false);

    act(() => {
      onlineState = false;
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Event listener registration / cleanup
  // -----------------------------------------------------------------------

  it('registers online and offline event listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useOfflineStatus());

    const eventTypes = addSpy.mock.calls.map((call) => call[0]);
    expect(eventTypes).toContain('online');
    expect(eventTypes).toContain('offline');
  });

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOfflineStatus());
    unmount();

    const eventTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(eventTypes).toContain('online');
    expect(eventTypes).toContain('offline');
  });

  // -----------------------------------------------------------------------
  // Background sync on reconnect
  // -----------------------------------------------------------------------

  it('sends REGISTER_SYNC message to service worker when coming online', () => {
    const mockPostMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: { postMessage: mockPostMessage },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    onlineState = false;
    renderHook(() => useOfflineStatus());

    act(() => {
      onlineState = true;
      window.dispatchEvent(new Event('online'));
    });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'REGISTER_SYNC' });
  });

  it('does not send REGISTER_SYNC when no service worker controller', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    onlineState = false;
    renderHook(() => useOfflineStatus());

    // Should not throw
    act(() => {
      onlineState = true;
      window.dispatchEvent(new Event('online'));
    });
  });
});
