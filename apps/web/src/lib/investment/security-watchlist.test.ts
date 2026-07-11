// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  computePriceMovePercent,
  computeSecurityAlert,
  computeSecurityAlerts,
  normalizeSymbol,
  type SecurityWatch,
} from './security-watchlist';

function watch(overrides: Partial<SecurityWatch> = {}): SecurityWatch {
  return {
    id: 'w1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    referencePriceCents: 10000,
    alertThresholdPercent: 5,
    alertsEnabled: true,
    createdAt: '2025-01-01T00:00:00Z',
    sortOrder: 0,
    ...overrides,
  };
}

describe('normalizeSymbol', () => {
  it('trims and upper-cases', () => {
    expect(normalizeSymbol('  aapl ')).toBe('AAPL');
  });
});

describe('computePriceMovePercent', () => {
  it('computes a signed percentage rounded to 2dp', () => {
    expect(computePriceMovePercent(10000, 10550)).toBe(5.5);
    expect(computePriceMovePercent(10000, 9400)).toBe(-6);
  });

  it('returns 0 for a non-positive reference', () => {
    expect(computePriceMovePercent(0, 10000)).toBe(0);
    expect(computePriceMovePercent(-5, 10000)).toBe(0);
  });
});

describe('computeSecurityAlert', () => {
  it('fires a warning when the move meets the threshold', () => {
    const alert = computeSecurityAlert(watch(), 10600); // +6% vs 5% threshold
    expect(alert).not.toBeNull();
    expect(alert?.direction).toBe('up');
    expect(alert?.movePercent).toBe(6);
    expect(alert?.level).toBe('warning');
    expect(alert?.message).toContain('+6.00%');
  });

  it('escalates to critical at double the threshold', () => {
    const alert = computeSecurityAlert(watch(), 8900); // -11% vs 5% threshold
    expect(alert?.level).toBe('critical');
    expect(alert?.direction).toBe('down');
  });

  it('does not fire below the threshold', () => {
    expect(computeSecurityAlert(watch(), 10400)).toBeNull(); // +4% < 5%
  });

  it('does not fire when alerts are disabled', () => {
    expect(computeSecurityAlert(watch({ alertsEnabled: false }), 12000)).toBeNull();
  });

  it('does not fire without a positive reference price', () => {
    expect(computeSecurityAlert(watch({ referencePriceCents: 0 }), 12000)).toBeNull();
  });
});

describe('computeSecurityAlerts', () => {
  it('returns firing alerts sorted by largest absolute move, skipping unknown symbols', () => {
    const watches = [
      watch({ id: 'a', symbol: 'AAPL', referencePriceCents: 10000 }),
      watch({ id: 'b', symbol: 'MSFT', referencePriceCents: 20000 }),
      watch({ id: 'c', symbol: 'TSLA', referencePriceCents: 30000 }),
    ];
    const prices = new Map<string, number>([
      ['AAPL', 10600], // +6%
      ['MSFT', 25000], // +25%
      // TSLA has no price → skipped
    ]);

    const alerts = computeSecurityAlerts(watches, prices);
    expect(alerts.map((a) => a.watch.symbol)).toEqual(['MSFT', 'AAPL']);
  });
});
