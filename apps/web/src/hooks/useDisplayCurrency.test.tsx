// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for useDisplayCurrency — the shared display-currency preference hook.
 *
 * References: issue #2203
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDisplayCurrency } from './useDisplayCurrency';
import { DISPLAY_CURRENCY_STORAGE_KEY } from '../lib/display-currency';

describe('useDisplayCurrency', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to USD when no preference is stored', () => {
    const { result } = renderHook(() => useDisplayCurrency());
    expect(result.current.displayCurrency).toBe('USD');
  });

  it('hydrates from the persisted preference', () => {
    localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, 'EUR');
    const { result } = renderHook(() => useDisplayCurrency());
    expect(result.current.displayCurrency).toBe('EUR');
  });

  it('persists changes and updates the hook state', () => {
    const { result } = renderHook(() => useDisplayCurrency());

    act(() => {
      result.current.setDisplayCurrency('gbp');
    });

    expect(result.current.displayCurrency).toBe('GBP');
    expect(localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)).toBe('GBP');
  });

  it('propagates a change made by one consumer to another consumer', () => {
    const writer = renderHook(() => useDisplayCurrency());
    const reader = renderHook(() => useDisplayCurrency());

    expect(reader.result.current.displayCurrency).toBe('USD');

    act(() => {
      writer.result.current.setDisplayCurrency('MXN');
    });

    // The second, independent hook instance reflects the new preference via the
    // shared same-tab change event — no prop drilling or reload required.
    expect(reader.result.current.displayCurrency).toBe('MXN');
  });
});
