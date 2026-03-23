// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing multi-select state across a list of items.
 *
 * Provides a `Set`-based selection model with toggle, select-all, and
 * deselect-all operations.  The hook is intentionally generic — callers
 * identify items by their `string` ID (typically a `SyncId`).
 *
 * Usage:
 * ```tsx
 * const { selectedIds, isSelected, toggle, selectAll, deselectAll, selectedCount } =
 *   useBulkSelection();
 * ```
 *
 * References: issue #318
 */

import { useCallback, useMemo, useState } from 'react';

/** Shape returned by {@link useBulkSelection}. */
export interface UseBulkSelectionResult {
  /** The current set of selected item IDs. */
  selectedIds: Set<string>;
  /** Returns `true` if the given ID is currently selected. */
  isSelected: (id: string) => boolean;
  /** Toggle the selection state of a single item. */
  toggle: (id: string) => void;
  /** Select every ID in the provided array (additive — existing selections are preserved). */
  selectAll: (ids: string[]) => void;
  /** Clear all selections. */
  deselectAll: () => void;
  /** The number of currently selected items. */
  selectedCount: number;
}

/**
 * Manage bulk-selection state for a list of identifiable items.
 *
 * All returned callbacks are referentially stable (wrapped in `useCallback`)
 * so they can be safely passed as props without triggering unnecessary
 * re-renders.
 */
export function useBulkSelection(): UseBulkSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback((id: string): boolean => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const deselectAll = useCallback((): void => {
    setSelectedIds(new Set());
  }, []);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    selectedCount,
  };
}
