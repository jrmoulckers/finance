// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  BOTTOM_NAV_PRIORITY_ITEMS,
  NAV_CONFIG,
  NAV_ROUTE_TITLES,
  computeAdaptiveBottomNavItems,
  getMoreSheetItems,
  isNavItemActive,
} from './navConfig';

describe('navConfig mobilePriority', () => {
  it('assigns a unique mobilePriority to every destination', () => {
    const priorities = NAV_CONFIG.map((item) => item.mobilePriority);
    const unique = new Set(priorities);

    // A duplicate priority makes bottom-nav selection and "More" sheet ordering
    // non-deterministic (ties resolve only by array position). Every destination
    // must therefore rank uniquely. Regression guard for #3261.
    expect(unique.size).toBe(priorities.length);
  });

  it('keeps mobilePriority values non-negative', () => {
    for (const item of NAV_CONFIG) {
      expect(item.mobilePriority).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(item.mobilePriority)).toBe(true);
    }
  });

  it('promotes the four lowest-priority destinations to the bottom nav', () => {
    const expected = [...NAV_CONFIG]
      .sort((a, b) => a.mobilePriority - b.mobilePriority)
      .slice(0, BOTTOM_NAV_PRIORITY_ITEMS.length)
      .map((item) => item.id);

    expect(BOTTOM_NAV_PRIORITY_ITEMS.map((item) => item.id)).toEqual(expected);
    expect(expected).toEqual(['dashboard', 'accounts', 'transactions', 'debt']);
  });
});

describe('NAV_ROUTE_TITLES', () => {
  it('provides a title for every primary destination', () => {
    // Guards the drift that left 9 routes (e.g. /remittances, /fire, /live-pnl)
    // falling back to the generic "Finance" page/tab title (#3780).
    for (const item of NAV_CONFIG) {
      expect(NAV_ROUTE_TITLES[item.href]).toBe(item.label);
    }
  });

  it('never yields the generic "Finance" fallback for a nav route', () => {
    for (const item of NAV_CONFIG) {
      expect(NAV_ROUTE_TITLES[item.href]).not.toBe('Finance');
    }
  });
});

describe('isNavItemActive', () => {
  it('matches an exact path', () => {
    expect(isNavItemActive('/transactions', '/transactions')).toBe(true);
  });

  it('matches a sub-route to its parent destination', () => {
    expect(isNavItemActive('/transactions/abc123', '/transactions')).toBe(true);
    expect(isNavItemActive('/accounts/42/edit', '/accounts')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(isNavItemActive('/budgets', '/transactions')).toBe(false);
    // A path-prefix that is not a segment boundary must not match.
    expect(isNavItemActive('/transactions-archive', '/transactions')).toBe(false);
  });

  it('lets a more specific destination own a nested path', () => {
    // /investments/tax is its own destination (Tax Center), so it must NOT
    // also light up Investments.
    expect(isNavItemActive('/investments/tax', '/investments')).toBe(false);
    expect(isNavItemActive('/investments/tax', '/investments/tax')).toBe(true);
  });
});

describe('computeAdaptiveBottomNavItems (#3687)', () => {
  it('falls back to the static priority order for new users (no visits)', () => {
    const items = computeAdaptiveBottomNavItems({});
    expect(items.map((item) => item.id)).toEqual(BOTTOM_NAV_PRIORITY_ITEMS.map((item) => item.id));
  });

  it('always pins Dashboard in the first slot', () => {
    const items = computeAdaptiveBottomNavItems({ '/goals': 50, '/budgets': 40 });
    expect(items[0]?.id).toBe('dashboard');
  });

  it('promotes the most-visited destinations after Dashboard', () => {
    const items = computeAdaptiveBottomNavItems({
      '/goals': 20,
      '/budgets': 10,
      '/subscriptions': 5,
    });
    // Dashboard pinned, then goals > budgets > subscriptions by visit count.
    expect(items.map((item) => item.id)).toEqual([
      'dashboard',
      'goals',
      'budgets',
      'subscriptions',
    ]);
  });

  it('breaks visit-count ties by static mobilePriority for determinism', () => {
    // accounts (priority 1) and transactions (priority 2) both visited once.
    const items = computeAdaptiveBottomNavItems({ '/accounts': 1, '/transactions': 1 });
    const ids = items.map((item) => item.id);
    expect(ids[0]).toBe('dashboard');
    expect(ids.indexOf('accounts')).toBeLessThan(ids.indexOf('transactions'));
  });

  it('returns exactly the number of static priority slots', () => {
    const items = computeAdaptiveBottomNavItems({ '/goals': 3 });
    expect(items).toHaveLength(BOTTOM_NAV_PRIORITY_ITEMS.length);
  });
});

describe('getMoreSheetItems priority exclusion (#3687)', () => {
  it('excludes explicitly supplied priority items from the sheet', () => {
    const priority = computeAdaptiveBottomNavItems({ '/goals': 9, '/budgets': 8 });
    const sheet = getMoreSheetItems(false, undefined, priority);
    const sheetIds = new Set(sheet.map((item) => item.id));
    for (const item of priority) {
      expect(sheetIds.has(item.id)).toBe(false);
    }
  });
});
