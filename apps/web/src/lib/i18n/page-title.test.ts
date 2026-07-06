// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  PAGE_TITLE_CATALOGS,
  ROUTE_TITLE_IDS,
  resolveDocumentTitle,
  resolvePageLabel,
  resolvePageTitleId,
} from './page-title';

// The nine routes called out in #3104 that previously fell back to "Finance".
const REGRESSION_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['/fire', 'FIRE Planner · Finance'],
  ['/cash-runway', 'Cash Runway · Finance'],
  ['/expected-income', 'Expected Income · Finance'],
  ['/trip-budgets', 'Trip & Country Budgets · Finance'],
  ['/remittances', 'Remittances · Finance'],
  ['/building-credit', 'Building Credit · Finance'],
  ['/live-pnl', 'Live P&L · Finance'],
  ['/business-pnl', 'Profit & Loss · Finance'],
  ['/gig-driver', 'Gig Driver Economics · Finance'],
];

describe('resolveDocumentTitle', () => {
  it('gives each #3104 regression route a descriptive, non-generic title', () => {
    for (const [pathname, expected] of REGRESSION_ROUTES) {
      expect(resolveDocumentTitle(pathname, 'en-US')).toBe(expected);
      expect(resolveDocumentTitle(pathname, 'en-US')).not.toBe('Finance');
    }
  });

  it('sets a distinct, brand-suffixed title for every mapped route', () => {
    const seenPaths = new Set<string>();
    for (const pathname of Object.keys(ROUTE_TITLE_IDS)) {
      const title = resolveDocumentTitle(pathname, 'en-US');
      expect(title.endsWith(' · Finance')).toBe(true);
      expect(title).not.toBe('Finance');
      expect(title.replace(' · Finance', '').length).toBeGreaterThan(0);
      seenPaths.add(pathname);
    }
    // Every route in the map was exercised.
    expect(seenPaths.size).toBe(Object.keys(ROUTE_TITLE_IDS).length);
  });

  it('derives detail-route titles from the parent segment', () => {
    expect(resolveDocumentTitle('/accounts/abc123', 'en-US')).toBe('Accounts · Finance');
    expect(resolveDocumentTitle('/transactions/txn-1', 'en-US')).toBe('Transactions · Finance');
    expect(resolveDocumentTitle('/investments/xyz', 'en-US')).toBe('Investments · Finance');
    expect(resolveDocumentTitle('/bills/42', 'en-US')).toBe('Bills · Finance');
  });

  it('keeps exact overrides ahead of the segment fallback', () => {
    expect(resolveDocumentTitle('/investments/tax', 'en-US')).toBe('Tax Center · Finance');
    expect(resolveDocumentTitle('/bills/new', 'en-US')).toBe('New Bill · Finance');
    expect(resolveDocumentTitle('/settings/security', 'en-US')).toBe(
      'Security & Encryption · Finance',
    );
  });

  it('falls back to a localized Not Found title for unknown routes', () => {
    expect(resolveDocumentTitle('/does-not-exist', 'en-US')).toBe('Page Not Found · Finance');
    expect(resolveDocumentTitle('/nope/deep/path', 'en-US')).toBe('Page Not Found · Finance');
    expect(resolveDocumentTitle('/does-not-exist', 'es-ES')).toBe('Página no encontrada · Finance');
  });

  it('localizes titles for supported locales', () => {
    expect(resolveDocumentTitle('/dashboard', 'es-ES')).toBe('Panel · Finance');
    expect(resolveDocumentTitle('/dashboard', 'zh-Hans')).toBe('概览 · Finance');
    expect(resolveDocumentTitle('/cash-runway', 'es-ES')).toBe('Autonomía de efectivo · Finance');
    expect(resolveDocumentTitle('/remittances', 'zh-Hans')).toBe('汇款 · Finance');
  });

  it('falls back to English for locales without a title catalog', () => {
    expect(resolveDocumentTitle('/dashboard', 'de-DE')).toBe('Dashboard · Finance');
  });
});

describe('resolvePageTitleId / resolvePageLabel', () => {
  it('returns undefined for unknown routes', () => {
    expect(resolvePageTitleId('/nope')).toBeUndefined();
    expect(resolvePageLabel('/nope', 'en-US')).toBeUndefined();
  });

  it('maps the root path to the dashboard title', () => {
    expect(resolvePageTitleId('/')).toBe('pageTitle.dashboard');
    expect(resolvePageLabel('/', 'en-US')).toBe('Dashboard');
  });
});

describe('page title catalogs', () => {
  it('translate every message id present in the English source catalog', () => {
    const englishCatalog = PAGE_TITLE_CATALOGS['en-US'] ?? {};
    const sourceIds = Object.keys(englishCatalog);
    for (const [locale, catalog] of Object.entries(PAGE_TITLE_CATALOGS)) {
      const missing = sourceIds.filter((id) => !Object.prototype.hasOwnProperty.call(catalog, id));
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('gives every mapped route id a corresponding English string', () => {
    const englishCatalog = PAGE_TITLE_CATALOGS['en-US'] ?? {};
    for (const id of Object.values(ROUTE_TITLE_IDS)) {
      expect(Object.prototype.hasOwnProperty.call(englishCatalog, id)).toBe(true);
    }
  });
});
