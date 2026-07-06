// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { BOTTOM_NAV_PRIORITY_ITEMS, NAV_CONFIG } from './navConfig';

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
