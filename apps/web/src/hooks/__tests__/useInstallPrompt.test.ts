// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInstallPrompt } from '../useInstallPrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBeforeInstallPromptEvent(
  outcome: 'accepted' | 'dismissed' = 'accepted',
): Event & { prompt: ReturnType<typeof vi.fn> } {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  (event as Event & { prompt: ReturnType<typeof vi.fn> }).prompt = vi.fn().mockResolvedValue({
    outcome,
  });
  (event as Event & { platforms: string[] }).platforms = ['web'];
  return event as Event & { prompt: ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInstallPrompt', () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('initialises with canInstall false and dismissed false', () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.canInstall).toBe(false);
    expect(result.current.dismissed).toBe(false);
  });

  it('reads dismissed state from localStorage on mount', () => {
    localStorage.setItem('finance-install-dismissed', 'true');

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.dismissed).toBe(true);
    expect(result.current.canInstall).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Capturing beforeinstallprompt event
  // -----------------------------------------------------------------------

  it('captures beforeinstallprompt and sets canInstall true', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      const event = createBeforeInstallPromptEvent();
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it('prevents default on beforeinstallprompt event', () => {
    renderHook(() => useInstallPrompt());

    const event = createBeforeInstallPromptEvent();
    const preventSpy = vi.spyOn(event, 'preventDefault');

    act(() => {
      window.dispatchEvent(event);
    });

    expect(preventSpy).toHaveBeenCalled();
  });

  it('canInstall remains false when previously dismissed', () => {
    localStorage.setItem('finance-install-dismissed', 'true');

    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createBeforeInstallPromptEvent());
    });

    // canInstall = promptAvailable && !dismissed → false
    expect(result.current.canInstall).toBe(false);
  });

  // -----------------------------------------------------------------------
  // install()
  // -----------------------------------------------------------------------

  it('calls prompt() on the deferred event when install is called', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    const event = createBeforeInstallPromptEvent('accepted');

    act(() => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      await result.current.install();
    });

    expect(event.prompt).toHaveBeenCalledOnce();
  });

  it('clears canInstall after install is called', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createBeforeInstallPromptEvent('accepted'));
    });

    expect(result.current.canInstall).toBe(true);

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.canInstall).toBe(false);
  });

  it('sets dismissed when user dismisses the install prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createBeforeInstallPromptEvent('dismissed'));
    });

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem('finance-install-dismissed')).toBe('true');
  });

  it('does not set dismissed when user accepts the install prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createBeforeInstallPromptEvent('accepted'));
    });

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.dismissed).toBe(false);
  });

  it('is a no-op when install is called without a deferred prompt', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    // Should not throw
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.canInstall).toBe(false);
  });

  // -----------------------------------------------------------------------
  // dismiss()
  // -----------------------------------------------------------------------

  it('sets dismissed to true and persists to localStorage', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem('finance-install-dismissed')).toBe('true');
  });

  it('dismiss hides the install banner even when prompt is available', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createBeforeInstallPromptEvent());
    });

    expect(result.current.canInstall).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.canInstall).toBe(false);
  });

  // -----------------------------------------------------------------------
  // appinstalled event
  // -----------------------------------------------------------------------

  it('clears canInstall when appinstalled event fires', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      window.dispatchEvent(createBeforeInstallPromptEvent());
    });

    expect(result.current.canInstall).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.canInstall).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useInstallPrompt());
    unmount();

    const eventTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(eventTypes).toContain('beforeinstallprompt');
    expect(eventTypes).toContain('appinstalled');
  });
});
