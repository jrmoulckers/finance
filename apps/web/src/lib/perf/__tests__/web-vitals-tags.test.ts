// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { createTaggedWebVitalSample, sanitizeRoute, shouldSampleWebVital } from '../web-vitals-tags';

describe('web vitals tags', () => {
  it('tags samples by sanitized route, device class, network, and app version', () => {
    expect(
      createTaggedWebVitalSample({
        name: 'LCP',
        value: 1_800,
        route: '/transactions/txn-sensitive-id?amount=100',
        viewportWidth: 390,
        effectiveConnectionType: '4g',
        appVersion: '0.1.0',
      }),
    ).toEqual({
      name: 'LCP',
      value: 1_800,
      route: '/transactions/:id',
      deviceClass: 'mobile',
      effectiveConnectionType: '4g',
      appVersion: '0.1.0',
    });
  });

  it('sanitizes finance identifiers from route tags', () => {
    expect(sanitizeRoute('/accounts/acct-123')).toBe('/accounts/:id');
    expect(sanitizeRoute('/budgets/grocery-budget')).toBe('/budgets/:id');
  });

  it('samples beta traffic deterministically by session id', () => {
    expect(shouldSampleWebVital('session-a', 0)).toBe(false);
    expect(shouldSampleWebVital('session-a', 1)).toBe(true);
    expect(shouldSampleWebVital('session-a', 0.25)).toBe(shouldSampleWebVital('session-a', 0.25));
  });
});
