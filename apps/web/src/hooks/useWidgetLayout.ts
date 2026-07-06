// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing the customizable dashboard widget layout.
 *
 * Persists widget configuration (visibility, order, size) to localStorage
 * so the layout survives page refreshes and works offline.
 *
 * Usage:
 * ```tsx
 * const { widgets, toggleWidget, moveWidget, resetLayout } = useWidgetLayout();
 * ```
 *
 * References: issue #315
 * @module hooks/useWidgetLayout
 */

import { useCallback, useMemo, useState } from 'react';

import {
  buildDefaultLayout,
  LAYOUT_STORAGE_KEY,
  LAYOUT_VERSION,
  type DashboardLayout,
  type WidgetConfig,
  type WidgetId,
  type WidgetSize,
} from '../components/dashboard/widget-types';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/** Read layout from localStorage, falling back to the default layout. */
function loadLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw === null) {
      return buildDefaultLayout();
    }
    const parsed = JSON.parse(raw) as DashboardLayout;
    // Migrate or reset if version mismatch
    if (parsed.version !== LAYOUT_VERSION) {
      return buildDefaultLayout();
    }
    return parsed;
  } catch {
    return buildDefaultLayout();
  }
}

/** Persist layout to localStorage. */
function saveLayout(layout: DashboardLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage full or unavailable — silently degrade
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useWidgetLayout}. */
export interface UseWidgetLayoutResult {
  /** Current widget configurations, sorted by order. */
  widgets: readonly WidgetConfig[];
  /** Only the visible widgets, sorted by order. */
  visibleWidgets: readonly WidgetConfig[];
  /** Whether the customization panel is currently open. */
  isCustomizing: boolean;
  /** Open the customization panel. */
  startCustomizing: () => void;
  /** Close the customization panel and persist changes. */
  stopCustomizing: () => void;
  /** Toggle visibility of a specific widget. */
  toggleWidget: (id: WidgetId) => void;
  /** Move a widget up or down in the display order. */
  moveWidget: (id: WidgetId, direction: 'up' | 'down') => void;
  /** Move a widget to an arbitrary position (used by drag-and-drop reordering). */
  reorderWidget: (id: WidgetId, targetIndex: number) => void;
  /** Change the size of a widget. */
  resizeWidget: (id: WidgetId, size: WidgetSize) => void;
  /** Reset to the default layout. */
  resetLayout: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWidgetLayout(): UseWidgetLayoutResult {
  const [layout, setLayout] = useState<DashboardLayout>(loadLayout);
  const [isCustomizing, setIsCustomizing] = useState(false);

  const sortedWidgets = useMemo(
    () => [...layout.widgets].sort((a, b) => a.order - b.order),
    [layout.widgets],
  );

  const visibleWidgets = useMemo(() => sortedWidgets.filter((w) => w.visible), [sortedWidgets]);

  const updateLayout = useCallback((updater: (current: DashboardLayout) => DashboardLayout) => {
    setLayout((prev) => {
      const next = updater(prev);
      saveLayout(next);
      return next;
    });
  }, []);

  const startCustomizing = useCallback(() => setIsCustomizing(true), []);
  const stopCustomizing = useCallback(() => setIsCustomizing(false), []);

  const toggleWidget = useCallback(
    (id: WidgetId) => {
      updateLayout((current) => ({
        ...current,
        widgets: current.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
      }));
    },
    [updateLayout],
  );

  const moveWidget = useCallback(
    (id: WidgetId, direction: 'up' | 'down') => {
      updateLayout((current) => {
        const sorted = [...current.widgets].sort((a, b) => a.order - b.order);
        const index = sorted.findIndex((w) => w.id === id);
        if (index === -1) return current;

        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= sorted.length) return current;

        // Swap order values
        const updatedWidgets = sorted.map((w, i) => {
          if (i === index) return { ...w, order: sorted[swapIndex].order };
          if (i === swapIndex) return { ...w, order: sorted[index].order };
          return w;
        });

        return { ...current, widgets: updatedWidgets };
      });
    },
    [updateLayout],
  );

  const reorderWidget = useCallback(
    (id: WidgetId, targetIndex: number) => {
      updateLayout((current) => {
        const sorted = [...current.widgets].sort((a, b) => a.order - b.order);
        const fromIndex = sorted.findIndex((w) => w.id === id);
        if (fromIndex === -1) return current;

        const clampedTarget = Math.max(0, Math.min(targetIndex, sorted.length - 1));
        if (fromIndex === clampedTarget) return current;

        // Remove the dragged widget and re-insert it at the target slot, then
        // normalise every order value to its new array index.
        const reordered = [...sorted];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(clampedTarget, 0, moved);
        const updatedWidgets = reordered.map((w, i) => ({ ...w, order: i }));

        return { ...current, widgets: updatedWidgets };
      });
    },
    [updateLayout],
  );

  const resizeWidget = useCallback(
    (id: WidgetId, size: WidgetSize) => {
      updateLayout((current) => ({
        ...current,
        widgets: current.widgets.map((w) => (w.id === id ? { ...w, size } : w)),
      }));
    },
    [updateLayout],
  );

  const resetLayout = useCallback(() => {
    const defaultLayout = buildDefaultLayout();
    setLayout(defaultLayout);
    saveLayout(defaultLayout);
  }, []);

  return {
    widgets: sortedWidgets,
    visibleWidgets,
    isCustomizing,
    startCustomizing,
    stopCustomizing,
    toggleWidget,
    moveWidget,
    reorderWidget,
    resizeWidget,
    resetLayout,
  };
}

// Re-export widget types for convenience
export { WIDGET_DEFINITIONS, WIDGET_DEFINITION_MAP } from '../components/dashboard/widget-types';
export type { WidgetConfig, WidgetId, WidgetSize } from '../components/dashboard/widget-types';
