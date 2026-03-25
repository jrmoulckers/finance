// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useServiceWorkerUpdate } from '../useServiceWorkerUpdate';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the service worker URL import so the module can load
vi.mock('../../sw/service-worker.ts?worker&url', () => ({
  default: '/sw.js',
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockRegistration: {
  waiting: ServiceWorker | null;
  installing: ServiceWorker | null;
  addEventListener: ReturnType<typeof vi.fn>;
};

let registerPromiseResolve: (reg: unknown) => void;

beforeEach(() => {
  vi.clearAllMocks();

  mockRegistration = {
    waiting: null,
    installing: null,
    addEventListener: vi.fn(),
  };

  const registerPromise = new Promise((resolve) => {
    registerPromiseResolve = resolve;
  });

  const swEventTarget = new EventTarget();

  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: { postMessage: vi.fn() },
      register: vi.fn().mockReturnValue(registerPromise),
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        swEventTarget.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        swEventTarget.removeEventListener(type, listener),
      // store a reference for dispatching in tests
      _eventTarget: swEventTarget,
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

describe('useServiceWorkerUpdate', () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('initialises updateAvailable as false', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());

    expect(result.current.updateAvailable).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Detecting waiting service worker
  // -----------------------------------------------------------------------

  it('sets updateAvailable true when registration has a waiting worker', async () => {
    const mockWaiting = { state: 'installed', postMessage: vi.fn() } as unknown as ServiceWorker;
    mockRegistration.waiting = mockWaiting;

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      registerPromiseResolve(mockRegistration);
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('sets updateAvailable true when installing worker becomes installed', async () => {
    let stateChangeHandler: (() => void) | null = null;

    const mockInstalling = {
      state: 'installing',
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'statechange') {
          stateChangeHandler = handler;
        }
      }),
      postMessage: vi.fn(),
    } as unknown as ServiceWorker;

    mockRegistration.installing = mockInstalling;

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      registerPromiseResolve(mockRegistration);
    });

    // Simulate the worker transitioning to 'installed'
    Object.defineProperty(mockInstalling, 'state', { value: 'installed', configurable: true });
    mockRegistration.waiting = mockInstalling as unknown as ServiceWorker;

    await act(async () => {
      stateChangeHandler?.();
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('tracks updatefound event for new installing workers', async () => {
    let updateFoundHandler: (() => void) | null = null;
    mockRegistration.addEventListener.mockImplementation((event: string, handler: () => void) => {
      if (event === 'updatefound') {
        updateFoundHandler = handler;
      }
    });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      registerPromiseResolve(mockRegistration);
    });

    // Simulate a new installing worker being discovered
    let stateChangeHandler: (() => void) | null = null;
    const newWorker = {
      state: 'installing',
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'statechange') {
          stateChangeHandler = handler;
        }
      }),
      postMessage: vi.fn(),
    } as unknown as ServiceWorker;

    mockRegistration.installing = newWorker;

    await act(async () => {
      updateFoundHandler?.();
    });

    // Worker transitions to installed
    Object.defineProperty(newWorker, 'state', { value: 'installed', configurable: true });
    mockRegistration.waiting = newWorker as unknown as ServiceWorker;

    await act(async () => {
      stateChangeHandler?.();
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  // -----------------------------------------------------------------------
  // applyUpdate()
  // -----------------------------------------------------------------------

  it('sends SKIP_WAITING message to the waiting worker', async () => {
    const mockPostMessage = vi.fn();
    const mockWaiting = {
      state: 'installed',
      postMessage: mockPostMessage,
    } as unknown as ServiceWorker;
    mockRegistration.waiting = mockWaiting;

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      registerPromiseResolve(mockRegistration);
    });

    act(() => {
      result.current.applyUpdate();
    });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('is a no-op when no waiting worker exists', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());

    // Should not throw
    act(() => {
      result.current.applyUpdate();
    });
  });

  // -----------------------------------------------------------------------
  // Registration failure
  // -----------------------------------------------------------------------

  it('handles registration failure gracefully', async () => {
    // Override the register mock to reject
    (navigator.serviceWorker.register as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Registration failed'),
    );

    // Re-render since we need a new registration promise
    const { result } = renderHook(() => useServiceWorkerUpdate());

    // Wait for the rejection to be processed
    await act(async () => {
      await vi.waitFor(() => {
        // Just wait for effects to settle
      });
    });

    expect(result.current.updateAvailable).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------

  it('sets mounted flag to false on unmount to prevent state updates', async () => {
    const { result, unmount } = renderHook(() => useServiceWorkerUpdate());

    unmount();

    // Even after resolving registration, no state update should occur
    await act(async () => {
      mockRegistration.waiting = {
        state: 'installed',
        postMessage: vi.fn(),
      } as unknown as ServiceWorker;
      registerPromiseResolve(mockRegistration);
    });

    // updateAvailable should still be false since component unmounted
    expect(result.current.updateAvailable).toBe(false);
  });
});
