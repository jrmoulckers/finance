// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the shared display-currency preference (single source of truth).
 *
 * References: issue #2203
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DISPLAY_CURRENCY,
  DISPLAY_CURRENCY_CHANGE_EVENT,
  DISPLAY_CURRENCY_STORAGE_KEY,
  SUPPORTED_DISPLAY_CURRENCIES,
  getStoredDisplayCurrency,
  setStoredDisplayCurrency,
} from './display-currency';

describe('display-currency preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses the historical finance-currency storage key', () => {
    expect(DISPLAY_CURRENCY_STORAGE_KEY).toBe('finance-currency');
  });

  it('falls back to the default currency when nothing is stored', () => {
    expect(getStoredDisplayCurrency()).toBe(DEFAULT_DISPLAY_CURRENCY);
  });

  it('reads a previously stored preference', () => {
    localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, 'EUR');
    expect(getStoredDisplayCurrency()).toBe('EUR');
  });

  it('persists and normalises a chosen currency (case-insensitive)', () => {
    const stored = setStoredDisplayCurrency('eur');
    expect(stored).toBe('EUR');
    expect(localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)).toBe('EUR');
    expect(getStoredDisplayCurrency()).toBe('EUR');
  });

  it('falls back to the default for invalid codes', () => {
    localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, 'not-a-currency');
    expect(getStoredDisplayCurrency()).toBe(DEFAULT_DISPLAY_CURRENCY);
  });

  it('dispatches a same-tab change event when persisted', () => {
    const listener = vi.fn();
    globalThis.addEventListener(DISPLAY_CURRENCY_CHANGE_EVENT, listener);
    setStoredDisplayCurrency('GBP');
    expect(listener).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener(DISPLAY_CURRENCY_CHANGE_EVENT, listener);
  });

  it('exposes a non-empty supported currency list including USD', () => {
    expect(SUPPORTED_DISPLAY_CURRENCIES.length).toBeGreaterThan(1);
    expect(SUPPORTED_DISPLAY_CURRENCIES.some((option) => option.value === 'USD')).toBe(true);
  });
});
