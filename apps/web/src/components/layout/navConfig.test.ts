// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  BOTTOM_NAV_PRIORITY_ITEMS,
  NAV_CONFIG,
  NAV_ROUTE_TITLES,
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
