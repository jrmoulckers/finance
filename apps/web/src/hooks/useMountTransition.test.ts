// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMountTransition } from './useMountTransition';

// Run the double-rAF enter scheduling synchronously so `entering -> entered`
// is deterministic in tests (the hook's scheduleFrame nests two rAF calls).
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useMountTransition', () => {
  it('collapses to an instant show/hide under reduced motion', () => {
    const { result, rerender } = renderHook(
      ({ isVisible }) => useMountTransition({ isVisible, reducedMotion: true }),
      { initialProps: { isVisible: true } },
    );

    expect(result.current.shouldRender).toBe(true);
    expect(result.current.stage).toBe('entered');

    act(() => {
      rerender({ isVisible: false });
    });

    // No exit animation delay — unmount is immediate.
    expect(result.current.shouldRender).toBe(false);
    expect(result.current.stage).toBe('exited');
  });

  it('animates in on mount and settles into the entered stage', () => {
    const { result } = renderHook(() =>
      useMountTransition({ isVisible: true, reducedMotion: false }),
    );

    expect(result.current.shouldRender).toBe(true);
    // With synchronous rAF the enter frame has already flipped to `entered`.
    expect(result.current.stage).toBe('entered');
  });

  it('enters when isVisible flips from false to true', () => {
    const { result, rerender } = renderHook(
      ({ isVisible }) => useMountTransition({ isVisible, reducedMotion: false }),
      { initialProps: { isVisible: false } },
    );

    expect(result.current.shouldRender).toBe(false);
    expect(result.current.stage).toBe('exited');

    act(() => {
      rerender({ isVisible: true });
    });

    expect(result.current.shouldRender).toBe(true);
    expect(result.current.stage).toBe('entered');
  });

  it('keeps content mounted through the exit animation, then unmounts', () => {
    vi.useFakeTimers();
    // Re-stub rAF after enabling fake timers so enter scheduling stays sync.
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof requestAnimationFrame);

    const { result, rerender } = renderHook(
      ({ isVisible }) => useMountTransition({ isVisible, exitDuration: 200, reducedMotion: false }),
      { initialProps: { isVisible: true } },
    );

    expect(result.current.stage).toBe('entered');

    act(() => {
      rerender({ isVisible: false });
    });

    // Still mounted and animating out immediately after hiding.
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.stage).toBe('exiting');

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.stage).toBe('exiting');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.shouldRender).toBe(false);
    expect(result.current.stage).toBe('exited');
  });
});
