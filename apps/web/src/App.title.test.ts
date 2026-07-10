// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression tests for page-title derivation (#3780).
 *
 * Nine primary destinations used to fall back to the generic "Finance" title
 * because `PAGE_TITLES` in App.tsx drifted from `NAV_CONFIG`. Titles are now
 * seeded from the nav config, so every sidebar route resolves to its real name
 * for both the header `<h1>` and the browser tab title.
 */

import { describe, expect, it } from 'vitest';

import { derivePageTitle } from './App';
import { NAV_CONFIG } from './components/layout/navConfig';

describe('derivePageTitle', () => {
  it('resolves every primary nav destination to a non-generic title', () => {
    for (const item of NAV_CONFIG) {
      const title = derivePageTitle(item.href);
      expect(title).not.toBe('Finance');
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it('titles the routes that previously fell back to "Finance"', () => {
    const previouslyBroken: Record<string, string> = {
      '/remittances': 'Remittances',
      '/expected-income': 'Expected Income',
      '/live-pnl': 'Live P&L',
      '/estimated-tax': 'Estimated Taxes',
      '/trip-budgets': 'Trip Budgets',
      '/building-credit': 'Building Credit',
      '/fire': 'FIRE Planner',
      '/cash-runway': 'Cash Runway',
      '/business-pnl': 'Profit & Loss',
    };

    for (const [path, title] of Object.entries(previouslyBroken)) {
      expect(derivePageTitle(path)).toBe(title);
    }
  });

  it('keeps bespoke non-nav titles that override the nav defaults', () => {
    expect(derivePageTitle('/report-builder')).toBe('Report Builder');
    expect(derivePageTitle('/settings/security')).toBe('Settings · Security & Encryption');
    expect(derivePageTitle('/legal/privacy')).toBe('Privacy Policy');
  });

  it('falls back to the first path segment for detail routes', () => {
    expect(derivePageTitle('/accounts/abc123')).toBe('Accounts');
    expect(derivePageTitle('/transactions/42/edit')).toBe('Transactions');
  });

  it('uses the generic app name only for genuinely unknown routes', () => {
    expect(derivePageTitle('/totally-unknown-route')).toBe('Finance');
  });
});
