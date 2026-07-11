// SPDX-License-Identifier: BUSL-1.1

/**
 * Cross-account holdings roll-up (issue #3262).
 *
 * A single security (ticker) can be held across several brokerage accounts.
 * This module rolls those per-account positions up into one consolidated line
 * per symbol so the user sees their true total exposure, while still being able
 * to attribute each position to the account/brokerage that holds it.
 *
 * All monetary values are integer cents; share counts are decimals. The module
 * is pure so the aggregation math is deterministic and unit-testable.
 */

/** Minimal per-account holding position consumed by the roll-up. */
export interface HoldingPosition {
  /** Investment identifier. */
  readonly id: string;
  /** Ticker symbol (roll-up groups case-insensitively on this). */
  readonly symbol: string;
  /** Descriptive name. */
  readonly name: string;
  /** Number of shares held in this position. */
  readonly shares: number;
  /** Current price per share in cents. */
  readonly currentPricePerShareCents: number;
  /** Cost basis per share in cents. */
  readonly costBasisPerShareCents: number;
  /** ISO currency code (e.g. "USD"). Positions in different currencies are not merged. */
  readonly currencyCode: string;
  /** Owning account/brokerage identifier, or `null` when unassigned. */
  readonly accountId: string | null;
}

/** A consolidated holding rolled up across accounts for one symbol + currency. */
export interface RolledUpHolding {
  /** Normalized (upper-case) ticker symbol. */
  readonly symbol: string;
  /** Descriptive name (from the largest contributing position). */
  readonly name: string;
  /** ISO currency code shared by every contributing position. */
  readonly currencyCode: string;
  /** Total shares across all accounts. */
  readonly totalShares: number;
  /** Total market value in cents. */
  readonly marketValueCents: number;
  /** Total cost basis in cents. */
  readonly costBasisCents: number;
  /** Unrealized gain/loss in cents (market value − cost basis). */
  readonly gainLossCents: number;
  /** Unrealized gain/loss as a percentage of cost basis (2-dp). */
  readonly gainLossPercent: number;
  /** Number of distinct accounts holding this symbol. */
  readonly accountCount: number;
  /** Number of source positions rolled into this line. */
  readonly positionCount: number;
  /** Distinct owning account identifiers (`null` becomes the sentinel below). */
  readonly accountIds: readonly string[];
}

/** Sentinel used to group positions with no owning account. */
export const UNASSIGNED_ACCOUNT_ID = '__unassigned__';

/** Market value of a single position in cents (rounded). */
export function computePositionMarketValueCents(position: HoldingPosition): number {
  return Math.round(position.shares * position.currentPricePerShareCents);
}

/** Cost basis of a single position in cents (rounded). */
export function computePositionCostBasisCents(position: HoldingPosition): number {
  return Math.round(position.shares * position.costBasisPerShareCents);
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function gainLossPercent(gainLossCents: number, costBasisCents: number): number {
  if (costBasisCents <= 0) return 0;
  return Math.round((gainLossCents / costBasisCents) * 10000) / 100;
}

interface RollupAccumulator {
  symbol: string;
  name: string;
  currencyCode: string;
  totalShares: number;
  marketValueCents: number;
  costBasisCents: number;
  positionCount: number;
  /** Shares of the largest contributing position — used to pick the display name. */
  dominantShares: number;
  accountIds: Set<string>;
}

/**
 * Roll up per-account positions into one consolidated line per symbol +
 * currency. Positions in different currencies for the same ticker are kept
 * separate (their cents are not comparable). Results are sorted by market value
 * descending so the largest exposures surface first.
 */
export function rollUpHoldingsBySymbol(positions: readonly HoldingPosition[]): RolledUpHolding[] {
  const groups = new Map<string, RollupAccumulator>();

  for (const position of positions) {
    const symbol = normalizeSymbol(position.symbol);
    const key = `${symbol}|${position.currencyCode}`;
    const marketValue = computePositionMarketValueCents(position);
    const costBasis = computePositionCostBasisCents(position);
    const accountKey = position.accountId ?? UNASSIGNED_ACCOUNT_ID;

    const existing = groups.get(key);
    if (existing) {
      existing.totalShares += position.shares;
      existing.marketValueCents += marketValue;
      existing.costBasisCents += costBasis;
      existing.positionCount += 1;
      existing.accountIds.add(accountKey);
      if (position.shares > existing.dominantShares) {
        existing.dominantShares = position.shares;
        existing.name = position.name;
      }
    } else {
      groups.set(key, {
        symbol,
        name: position.name,
        currencyCode: position.currencyCode,
        totalShares: position.shares,
        marketValueCents: marketValue,
        costBasisCents: costBasis,
        positionCount: 1,
        dominantShares: position.shares,
        accountIds: new Set([accountKey]),
      });
    }
  }

  return [...groups.values()]
    .map((group): RolledUpHolding => {
      const gainLossCents = group.marketValueCents - group.costBasisCents;
      return {
        symbol: group.symbol,
        name: group.name,
        currencyCode: group.currencyCode,
        totalShares: group.totalShares,
        marketValueCents: group.marketValueCents,
        costBasisCents: group.costBasisCents,
        gainLossCents,
        gainLossPercent: gainLossPercent(gainLossCents, group.costBasisCents),
        accountCount: group.accountIds.size,
        positionCount: group.positionCount,
        accountIds: [...group.accountIds],
      };
    })
    .sort((a, b) => b.marketValueCents - a.marketValueCents);
}
