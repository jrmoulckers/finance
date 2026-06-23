// SPDX-License-Identifier: BUSL-1.1

/**
 * Pluggable live price-update source abstraction.
 *
 * A {@link PriceSource} delivers near-real-time quote snapshots to one or more
 * listeners. It is deliberately decoupled from any specific market-data vendor:
 * callers wire concrete providers (polling, websocket, manual/mock, simulated)
 * behind the same interface so the live P&L dashboard never depends on a single
 * upstream or hard-coded API key.
 *
 * Adapters in this module:
 * - {@link PollingPriceSource} — polls any {@link MarketDataProvider} on a fixed
 *   interval (timers are injectable for deterministic tests).
 * - {@link ManualPriceSource} — test/demo source whose updates are pushed
 *   imperatively via {@link ManualPriceSource.emit}.
 * - {@link SimulatedMarketDataProvider} — offline provider that jitters seeded
 *   prices so the dashboard can demonstrate live movement without a network
 *   call or secret. **No external API keys are ever read here.**
 *
 * References: issue #2124
 */

import type { AssetKind, MarketDataProvider, QuoteRequest, QuoteSnapshot } from './market-data';

// ---------------------------------------------------------------------------
// Core interface
// ---------------------------------------------------------------------------

/** A batch of quotes delivered by a {@link PriceSource}. */
export interface PriceUpdate {
  /** Quotes contained in this update (may be empty on a failed poll). */
  readonly quotes: readonly QuoteSnapshot[];
  /** ISO-8601 timestamp the update was received by the client. */
  readonly receivedAt: string;
  /** Identifier of the originating source/provider. */
  readonly source: string;
  /** Set when the underlying fetch failed; `quotes` will usually be empty. */
  readonly error?: string;
}

/** Listener invoked for every {@link PriceUpdate}. */
export type PriceListener = (update: PriceUpdate) => void;

/**
 * A source of live price updates.
 *
 * Implementations must be safe to {@link start}/{@link stop} repeatedly and to
 * notify zero or more subscribers. `start` is idempotent.
 */
export interface PriceSource {
  /** Stable identifier for diagnostics. */
  readonly id: string;
  /** Whether the source is currently emitting updates. */
  readonly running: boolean;
  /**
   * Register a listener.
   * @returns An unsubscribe function that removes the listener.
   */
  subscribe(listener: PriceListener): () => void;
  /** Begin emitting updates (idempotent). */
  start(): void;
  /** Stop emitting updates and release any timers/connections. */
  stop(): void;
  /** Force an immediate refresh outside the normal cadence. */
  refreshNow(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Timer injection (deterministic tests)
// ---------------------------------------------------------------------------

/** Minimal timer surface so polling can be driven by fake timers in tests. */
export interface TimerApi {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const DEFAULT_TIMERS: TimerApi = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

// ---------------------------------------------------------------------------
// Polling adapter
// ---------------------------------------------------------------------------

/** Options for {@link PollingPriceSource}. */
export interface PollingPriceSourceOptions {
  /** Poll cadence in milliseconds (default: 15s). */
  readonly intervalMs?: number;
  /** Clock used for `receivedAt` timestamps (default: `Date.now`). */
  readonly now?: () => string;
  /** Injectable timer API (default: global timers). */
  readonly timers?: TimerApi;
  /** Override the source id. */
  readonly id?: string;
}

/**
 * Polls a {@link MarketDataProvider} on a fixed interval and fans the results
 * out to subscribers. Network/provider errors are surfaced as a
 * {@link PriceUpdate} with an `error` rather than thrown, so the UI can degrade
 * gracefully and show a stale-data indicator.
 */
export class PollingPriceSource implements PriceSource {
  readonly id: string;
  private readonly provider: MarketDataProvider;
  private readonly requests: readonly QuoteRequest[];
  private readonly intervalMs: number;
  private readonly now: () => string;
  private readonly timers: TimerApi;
  private readonly listeners = new Set<PriceListener>();
  private handle: unknown = null;
  private active = false;

  constructor(
    provider: MarketDataProvider,
    requests: readonly QuoteRequest[],
    options: PollingPriceSourceOptions = {},
  ) {
    this.provider = provider;
    this.requests = requests;
    this.intervalMs = Math.max(250, options.intervalMs ?? 15_000);
    this.now = options.now ?? (() => new Date().toISOString());
    this.timers = options.timers ?? DEFAULT_TIMERS;
    this.id = options.id ?? `polling:${provider.id}`;
  }

  get running(): boolean {
    return this.active;
  }

  subscribe(listener: PriceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    // Emit an immediate snapshot so the UI is not blank for a full interval.
    void this.poll();
    this.handle = this.timers.setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.handle !== null) {
      this.timers.clearInterval(this.handle);
      this.handle = null;
    }
  }

  async refreshNow(): Promise<void> {
    await this.poll();
  }

  private async poll(): Promise<void> {
    const receivedAt = this.now();
    try {
      const quotes = await this.provider.getSnapshots(this.requests, receivedAt);
      this.emit({ quotes, receivedAt, source: this.provider.source });
    } catch (err) {
      this.emit({
        quotes: [],
        receivedAt,
        source: this.provider.source,
        error: err instanceof Error ? err.message : 'Price update failed.',
      });
    }
  }

  private emit(update: PriceUpdate): void {
    // Copy to tolerate unsubscribe during iteration.
    for (const listener of [...this.listeners]) listener(update);
  }
}

// ---------------------------------------------------------------------------
// Manual adapter (tests / demos)
// ---------------------------------------------------------------------------

/**
 * A source whose updates are pushed imperatively. Useful for component tests
 * and scripted demos where deterministic, on-demand price changes are needed.
 */
export class ManualPriceSource implements PriceSource {
  readonly id: string;
  private readonly listeners = new Set<PriceListener>();
  private readonly now: () => string;
  private active = false;

  constructor(options: { id?: string; now?: () => string } = {}) {
    this.id = options.id ?? 'manual-price-source';
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get running(): boolean {
    return this.active;
  }

  subscribe(listener: PriceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  async refreshNow(): Promise<void> {
    // No-op: updates are pushed via emit().
  }

  /** Push a price update to all subscribers. */
  emit(quotes: readonly QuoteSnapshot[], receivedAt: string = this.now(), error?: string): void {
    const update: PriceUpdate = { quotes, receivedAt, source: this.id, error };
    for (const listener of [...this.listeners]) listener(update);
  }
}

// ---------------------------------------------------------------------------
// Simulated provider (offline live-movement demo, no secrets)
// ---------------------------------------------------------------------------

/** Seed describing the baseline price for a simulated symbol. */
export interface SimulatedSeed {
  readonly symbol: string;
  readonly assetKind: AssetKind;
  readonly basePriceCents: number;
  readonly currency: string;
  /** Market session label applied to emitted snapshots (default: `'open'`). */
  readonly marketSession?: QuoteSnapshot['marketSession'];
  /** Per-tick volatility in basis points (default: 50 = 0.5%). */
  readonly volatilityBps?: number;
}

/** Options for {@link SimulatedMarketDataProvider}. */
export interface SimulatedProviderOptions {
  /** Deterministic RNG seed (default: derived from a fixed constant). */
  readonly seed?: number;
  /** Clock used for `asOf` timestamps (default: `Date.now`). */
  readonly now?: () => string;
}

/** Deterministic 32-bit PRNG (mulberry32) — self-contained, no dependencies. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An offline {@link MarketDataProvider} that jitters seeded prices using a
 * deterministic PRNG. Lets the live dashboard demonstrate intraday movement
 * with zero network access and **no API keys**. Real deployments swap this for
 * a vendor-backed provider behind the same interface.
 */
export class SimulatedMarketDataProvider implements MarketDataProvider {
  readonly id = 'simulated-market-data';
  readonly source = 'simulated';
  private readonly seeds: ReadonlyMap<string, SimulatedSeed>;
  private readonly rng: () => number;
  private readonly now: () => string;

  constructor(seeds: readonly SimulatedSeed[], options: SimulatedProviderOptions = {}) {
    this.seeds = new Map(seeds.map((seed) => [seed.symbol.toUpperCase(), seed]));
    this.rng = mulberry32(options.seed ?? 0x9e3779b9);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async getSnapshots(
    requests: readonly QuoteRequest[],
    now: string = this.now(),
  ): Promise<readonly QuoteSnapshot[]> {
    return requests.flatMap((request) => {
      const seed = this.seeds.get(request.symbol.toUpperCase());
      if (!seed) return [];
      const volatility = (seed.volatilityBps ?? 50) / 10_000;
      const drift = (this.rng() * 2 - 1) * volatility;
      const priceCents = Math.max(1, Math.round(seed.basePriceCents * (1 + drift)));
      const snapshot: QuoteSnapshot = {
        symbol: seed.symbol,
        assetKind: seed.assetKind,
        priceCents,
        currency: seed.currency,
        asOf: now,
        source: this.source,
        latencyMs: Math.round(this.rng() * 40),
        marketSession: seed.marketSession ?? 'open',
      };
      return [snapshot];
    });
  }
}
