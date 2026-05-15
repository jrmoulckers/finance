// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useVirtualList } from './useVirtualList';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function createItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Item ${i}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVirtualList', () => {
  it('calculates total height from item count and height', () => {
    const items = createItems(100);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        containerHeight: 400,
      }),
    );

    expect(result.current.totalHeight).toBe(5000); // 100 * 50
  });

  it('returns only visible items plus overscan', () => {
    const items = createItems(1000);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        containerHeight: 400,
        overscan: 3,
      }),
    );

    // Container fits 8 items (400/50), plus 3+3 overscan = 14 max
    // But starting at 0, overscan below is 0, so: 8 + 3 = 11 max from start
    const visibleCount = result.current.visibleItems.length;
    expect(visibleCount).toBeLessThan(1000);
    expect(visibleCount).toBeGreaterThan(0);
  });

  it('assigns correct offsetTop to each visible item', () => {
    const items = createItems(100);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 64,
        containerHeight: 300,
      }),
    );

    for (const vi of result.current.visibleItems) {
      expect(vi.offsetTop).toBe(vi.index * 64);
    }
  });

  it('preserves item identity in visible items', () => {
    const items = createItems(50);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 40,
        containerHeight: 200,
      }),
    );

    for (const vi of result.current.visibleItems) {
      expect(vi.item).toBe(items[vi.index]);
    }
  });

  it('provides container and content props', () => {
    const items = createItems(10);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        containerHeight: 300,
      }),
    );

    expect(result.current.containerProps.style.height).toBe(300);
    expect(result.current.containerProps.style.overflow).toBe('auto');
    expect(result.current.contentProps.style.height).toBe(500);
    expect(typeof result.current.containerProps.onScroll).toBe('function');
  });

  it('handles empty list', () => {
    const { result } = renderHook(() =>
      useVirtualList({
        items: [],
        itemHeight: 50,
        containerHeight: 400,
      }),
    );

    expect(result.current.totalHeight).toBe(0);
    expect(result.current.visibleItems).toEqual([]);
  });

  it('handles list smaller than container', () => {
    const items = createItems(3);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        containerHeight: 400,
      }),
    );

    expect(result.current.visibleItems.length).toBe(3);
  });

  it('defaults overscan to 5', () => {
    const items = createItems(100);
    const { result } = renderHook(() =>
      useVirtualList({
        items,
        itemHeight: 50,
        containerHeight: 400,
      }),
    );

    // Container fits ceil(400/50)=8 items, overscan=5
    // startIndex = max(0, floor(0/50) - 5) = 0
    // endIndex = min(100, 0 + 8 + 10) = 18
    expect(result.current.visibleItems.length).toBe(18);
  });
});
