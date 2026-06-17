// SPDX-License-Identifier: BUSL-1.1

/** Market-data snapshot abstraction with deterministic stale-state semantics. References: issue #2637 */
export type AssetKind = 'equity' | 'option' | 'crypto' | 'cash' | 'other';
export type MarketSessionStatus = 'open' | 'closed' | 'pre-market' | 'after-hours' | '24x7' | 'unknown';
export type QuoteFreshness = 'fresh' | 'delayed' | 'stale' | 'missing' | 'failed';

export interface QuoteSnapshot {
  readonly symbol: string;
  readonly assetKind: AssetKind;
  readonly priceCents: number;
  readonly currency: string;
  readonly asOf: string;
  readonly source: string;
  readonly latencyMs?: number;
  readonly marketSession: MarketSessionStatus;
  readonly error?: string;
}

export interface QuoteRequest {
  readonly symbol: string;
  readonly assetKind: AssetKind;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly source: string;
  getSnapshots(requests: readonly QuoteRequest[], now?: string): Promise<readonly QuoteSnapshot[]>;
}

export interface FreshnessPolicy {
  readonly openMarketFreshMs: number;
  readonly openMarketDelayedMs: number;
  readonly optionFreshMs: number;
  readonly cryptoFreshMs: number;
  readonly closedMarketGraceMs: number;
}

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  openMarketFreshMs: 60_000,
  openMarketDelayedMs: 15 * 60_000,
  optionFreshMs: 30_000,
  cryptoFreshMs: 2 * 60_000,
  closedMarketGraceMs: 24 * 60 * 60_000,
};

export interface EvaluatedQuote extends QuoteSnapshot {
  readonly freshness: QuoteFreshness;
  readonly ageMs: number;
  readonly staleReason?: string;
}

function ageMs(asOf: string, now: string): number {
  return Math.max(0, new Date(now).getTime() - new Date(asOf).getTime());
}

function thresholdFor(snapshot: QuoteSnapshot, policy: FreshnessPolicy): { freshMs: number; delayedMs: number } {
  if (snapshot.marketSession === 'closed') return { freshMs: 0, delayedMs: policy.closedMarketGraceMs };
  if (snapshot.assetKind === 'crypto' || snapshot.marketSession === '24x7') return { freshMs: policy.cryptoFreshMs, delayedMs: policy.cryptoFreshMs * 2 };
  if (snapshot.assetKind === 'option') return { freshMs: policy.optionFreshMs, delayedMs: policy.openMarketDelayedMs };
  return { freshMs: policy.openMarketFreshMs, delayedMs: policy.openMarketDelayedMs };
}

export function evaluateQuoteFreshness(
  snapshot: QuoteSnapshot | undefined,
  now: string,
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): EvaluatedQuote | { readonly freshness: 'missing'; readonly ageMs: 0; readonly staleReason: string } {
  if (!snapshot) return { freshness: 'missing', ageMs: 0, staleReason: 'No quote snapshot is available.' };
  if (snapshot.error) return { ...snapshot, freshness: 'failed', ageMs: ageMs(snapshot.asOf, now), staleReason: snapshot.error };
  const age = ageMs(snapshot.asOf, now);
  const thresholds = thresholdFor(snapshot, policy);
  if (age <= thresholds.freshMs) return { ...snapshot, freshness: 'fresh', ageMs: age };
  if (age <= thresholds.delayedMs) return { ...snapshot, freshness: 'delayed', ageMs: age, staleReason: 'Quote is delayed but still usable.' };
  return { ...snapshot, freshness: 'stale', ageMs: age, staleReason: 'Quote exceeds freshness policy.' };
}

export class ManualMarketDataProvider implements MarketDataProvider {
  readonly id = 'manual-market-data';
  readonly source = 'manual';
  private readonly snapshots: ReadonlyMap<string, QuoteSnapshot>;

  constructor(snapshots: readonly QuoteSnapshot[]) {
    this.snapshots = new Map(snapshots.map((snapshot) => [snapshot.symbol.toUpperCase(), snapshot]));
  }

  async getSnapshots(requests: readonly QuoteRequest[]): Promise<readonly QuoteSnapshot[]> {
    return requests.flatMap((request) => {
      const snapshot = this.snapshots.get(request.symbol.toUpperCase());
      return snapshot ? [snapshot] : [];
    });
  }
}
