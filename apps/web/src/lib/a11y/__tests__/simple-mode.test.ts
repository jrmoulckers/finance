// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  getSimpleModePlan,
  shouldSuppressInSimpleMode,
  simplifyFinancialCopy,
} from '../simple-mode';

describe('simple mode helpers', () => {
  it('defines one primary action and reduced regions for dashboard', () => {
    const plan = getSimpleModePlan('dashboard');

    expect(plan.primaryAction).toBe('Add transaction');
    expect(plan.visibleRegions).toContain('balance summary');
    expect(plan.collapsedRegions).toContain('advanced insights');
  });

  it('replaces jargon with plain language', () => {
    expect(simplifyFinancialCopy('Review variance and liquidity before reconciliation.')).toBe(
      'Review difference from plan and money available soon before match records.',
    );
  });

  it('suppresses non-critical prompts that increase cognitive load', () => {
    expect(shouldSuppressInSimpleMode('Show non-critical celebration banner')).toBe(true);
    expect(shouldSuppressInSimpleMode('Bill due tomorrow')).toBe(false);
  });
});
