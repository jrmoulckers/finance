// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '../../kmp/bridge';
import {
  EMPTY_QUICK_ADD_DEFAULTS,
  QUICK_ADD_LAST_ACCOUNT_KEY,
  QUICK_ADD_LAST_CATEGORY_KEY,
  QUICK_ADD_PRESETS,
  centsToDollars,
  dollarsToCents,
  loadQuickAddDefaults,
  resolvePresetCategoryId,
  saveQuickAddDefaults,
} from './quick-add-defaults';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCategory(overrides: Partial<Category> & { id: string; name: string }): Category {
  return {
    householdId: 'hh-1',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  } as Category;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('quick-add remembered defaults', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('builds the storage keys from the finance namespace', () => {
    expect(QUICK_ADD_LAST_ACCOUNT_KEY).toBe('finance:quick-add-last-account');
    expect(QUICK_ADD_LAST_CATEGORY_KEY).toBe('finance:quick-add-last-category');
  });

  it('returns empty defaults when nothing is stored', () => {
    expect(loadQuickAddDefaults()).toEqual(EMPTY_QUICK_ADD_DEFAULTS);
  });

  it('round-trips remembered account and category', () => {
    saveQuickAddDefaults({ accountId: 'acc-9', categoryId: 'cat-3' });
    expect(loadQuickAddDefaults()).toEqual({ accountId: 'acc-9', categoryId: 'cat-3' });
  });

  it('round-trips a skipped (null) category', () => {
    saveQuickAddDefaults({ accountId: 'acc-9', categoryId: null });
    expect(loadQuickAddDefaults()).toEqual({ accountId: 'acc-9', categoryId: null });
  });

  it('clears a remembered identifier when it becomes null', () => {
    saveQuickAddDefaults({ accountId: 'acc-9', categoryId: 'cat-3' });
    saveQuickAddDefaults({ accountId: 'acc-9', categoryId: null });
    expect(localStorage.getItem(QUICK_ADD_LAST_CATEGORY_KEY)).toBeNull();
    expect(loadQuickAddDefaults()).toEqual({ accountId: 'acc-9', categoryId: null });
  });
});

describe('quick-add instant presets', () => {
  it('exposes cash, coffee, lunch and transit presets', () => {
    expect(QUICK_ADD_PRESETS.map((preset) => preset.id)).toEqual([
      'cash',
      'coffee',
      'lunch',
      'transit',
    ]);
  });

  it('prefills sensible default amounts in integer cents', () => {
    const byId = Object.fromEntries(QUICK_ADD_PRESETS.map((preset) => [preset.id, preset]));
    expect(byId.cash.defaultCents).toBe(2000);
    expect(byId.coffee.defaultCents).toBe(500);
    expect(byId.lunch.defaultCents).toBe(1500);
    expect(byId.transit.defaultCents).toBe(300);
    for (const preset of QUICK_ADD_PRESETS) {
      expect(Number.isInteger(preset.defaultCents)).toBe(true);
    }
  });

  it('resolves a preset to the first matching spending category', () => {
    const categories = [
      makeCategory({ id: 'cat-income', name: 'Salary', isIncome: true }),
      makeCategory({ id: 'cat-dining', name: 'Dining Out' }),
      makeCategory({ id: 'cat-transport', name: 'Transport' }),
    ];
    const coffee = QUICK_ADD_PRESETS.find((preset) => preset.id === 'coffee')!;
    const transit = QUICK_ADD_PRESETS.find((preset) => preset.id === 'transit')!;

    expect(resolvePresetCategoryId(coffee, categories)).toBe('cat-dining');
    expect(resolvePresetCategoryId(transit, categories)).toBe('cat-transport');
  });

  it('never matches income categories and returns null when nothing fits', () => {
    const categories = [makeCategory({ id: 'cat-income', name: 'Coffee Income', isIncome: true })];
    const coffee = QUICK_ADD_PRESETS.find((preset) => preset.id === 'coffee')!;
    expect(resolvePresetCategoryId(coffee, categories)).toBeNull();
  });
});

describe('integer cents helpers', () => {
  it('parses dollar strings into integer cents without float drift', () => {
    expect(dollarsToCents('4.50')).toBe(450);
    expect(dollarsToCents('4')).toBe(400);
    expect(dollarsToCents('4.5')).toBe(450);
    expect(dollarsToCents('0.99')).toBe(99);
    expect(dollarsToCents('$12.34')).toBe(1234);
    expect(dollarsToCents('')).toBe(0);
  });

  it('truncates extra fractional digits to two places', () => {
    expect(dollarsToCents('12.345')).toBe(1234);
  });

  it('formats integer cents back into a dollar string', () => {
    expect(centsToDollars(450)).toBe('4.50');
    expect(centsToDollars(2000)).toBe('20.00');
    expect(centsToDollars(5)).toBe('0.05');
    expect(centsToDollars(-1500)).toBe('15.00');
  });
});
