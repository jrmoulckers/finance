// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  describeNetworkState,
  formatLastAttemptTime,
  getRetryBackoffMs,
  shouldDeferHeavyNetworkWork,
} from './networkDegradation';

describe('network degradation helpers', () => {
  it('defers heavy work on 2g and save-data connections', () => {
    expect(shouldDeferHeavyNetworkWork({ effectiveType: '2g' })).toBe(true);
    expect(shouldDeferHeavyNetworkWork({ effectiveType: '4g', saveData: true })).toBe(true);
    expect(shouldDeferHeavyNetworkWork({ effectiveType: '4g' })).toBe(false);
  });

  it('calculates capped exponential retry backoff', () => {
    expect(getRetryBackoffMs(0)).toBe(1_000);
    expect(getRetryBackoffMs(2)).toBe(4_000);
    expect(getRetryBackoffMs(99)).toBe(30_000);
  });

  it('describes slow, stale, and offline states distinctly', () => {
    expect(
      describeNetworkState({
        isOffline: true,
        hasNetworkFailure: false,
        hasSlowNetwork: false,
        lastAttemptAt: null,
      }).kind,
    ).toBe('offline');
    expect(
      describeNetworkState({
        isOffline: false,
        hasNetworkFailure: true,
        hasSlowNetwork: false,
        lastAttemptAt: null,
      }).kind,
    ).toBe('stale-cache');
    expect(
      describeNetworkState({
        isOffline: false,
        hasNetworkFailure: false,
        hasSlowNetwork: true,
        lastAttemptAt: null,
      }).kind,
    ).toBe('slow');
  });

  it('formats last attempt timestamps for retry controls', () => {
    expect(formatLastAttemptTime(1_000, 45_000)).toBe('just now');
    expect(formatLastAttemptTime(1_000, 181_000)).toBe('3 mins ago');
  });
});
