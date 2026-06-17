// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  evaluatePrivacyScreenCoverage,
  maskPrivacyScreenValue,
  shouldAutoEnablePrivacyScreen,
} from './privacy-screen';

describe('privacy screen helpers', () => {
  it('masks sensitive values by category and mode', () => {
    expect(maskPrivacyScreenValue('$12,345', 'amount', 'visible')).toBe('$12,345');
    expect(maskPrivacyScreenValue('$12,345', 'amount', 'masked')).toBe('•••');
    expect(maskPrivacyScreenValue('$12,345', 'amount', 'bucketed')).toBe('Approximate amount');
    expect(maskPrivacyScreenValue('Coffee Shop', 'merchant-name', 'masked')).toBe('Hidden merchant');
  });

  it('reports unmasked sensitive surfaces while excluding explicit export flows', () => {
    const report = evaluatePrivacyScreenCoverage([
      { id: 'dashboard-balance', categories: ['balance'], masked: true },
      { id: 'recent-transactions', categories: ['merchant-name', 'amount'], masked: false },
      { id: 'export-preview', categories: ['amount'], masked: false, exportSurface: true },
    ]);

    expect(report.safe).toBe(false);
    expect(report.unmaskedSurfaceIds).toEqual(['recent-transactions']);
    expect(report.unmaskedCategories).toEqual(['amount', 'merchant-name']);
  });

  it('decides when lifecycle events should auto-enable privacy screen mode', () => {
    const options = { enabled: true, autoEnableOnBackground: true, autoEnableOnScreenShare: false };

    expect(shouldAutoEnablePrivacyScreen('background', options)).toBe(true);
    expect(shouldAutoEnablePrivacyScreen('resume', options)).toBe(true);
    expect(shouldAutoEnablePrivacyScreen('screen-share', options)).toBe(false);
    expect(shouldAutoEnablePrivacyScreen('manual', options)).toBe(false);
    expect(shouldAutoEnablePrivacyScreen('background', { ...options, enabled: false })).toBe(false);
  });
});
