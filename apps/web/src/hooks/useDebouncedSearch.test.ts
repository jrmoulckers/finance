// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedSearch } from './useDebouncedSearch';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDebouncedSearch', () => {
  it('initializes with empty strings by default', () => {
    const { result } = renderHook(() => useDebouncedSearch());

    expect(result.current.searchTerm).toBe('');
    expect(result.current.debouncedTerm).toBe('');
    expect(result.current.isDebouncing).toBe(false);
  });

  it('initializes with provided initial term', () => {
    const { result } = renderHook(() => useDebouncedSearch({ initialTerm: 'hello' }));

    expect(result.current.searchTerm).toBe('hello');
    expect(result.current.debouncedTerm).toBe('hello');
  });

  it('updates searchTerm immediately', () => {
    const { result } = renderHook(() => useDebouncedSearch());

    act(() => {
      result.current.setSearchTerm('test');
    });

    expect(result.current.searchTerm).toBe('test');
    expect(result.current.isDebouncing).toBe(true);
  });

  it('updates debouncedTerm after delay', () => {
    const { result } = renderHook(() => useDebouncedSearch({ delay: 300 }));

    act(() => {
      result.current.setSearchTerm('test');
    });

    // Before delay
    expect(result.current.debouncedTerm).toBe('');

    // After delay
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedTerm).toBe('test');
    expect(result.current.isDebouncing).toBe(false);
  });

  it('cancels previous timer on new input', () => {
    const { result } = renderHook(() => useDebouncedSearch({ delay: 300 }));

    act(() => {
      result.current.setSearchTerm('te');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.setSearchTerm('test');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedTerm).toBe('test');
  });

  it('clears both terms immediately on clearSearch', () => {
    const { result } = renderHook(() => useDebouncedSearch());

    act(() => {
      result.current.setSearchTerm('test');
    });

    // Advance timer so debouncedTerm updates
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedTerm).toBe('test');

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.searchTerm).toBe('');
    expect(result.current.debouncedTerm).toBe('');
  });

  it('respects minLength option', () => {
    const { result } = renderHook(() => useDebouncedSearch({ delay: 300, minLength: 3 }));

    act(() => {
      result.current.setSearchTerm('ab');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should not update debounced term because input is too short
    expect(result.current.debouncedTerm).toBe('');

    act(() => {
      result.current.setSearchTerm('abc');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.debouncedTerm).toBe('abc');
  });

  it('uses custom delay', () => {
    const { result } = renderHook(() => useDebouncedSearch({ delay: 500 }));

    act(() => {
      result.current.setSearchTerm('test');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should not have updated yet
    expect(result.current.debouncedTerm).toBe('');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.debouncedTerm).toBe('test');
  });
});
