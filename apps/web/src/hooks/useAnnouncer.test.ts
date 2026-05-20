// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAnnouncer } from './useAnnouncer';

// Mock the announce function from accessibility/aria
vi.mock('../accessibility/aria', () => ({
  announce: vi.fn(),
}));

import { announce } from '../accessibility/aria';

describe('useAnnouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces rapid announcements', () => {
    const { result } = renderHook(() => useAnnouncer({ debounceMs: 200 }));

    act(() => {
      result.current.announce('first');
      result.current.announce('second');
      result.current.announce('third');
    });

    // No announcement yet — still within debounce window
    expect(announce).not.toHaveBeenCalled();

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Only the last message should be announced
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('third', 'polite');
  });

  it('announceNow bypasses debounce', () => {
    const { result } = renderHook(() => useAnnouncer({ debounceMs: 500 }));

    act(() => {
      result.current.announceNow('urgent');
    });

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('urgent', 'polite');
  });

  it('announceNow cancels pending debounced announcement', () => {
    const { result } = renderHook(() => useAnnouncer({ debounceMs: 500 }));

    act(() => {
      result.current.announce('debounced');
      result.current.announceNow('immediate');
    });

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('immediate', 'polite');

    // Advance past debounce — the cancelled debounced call should not fire
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('respects assertive politeness', () => {
    const { result } = renderHook(() => useAnnouncer({ politeness: 'assertive', debounceMs: 100 }));

    act(() => {
      result.current.announce('alert!');
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(announce).toHaveBeenCalledWith('alert!', 'assertive');
  });

  it('uses default debounce of 500ms', () => {
    const { result } = renderHook(() => useAnnouncer());

    act(() => {
      result.current.announce('message');
    });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(announce).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(announce).toHaveBeenCalledTimes(1);
  });
});
