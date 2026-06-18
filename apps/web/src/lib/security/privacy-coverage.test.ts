// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  REQUIRED_PRIVACY_SURFACE_AREAS,
  auditPrivacySurfaceCoverage,
  privacySurface,
} from './privacy-coverage';

describe('privacy surface coverage audit', () => {
  it('passes when all sensitive surface areas are masked and exports are explicitly redacted', () => {
    const audit = auditPrivacySurfaceCoverage([
      privacySurface('dashboard-balance', 'dashboard', ['balance'], 'masked'),
      privacySurface('cashflow-chart', 'chart', ['amount', 'chart-label'], 'bucketed'),
      privacySurface('transaction-detail', 'detail', ['amount', 'merchant-name'], 'masked'),
      privacySurface('csv-export', 'export', ['amount'], 'redacted_on_export', true),
      privacySurface('bill-notification', 'notification', ['notification'], 'masked'),
      privacySurface('search-result', 'search', ['search-result'], 'masked'),
      privacySurface('account-nav', 'navigation', ['account-name'], 'masked'),
    ]);

    expect(audit.complete).toBe(true);
    expect(audit.coveredAreas).toEqual(REQUIRED_PRIVACY_SURFACE_AREAS);
  });

  it('flags unmasked sensitive surfaces and implicit export redaction', () => {
    const audit = auditPrivacySurfaceCoverage([
      privacySurface('dashboard-balance', 'dashboard', ['balance'], 'none'),
      privacySurface('csv-export', 'export', ['amount'], 'redacted_on_export', false),
    ]);

    expect(audit.complete).toBe(false);
    expect(audit.missingMaskingIds).toEqual(['dashboard-balance']);
    expect(audit.missingExportRedactionIds).toEqual(['csv-export']);
    expect(audit.uncoveredAreas).toEqual([
      'chart',
      'detail',
      'notification',
      'search',
      'navigation',
    ]);
  });
});
