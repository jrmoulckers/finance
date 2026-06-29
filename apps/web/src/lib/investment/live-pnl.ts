// SPDX-License-Identifier: BUSL-1.1

/**
 * Live cross-broker P&L + net-worth aggregation engine.
 *
 * Composes the intraday P&L engine ({@link computeIntradayPnl}) with the
 * non-market account balances that complete a trader's total net worth, then
 * derives the presentation-layer facts a live dashboard needs:
 *
 * - Total net worth = invested market value + base (cash/other) balances.
 * - Today's day P&L, unrealized P&L, realized P&L and a day-change percentage.
 * - A {@link StalenessSummary} describing how current the underlying quotes are
 *   (live / delayed / stale / attention) so volatile assets never make the
 *   net-worth view silently misleading.
 * - {@link PnlIndicator}s that encode direction with a glyph **and** text label
 *   (never colour alone) for WCAG 2.2 AA non-text-contrast compliance.
 *
 * This module is pure and deterministic given its inputs, which keeps the math
 * unit-testable independent of React or any price source.
 *
 * References: issue #2124
 */

import { computeIntradayPnl } from './intraday-pnl';
import type {
  CashMovement,
  IntradayPnlReport,
  IntradayPosition,
  RealizedPnlEvent,
} from './intraday-pnl';
import { DEFAULT_FRESHNESS_POLICY, evaluateQuoteFreshness } from './market-data';
import type { FreshnessPolicy, QuoteFreshness, QuoteSnapshot } from './market-data';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A non-market account balance that contributes to total net worth. */
export interface BaseAccountBalance {
  readonly accountId: string;
  readonly label: string;
  /** Cash-like vs. other (real estate, vehicles, etc.). */
  readonly assetClass: 'cash' | 'other';
  /** Signed balance in cents — negative values represent liabilities. */
  readonly balanceCents: number;
  readonly currency: string;
}

/** Input to {@link buildLivePnlView}. */
export interface LivePnlViewInput {
  readonly positions: readonly IntradayPosition[];
  readonly quotes: readonly QuoteSnapshot[];
  /** Non-market balances (cash, savings, property, liabilities). */
  readonly baseAccounts?: readonly BaseAccountBalance[];
  readonly realizedEvents?: readonly RealizedPnlEvent[];
  readonly cashMovements?: readonly CashMovement[];
  /** ISO-8601 evaluation time (drives staleness). */
  readonly now: string;
  /** Reporting currency; positions/quotes in other currencies are ignored. */
  readonly currency: string;
  /** ISO-8601 timestamp of the most recent price update, if any. */
  readonly lastUpdated?: string | null;
  /** Override the freshness policy used for staleness classification. */
  readonly freshnessPolicy?: FreshnessPolicy;
}

// ---------------------------------------------------------------------------
// Presentation primitives (non-colour-only cues)
// ---------------------------------------------------------------------------

/** Direction of a P&L figure. */
export type PnlDirection = 'gain' | 'loss' | 'flat';

/**
 * A redundant, accessible encoding of a P&L figure's direction.
 *
 * Combines a shape glyph (`arrow`), an explicit `sign`, and a text `label` so
 * gain/loss is conveyed by more than colour alone.
 */
export interface PnlIndicator {
  readonly direction: PnlDirection;
  /** `'+'`, `'−'` (U+2212 minus), or `''` when flat. */
  readonly sign: '+' | '−' | '';
  /** Distinct shape per direction: up / down / diamond (flat). */
  readonly arrow: '▲' | '▼' | '◆';
  /** Human-readable label: `'gain'`, `'loss'`, or `'flat'`. */
  readonly label: PnlDirection;
}

/** Overall freshness tone for the dashboard's status badge. */
export type StalenessTone = 'live' | 'delayed' | 'stale' | 'critical' | 'empty';

/** Aggregate description of how current the underlying quotes are. */
export interface StalenessSummary {
  readonly tone: StalenessTone;
  /** Most severe per-symbol freshness, or `'none'` when nothing was evaluated. */
  readonly worst: QuoteFreshness | 'none';
  /** Short status label, e.g. `'Live'`, `'Delayed'`, `'Stale'`. */
  readonly label: string;
  /** Longer human description suitable for a tooltip / SR text. */
  readonly description: string;
  readonly evaluatedCount: number;
  readonly freshCount: number;
  readonly delayedCount: number;
  readonly staleCount: number;
  readonly missingCount: number;
  readonly failedCount: number;
  readonly staleSymbols: readonly string[];
  readonly missingSymbols: readonly string[];
  readonly failedSymbols: readonly string[];
  /** Age in ms of the oldest evaluated quote (0 when none/all missing). */
  readonly oldestQuoteAgeMs: number;
}

/** Output of {@link buildLivePnlView}. */
export interface LivePnlView {
  readonly report: IntradayPnlReport;
  readonly currency: string;
  /** Net worth from non-market accounts (cash, property, liabilities). */
  readonly baseNetWorthCents: number;
  /** Current market value of all positions. */
  readonly investedValueCents: number;
  /** base + invested. */
  readonly totalNetWorthCents: number;
  /** Approx. start-of-day net worth (total − day P&L). */
  readonly previousNetWorthCents: number;
  readonly dayPnlCents: number;
  /** Day P&L as a percentage of previous net worth (0 when undefined). */
  readonly dayPnlPercent: number;
  readonly unrealizedPnlCents: number;
  readonly realizedPnlCents: number;
  readonly staleness: StalenessSummary;
  readonly lastUpdated: string | null;
  readonly indicators: {
    readonly day: PnlIndicator;
    readonly unrealized: PnlIndicator;
    readonly realized: PnlIndicator;
    readonly netWorth: PnlIndicator;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an accessible direction indicator from a signed cents figure. */
export function pnlIndicator(cents: number): PnlIndicator {
  if (cents > 0) return { direction: 'gain', sign: '+', arrow: '▲', label: 'gain' };
  if (cents < 0) return { direction: 'loss', sign: '−', arrow: '▼', label: 'loss' };
  return { direction: 'flat', sign: '', arrow: '◆', label: 'flat' };
}

const SEVERITY: Record<QuoteFreshness, number> = {
  fresh: 0,
  delayed: 1,
  stale: 2,
  missing: 3,
  failed: 4,
};

function toneFor(summary: {
  evaluatedCount: number;
  delayedCount: number;
  staleCount: number;
  missingCount: number;
  failedCount: number;
}): StalenessTone {
  if (summary.evaluatedCount === 0) return 'empty';
  if (summary.failedCount > 0 || summary.missingCount > 0) return 'critical';
  if (summary.staleCount > 0) return 'stale';
  if (summary.delayedCount > 0) return 'delayed';
  return 'live';
}

const TONE_LABEL: Record<StalenessTone, string> = {
  live: 'Live',
  delayed: 'Delayed',
  stale: 'Stale',
  critical: 'Attention needed',
  empty: 'No market data',
};

function describeStaleness(
  tone: StalenessTone,
  counts: { delayedCount: number; staleCount: number; missingCount: number; failedCount: number },
): string {
  switch (tone) {
    case 'live':
      return 'All quotes are current within the freshness policy.';
    case 'delayed':
      return `${counts.delayedCount} quote(s) are delayed but still usable.`;
    case 'stale':
      return `${counts.staleCount} quote(s) exceed the freshness policy. Values may be out of date.`;
    case 'critical':
      return `${counts.missingCount} missing and ${counts.failedCount} failed quote(s); some positions use the last known or previous-close price.`;
    case 'empty':
      return 'No positions with live quotes are being tracked.';
  }
}

/**
 * Format a quote/update age in milliseconds as a compact relative string,
 * e.g. `"just now"`, `"45s ago"`, `"3m ago"`, `"2h ago"`.
 */
export function formatRelativeAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function summarizeStaleness(input: LivePnlViewInput): StalenessSummary {
  const policy = input.freshnessPolicy ?? DEFAULT_FRESHNESS_POLICY;
  const quotesBySymbol = new Map(input.quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));

  // Evaluate each distinct, in-currency position symbol exactly once.
  const seen = new Set<string>();
  let freshCount = 0;
  let delayedCount = 0;
  let staleCount = 0;
  let missingCount = 0;
  let failedCount = 0;
  let oldestQuoteAgeMs = 0;
  let worstSeverity = -1;
  let worst: QuoteFreshness | 'none' = 'none';
  const staleSymbols: string[] = [];
  const missingSymbols: string[] = [];
  const failedSymbols: string[] = [];

  for (const position of input.positions) {
    if (position.currency !== input.currency) continue;
    if (position.assetClass === 'cash') continue;
    const symbol = position.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    const evaluated = evaluateQuoteFreshness(quotesBySymbol.get(symbol), input.now, policy);
    const freshness = evaluated.freshness;
    if (evaluated.ageMs > oldestQuoteAgeMs) oldestQuoteAgeMs = evaluated.ageMs;
    if (SEVERITY[freshness] > worstSeverity) {
      worstSeverity = SEVERITY[freshness];
      worst = freshness;
    }
    switch (freshness) {
      case 'fresh':
        freshCount += 1;
        break;
      case 'delayed':
        delayedCount += 1;
        break;
      case 'stale':
        staleCount += 1;
        staleSymbols.push(symbol);
        break;
      case 'missing':
        missingCount += 1;
        missingSymbols.push(symbol);
        break;
      case 'failed':
        failedCount += 1;
        failedSymbols.push(symbol);
        break;
    }
  }

  const evaluatedCount = seen.size;
  const counts = { delayedCount, staleCount, missingCount, failedCount };
  const tone = toneFor({ evaluatedCount, ...counts });

  return {
    tone,
    worst,
    label: TONE_LABEL[tone],
    description: describeStaleness(tone, counts),
    evaluatedCount,
    freshCount,
    delayedCount,
    staleCount,
    missingCount,
    failedCount,
    staleSymbols: staleSymbols.sort(),
    missingSymbols: missingSymbols.sort(),
    failedSymbols: failedSymbols.sort(),
    oldestQuoteAgeMs,
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Compute the complete live P&L + net-worth view model from positions, the
 * latest quotes, and non-market account balances.
 */
export function buildLivePnlView(input: LivePnlViewInput): LivePnlView {
  const report = computeIntradayPnl({
    positions: input.positions,
    quotes: input.quotes,
    realizedEvents: input.realizedEvents,
    cashMovements: input.cashMovements,
    now: input.now,
    currency: input.currency,
  });

  const baseNetWorthCents = (input.baseAccounts ?? [])
    .filter((account) => account.currency === input.currency)
    .reduce((sum, account) => sum + account.balanceCents, 0);

  const investedValueCents = report.totalMarketValueCents;
  const totalNetWorthCents = baseNetWorthCents + investedValueCents;
  const dayPnlCents = report.dayPnlCents;
  const previousNetWorthCents = totalNetWorthCents - dayPnlCents;
  const dayPnlPercent =
    previousNetWorthCents !== 0
      ? Math.round((dayPnlCents / Math.abs(previousNetWorthCents)) * 10000) / 100
      : 0;

  return {
    report,
    currency: input.currency,
    baseNetWorthCents,
    investedValueCents,
    totalNetWorthCents,
    previousNetWorthCents,
    dayPnlCents,
    dayPnlPercent,
    unrealizedPnlCents: report.unrealizedPnlCents,
    realizedPnlCents: report.realizedPnlCents,
    staleness: summarizeStaleness(input),
    lastUpdated: input.lastUpdated ?? null,
    indicators: {
      day: pnlIndicator(dayPnlCents),
      unrealized: pnlIndicator(report.unrealizedPnlCents),
      realized: pnlIndicator(report.realizedPnlCents),
      netWorth: pnlIndicator(dayPnlCents),
    },
  };
}
