// SPDX-License-Identifier: BUSL-1.1

/**
 * useDebouncedSearch — Debounced search input hook.
 *
 * Provides a search term state with a debounced version that updates after
 * a configurable delay. Useful for search inputs where API/DB queries should
 * not fire on every keystroke.
 *
 * @example
 * ```tsx
 * const { searchTerm, debouncedTerm, setSearchTerm, clearSearch } = useDebouncedSearch();
 * // searchTerm updates immediately (for input value)
 * // debouncedTerm updates after 300ms (for queries)
 * ```
 *
 * References: issue #1340
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDebouncedSearchOptions {
  /** Debounce delay in milliseconds. Defaults to 300. */
  delay?: number;

  /** Minimum characters before debounced term updates. Defaults to 0. */
  minLength?: number;

  /** Initial search term. Defaults to ''. */
  initialTerm?: string;
}

export interface UseDebouncedSearchResult {
  /** The current raw search input value (updates immediately). */
  searchTerm: string;

  /** The debounced search term (updates after the delay). */
  debouncedTerm: string;

  /** Update the raw search term. */
  setSearchTerm: (term: string) => void;

  /** Clear the search term and debounced term immediately. */
  clearSearch: () => void;

  /** Whether the debounced value is still pending (term !== debouncedTerm). */
  isDebouncing: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * React hook for debounced search input.
 */
export function useDebouncedSearch(
  options: UseDebouncedSearchOptions = {},
): UseDebouncedSearchResult {
  const { delay = 300, minLength = 0, initialTerm = '' } = options;

  const [searchTerm, setSearchTermState] = useState(initialTerm);
  const [debouncedTerm, setDebouncedTerm] = useState(initialTerm);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update debounced term after delay
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      if (searchTerm.length >= minLength) {
        setDebouncedTerm(searchTerm);
      } else {
        setDebouncedTerm('');
      }
    }, delay);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [searchTerm, delay, minLength]);

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermState(term);
  }, []);

  const clearSearch = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    setSearchTermState('');
    setDebouncedTerm('');
  }, []);

  return {
    searchTerm,
    debouncedTerm,
    setSearchTerm,
    clearSearch,
    isDebouncing: searchTerm !== debouncedTerm,
  };
}
