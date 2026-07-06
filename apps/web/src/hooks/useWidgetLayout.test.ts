// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_WIDGET_ORDER,
  LAYOUT_STORAGE_KEY,
  type DashboardLayout,
} from '../components/dashboard/widget-types';
import { useWidgetLayout } from './useWidgetLayout';

function orderedIds(widgets: readonly { id: string }[]): string[] {
  return widgets.map((w) => w.id);
}

describe('useWidgetLayout — reorderWidget', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts from the default widget order', () => {
    const { result } = renderHook(() => useWidgetLayout());
    expect(orderedIds(result.current.widgets)).toEqual([...DEFAULT_WIDGET_ORDER]);
  });

  it('moves a widget from the top to a lower position', () => {
    const { result } = renderHook(() => useWidgetLayout());

    act(() => {
      result.current.reorderWidget('net-worth', 2);
    });

    const ids = orderedIds(result.current.widgets);
    expect(ids[2]).toBe('net-worth');
    expect(ids[0]).toBe('monthly-spending');
    // Order values stay contiguous (0..n-1).
    expect(result.current.widgets.map((w) => w.order)).toEqual(ids.map((_, i) => i));
  });

  it('moves a widget from the bottom to the top', () => {
    const { result } = renderHook(() => useWidgetLayout());
    const lastId = DEFAULT_WIDGET_ORDER[DEFAULT_WIDGET_ORDER.length - 1];

    act(() => {
      result.current.reorderWidget(lastId, 0);
    });

    expect(orderedIds(result.current.widgets)[0]).toBe(lastId);
  });

  it('is a no-op when dropping a widget onto its current index', () => {
    const { result } = renderHook(() => useWidgetLayout());
    const before = orderedIds(result.current.widgets);

    act(() => {
      result.current.reorderWidget('net-worth', 0);
    });

    expect(orderedIds(result.current.widgets)).toEqual(before);
  });

  it('clamps an out-of-range target index to the last position', () => {
    const { result } = renderHook(() => useWidgetLayout());

    act(() => {
      result.current.reorderWidget('net-worth', 999);
    });

    const ids = orderedIds(result.current.widgets);
    expect(ids[ids.length - 1]).toBe('net-worth');
  });

  it('ignores an unknown widget id', () => {
    const { result } = renderHook(() => useWidgetLayout());
    const before = orderedIds(result.current.widgets);

    act(() => {
      result.current.reorderWidget('does-not-exist' as never, 3);
    });

    expect(orderedIds(result.current.widgets)).toEqual(before);
  });

  it('persists the reordered layout to localStorage', () => {
    const { result } = renderHook(() => useWidgetLayout());

    act(() => {
      result.current.reorderWidget('net-worth', 2);
    });

    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as DashboardLayout;
    const sorted = [...parsed.widgets].sort((a, b) => a.order - b.order);
    expect(sorted[2].id).toBe('net-worth');
  });
});
