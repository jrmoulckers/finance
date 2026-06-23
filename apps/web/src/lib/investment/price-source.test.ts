// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualPriceSource, PollingPriceSource, SimulatedMarketDataProvider } from './price-source';
import type { TimerApi } from './price-source';
import { ManualMarketDataProvider } from './market-data';
import type { QuoteRequest, QuoteSnapshot } from './market-data';

const NOW = '2026-01-02T15:00:00.000Z';

function snapshot(symbol: string, priceCents: number): QuoteSnapshot {
  return {
    symbol,
    assetKind: 'equity',
    priceCents,
    currency: 'USD',
    asOf: NOW,
    source: 'manual',
    marketSession: 'open',
  };
}

const REQUESTS: QuoteRequest[] = [{ symbol: 'VTI', assetKind: 'equity' }];

describe('ManualPriceSource', () => {
  it('delivers pushed quotes to subscribers and reports running state', () => {
    const source = new ManualPriceSource({ now: () => NOW });
    const updates: number[] = [];
    const unsubscribe = source.subscribe((u) => updates.push(u.quotes.length));

    expect(source.running).toBe(false);
    source.start();
    expect(source.running).toBe(true);

    source.emit([snapshot('VTI', 100_00)]);
    source.emit([snapshot('VTI', 101_00)]);
    expect(updates).toEqual([1, 1]);

    unsubscribe();
    source.emit([snapshot('VTI', 102_00)]);
    expect(updates).toEqual([1, 1]); // no further deliveries after unsubscribe
  });

  it('propagates an error flag on a failed update', () => {
    const source = new ManualPriceSource({ now: () => NOW });
    let lastError: string | undefined;
    source.subscribe((u) => {
      lastError = u.error;
    });
    source.emit([], NOW, 'feed down');
    expect(lastError).toBe('feed down');
  });
});

describe('PollingPriceSource', () => {
  let intervalHandler: (() => void) | null = null;
  let timers: TimerApi;
  let cleared: boolean;

  beforeEach(() => {
    intervalHandler = null;
    cleared = false;
    timers = {
      setInterval: (handler) => {
        intervalHandler = handler;
        return 1;
      },
      clearInterval: () => {
        cleared = true;
      },
    };
  });

  it('emits an immediate snapshot on start and again on each interval tick', async () => {
    const provider = new ManualMarketDataProvider([snapshot('VTI', 100_00)]);
    const source = new PollingPriceSource(provider, REQUESTS, {
      intervalMs: 1000,
      now: () => NOW,
      timers,
    });
    const updates: QuoteSnapshot[][] = [];
    source.subscribe((u) => updates.push([...u.quotes]));

    source.start();
    expect(source.running).toBe(true);
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0][0]?.priceCents).toBe(100_00);

    // Simulate an interval tick.
    intervalHandler?.();
    await vi.waitFor(() => expect(updates).toHaveLength(2));

    source.stop();
    expect(source.running).toBe(false);
    expect(cleared).toBe(true);
  });

  it('surfaces provider failures as an error update instead of throwing', async () => {
    const failing = {
      id: 'boom',
      source: 'boom',
      getSnapshots: () => Promise.reject(new Error('network down')),
    };
    const source = new PollingPriceSource(failing, REQUESTS, {
      intervalMs: 1000,
      now: () => NOW,
      timers,
    });
    let captured: string | undefined;
    source.subscribe((u) => {
      captured = u.error;
    });
    await source.refreshNow();
    expect(captured).toBe('network down');
  });

  it('start is idempotent', () => {
    const provider = new ManualMarketDataProvider([snapshot('VTI', 100_00)]);
    const setInterval = vi.fn(() => 1);
    const source = new PollingPriceSource(provider, REQUESTS, {
      intervalMs: 1000,
      now: () => NOW,
      timers: { setInterval, clearInterval: () => {} },
    });
    source.start();
    source.start();
    expect(setInterval).toHaveBeenCalledTimes(1);
  });
});

describe('SimulatedMarketDataProvider', () => {
  const seeds = [
    {
      symbol: 'VTI',
      assetKind: 'equity' as const,
      basePriceCents: 100_00,
      currency: 'USD',
      volatilityBps: 50,
    },
  ];

  it('is deterministic for a given seed', async () => {
    const a = new SimulatedMarketDataProvider(seeds, { seed: 42, now: () => NOW });
    const b = new SimulatedMarketDataProvider(seeds, { seed: 42, now: () => NOW });
    const qa = await a.getSnapshots(REQUESTS);
    const qb = await b.getSnapshots(REQUESTS);
    expect(qa[0].priceCents).toBe(qb[0].priceCents);
  });

  it('keeps simulated prices within the volatility band of the seed', async () => {
    const provider = new SimulatedMarketDataProvider(seeds, { seed: 7, now: () => NOW });
    for (let i = 0; i < 50; i += 1) {
      const [quote] = await provider.getSnapshots(REQUESTS);
      // 50 bps = 0.5% max move from base.
      expect(quote.priceCents).toBeGreaterThanOrEqual(Math.floor(100_00 * 0.995) - 1);
      expect(quote.priceCents).toBeLessThanOrEqual(Math.ceil(100_00 * 1.005) + 1);
      expect(quote.asOf).toBe(NOW);
    }
  });

  it('ignores symbols without a seed', async () => {
    const provider = new SimulatedMarketDataProvider(seeds, { seed: 1, now: () => NOW });
    const quotes = await provider.getSnapshots([{ symbol: 'UNKNOWN', assetKind: 'equity' }]);
    expect(quotes).toHaveLength(0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
