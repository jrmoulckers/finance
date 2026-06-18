// SPDX-License-Identifier: BUSL-1.1

/**
 * useVirtualList — Virtual scrolling hook for large lists.
 *
 * Renders only the visible portion of a list plus a configurable overscan,
 * dramatically improving performance for lists with thousands of items.
 *
 * @example
 * ```tsx
 * const { visibleItems, totalHeight, offsetY, containerProps } = useVirtualList({
 *   items: transactions,
 *   itemHeight: 64,
 *   containerHeight: 600,
 * });
 * ```
 *
 * References: issue #1340
 */

import { useCallback, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseVirtualListOptions<T> {
  /** The full list of items. */
  items: T[];

  /** Height of each item in pixels (fixed height). */
  itemHeight: number;

  /** Height of the scrollable container in pixels. */
  containerHeight: number;

  /** Number of items to render beyond the visible area. Defaults to 5. */
  overscan?: number;
}

export interface VirtualItem<T> {
  /** The original item data. */
  item: T;

  /** Index in the full list. */
  index: number;

  /** Top offset in pixels. */
  offsetTop: number;
}

export interface UseVirtualListResult<T> {
  /** Items currently visible (plus overscan). */
  visibleItems: VirtualItem<T>[];

  /** Total height of the full list in pixels (for the scroll container). */
  totalHeight: number;

  /** Current scroll offset. */
  scrollTop: number;

  /** Props to spread on the scroll container element. */
  containerProps: {
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };

  /** Ref for imperative scroll positioning. */
  containerRef: React.RefObject<HTMLDivElement | null>;

  /** Props to spread on the inner content wrapper. */
  contentProps: {
    style: React.CSSProperties;
  };

  /** First rendered index, including overscan. */
  startIndex: number;

  /** Exclusive rendered end index. */
  endIndex: number;

  /** Imperatively scroll an item into view without rendering all rows. */
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * React hook that virtualizes a list for efficient rendering.
 */
export function useVirtualList<T>(options: UseVirtualListOptions<T>): UseVirtualListResult<T> {
  const { items, itemHeight, containerHeight, overscan = 5 } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const visibleItems = useMemo(() => {
    const result: VirtualItem<T>[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      if (item === undefined) continue;
      result.push({
        item,
        index: i,
        offsetTop: i * itemHeight,
      });
    }

    return result;
  }, [items, itemHeight, startIndex, endIndex]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const containerProps = useMemo(
    () => ({
      onScroll: handleScroll,
      style: {
        height: containerHeight,
        overflow: 'auto' as const,
        position: 'relative' as const,
      },
    }),
    [handleScroll, containerHeight],
  );

  const contentProps = useMemo(
    () => ({
      style: {
        height: totalHeight,
        position: 'relative' as const,
      },
    }),
    [totalHeight],
  );

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      const clampedIndex = Math.min(items.length - 1, Math.max(0, index));
      let nextScrollTop = clampedIndex * itemHeight;
      if (align === 'center') {
        nextScrollTop -= (containerHeight - itemHeight) / 2;
      } else if (align === 'end') {
        nextScrollTop -= containerHeight - itemHeight;
      }
      nextScrollTop = Math.min(
        Math.max(0, nextScrollTop),
        Math.max(0, totalHeight - containerHeight),
      );
      setScrollTop(nextScrollTop);
      if (containerRef.current) {
        containerRef.current.scrollTop = nextScrollTop;
      }
    },
    [containerHeight, itemHeight, items.length, totalHeight],
  );

  return {
    visibleItems,
    totalHeight,
    scrollTop,
    containerProps,
    containerRef,
    contentProps,
    startIndex,
    endIndex,
    scrollToIndex,
  };
}
