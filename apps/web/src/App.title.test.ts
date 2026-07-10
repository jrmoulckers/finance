// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression tests for page-title derivation (#3616).
 *
 * Nine primary destinations used to fall back to the generic "Finance" title
 * because a second, hand-maintained `PAGE_TITLES` map in App.tsx had drifted
 * from the localized `resolvePageLabel` resolver (`lib/i18n/page-title.ts`).
 * `derivePageTitle` now reads exclusively from that single source of truth, so
 * every route resolves to its real, localized name for the header `<h1>` and
 * breadcrumb — and can never drift from the browser tab title again.
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

  it('titles the 9 routes that previously fell back to "Finance"', () => {
    const previouslyBroken: Record<string, string> = {
      '/remittances': 'Remittances',
      '/expected-income': 'Expected Income',
      '/live-pnl': 'Live P&L',
      '/estimated-tax': 'Estimated Taxes',
      '/trip-budgets': 'Trip & Country Budgets',
      '/building-credit': 'Building Credit',
      '/fire': 'FIRE Planner',
      '/cash-runway': 'Cash Runway',
      '/business-pnl': 'Profit & Loss',
    };

    for (const [path, title] of Object.entries(previouslyBroken)) {
      expect(derivePageTitle(path)).toBe(title);
    }
  });

  it('resolves nested routes from the shared localized resolver', () => {
    expect(derivePageTitle('/report-builder')).toBe('Report Builder');
    expect(derivePageTitle('/settings/security')).toBe('Security & Encryption');
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
