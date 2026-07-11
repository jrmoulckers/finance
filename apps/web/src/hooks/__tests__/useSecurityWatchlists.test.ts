// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSecurityWatchlists } from '../useSecurityWatchlists';
import { useInvestments } from '../useInvestments';

vi.mock('../useInvestments', () => ({
  useInvestments: vi.fn(),
}));

const mockedUseInvestments = vi.mocked(useInvestments);

function investmentsWithPrices(prices: Record<string, number>) {
  return {
    investments: Object.entries(prices).map(([symbol, amount], index) => ({
      id: `inv-${index}`,
      symbol,
      currentPricePerShare: { amount, currency: 'USD' },
    })),
  } as unknown as ReturnType<typeof useInvestments>;
}

describe('useSecurityWatchlists', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedUseInvestments.mockReturnValue(investmentsWithPrices({ AAPL: 20000 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts empty', () => {
    const { result } = renderHook(() => useSecurityWatchlists());
    expect(result.current.watches).toHaveLength(0);
    expect(result.current.alerts).toHaveLength(0);
  });

  it('adds a watch and persists it to localStorage', () => {
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'aapl',
        referencePriceCents: 19000,
        alertThresholdPercent: 5,
      });
    });

    expect(result.current.watches).toHaveLength(1);
    expect(result.current.watches[0].symbol).toBe('AAPL');
    expect(localStorage.getItem('finance-security-watchlists')).toContain('AAPL');
  });

  it('emits an alert when the held price moves beyond the threshold', () => {
    // Reference 190.00, current 200.00 → +5.26% ≥ 5% threshold.
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'AAPL',
        referencePriceCents: 19000,
        alertThresholdPercent: 5,
      });
    });

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].watch.symbol).toBe('AAPL');
    expect(result.current.alerts[0].movePercent).toBeCloseTo(5.26, 2);
  });

  it('does not alert when the move is within the threshold', () => {
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'AAPL',
        referencePriceCents: 19900,
        alertThresholdPercent: 5,
      });
    });

    expect(result.current.alerts).toHaveLength(0);
  });

  it('re-baselines the reference price to the latest held price', () => {
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'AAPL',
        referencePriceCents: 19000,
        alertThresholdPercent: 5,
      });
    });
    expect(result.current.alerts).toHaveLength(1);

    act(() => {
      result.current.resetReferencePrice(result.current.watches[0].id);
    });

    expect(result.current.watches[0].referencePriceCents).toBe(20000);
    expect(result.current.alerts).toHaveLength(0);
  });

  it('dismisses an alert until refresh', () => {
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'AAPL',
        referencePriceCents: 19000,
        alertThresholdPercent: 5,
      });
    });
    const watchId = result.current.watches[0].id;

    act(() => {
      result.current.dismissAlert(watchId);
    });
    expect(result.current.alerts).toHaveLength(0);

    act(() => {
      result.current.refresh();
    });
    expect(result.current.alerts).toHaveLength(1);
  });

  it('removes a watch', () => {
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'AAPL',
        referencePriceCents: 19000,
        alertThresholdPercent: 5,
      });
    });
    const watchId = result.current.watches[0].id;

    act(() => {
      result.current.removeWatch(watchId);
    });
    expect(result.current.watches).toHaveLength(0);
  });

  it('suppresses alerts when disabled for an entry', () => {
    const { result } = renderHook(() => useSecurityWatchlists());

    act(() => {
      result.current.addWatch({
        symbol: 'AAPL',
        referencePriceCents: 19000,
        alertThresholdPercent: 5,
      });
    });
    expect(result.current.alerts).toHaveLength(1);

    act(() => {
      result.current.toggleAlerts(result.current.watches[0].id);
    });
    expect(result.current.alerts).toHaveLength(0);
  });
});
