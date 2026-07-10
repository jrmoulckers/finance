// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_SAVINGS_TARGET_PERCENT,
  MAX_SAVINGS_TARGET_PERCENT,
  MIN_SAVINGS_TARGET_PERCENT,
  SAVINGS_TARGET_STORAGE_KEY,
  getStoredSavingsTargetPercent,
  normalizeSavingsTargetPercent,
  setStoredSavingsTargetPercent,
} from './savings-target';

describe('savings-target preference (#3327)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to 20% when nothing is stored', () => {
    expect(getStoredSavingsTargetPercent()).toBe(DEFAULT_SAVINGS_TARGET_PERCENT);
    expect(DEFAULT_SAVINGS_TARGET_PERCENT).toBe(20);
  });

  it('persists and reads back a whole-percent target', () => {
    const stored = setStoredSavingsTargetPercent(55);
    expect(stored).toBe(55);
    expect(getStoredSavingsTargetPercent()).toBe(55);
    expect(window.localStorage.getItem(SAVINGS_TARGET_STORAGE_KEY)).toBe('55');
  });

  it('clamps and rounds out-of-range or fractional input', () => {
    expect(normalizeSavingsTargetPercent(0)).toBe(MIN_SAVINGS_TARGET_PERCENT);
    expect(normalizeSavingsTargetPercent(250)).toBe(MAX_SAVINGS_TARGET_PERCENT);
    expect(normalizeSavingsTargetPercent(42.6)).toBe(43);
    expect(normalizeSavingsTargetPercent(Number.NaN)).toBe(DEFAULT_SAVINGS_TARGET_PERCENT);
  });

  it('falls back to the default when the stored value is corrupt', () => {
    window.localStorage.setItem(SAVINGS_TARGET_STORAGE_KEY, 'not-a-number');
    expect(getStoredSavingsTargetPercent()).toBe(DEFAULT_SAVINGS_TARGET_PERCENT);
  });
});
