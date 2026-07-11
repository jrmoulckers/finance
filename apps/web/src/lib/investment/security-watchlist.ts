// SPDX-License-Identifier: BUSL-1.1

/**
 * Security/ticker watchlist engine with price-move alerts (issue #3260).
 *
 * A security watchlist entry tracks a ticker against a *reference price* (the
 * price when it was added or last reset). Whenever the latest observed price
 * moves away from that reference by at least the entry's alert threshold, a
 * price-move alert is emitted so the user can react to a notable swing.
 *
 * All monetary values are integer cents; percentage moves are rounded to two
 * decimals. The engine is pure — persistence and price fetching live in the
 * hook layer — so the math is deterministic and easy to unit test.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A user-defined ticker to watch for notable price moves. */
export interface SecurityWatch {
  /** Unique identifier (UUID). */
  readonly id: string;
  /** Ticker symbol, normalized to upper case (e.g. "AAPL"). */
  readonly symbol: string;
  /** Optional descriptive name. */
  readonly name: string;
  /** Reference price per share in cents (the baseline a move is measured from). */
  readonly referencePriceCents: number;
  /** Absolute percentage move that triggers an alert (e.g. 5 = ±5%). */
  readonly alertThresholdPercent: number;
  /** Whether price-move alerts are enabled for this entry. */
  readonly alertsEnabled: boolean;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** Persisted display order. */
  readonly sortOrder?: number;
}

/** Direction of a price move relative to the reference price. */
export type PriceMoveDirection = 'up' | 'down' | 'flat';

/** Severity of a price-move alert. */
export type SecurityAlertLevel = 'info' | 'warning' | 'critical';

/** A computed price-move alert for a watched security. */
export interface SecurityAlert {
  /** The watchlist entry that triggered this alert. */
  readonly watch: SecurityWatch;
  /** Latest observed price per share in cents. */
  readonly currentPriceCents: number;
  /** Signed percentage move from the reference price (2-dp). */
  readonly movePercent: number;
  /** Direction of the move. */
  readonly direction: PriceMoveDirection;
  /** Alert severity. */
  readonly level: SecurityAlertLevel;
  /** Human-readable message. */
  readonly message: string;
}

/** Input for creating a new security watch. */
export interface CreateSecurityWatchInput {
  readonly symbol: string;
  readonly name?: string;
  readonly referencePriceCents: number;
  readonly alertThresholdPercent: number;
  readonly alertsEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

/** Normalize a ticker symbol to a trimmed upper-case string. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Signed percentage move of `currentPriceCents` from `referencePriceCents`,
 * rounded to two decimal places. Returns 0 when the reference is non-positive
 * (a move percentage is undefined without a positive baseline).
 */
export function computePriceMovePercent(
  referencePriceCents: number,
  currentPriceCents: number,
): number {
  if (referencePriceCents <= 0) return 0;
  const raw = ((currentPriceCents - referencePriceCents) / referencePriceCents) * 100;
  return Math.round(raw * 100) / 100;
}

function moveDirection(movePercent: number): PriceMoveDirection {
  if (movePercent > 0) return 'up';
  if (movePercent < 0) return 'down';
  return 'flat';
}

/**
 * Severity for a move: `critical` once the move is at least double the
 * threshold, `warning` once it meets the threshold, otherwise `info`.
 */
function alertLevel(absMove: number, threshold: number): SecurityAlertLevel {
  if (threshold > 0 && absMove >= threshold * 2) return 'critical';
  if (absMove >= threshold) return 'warning';
  return 'info';
}

function formatSignedPercent(movePercent: number): string {
  const sign = movePercent > 0 ? '+' : '';
  return `${sign}${movePercent.toFixed(2)}%`;
}

/**
 * Compute the price-move alert for a single watch given the latest price, or
 * `null` when no alert should fire (alerts disabled, no positive reference, or
 * the move has not reached the threshold).
 */
export function computeSecurityAlert(
  watch: SecurityWatch,
  currentPriceCents: number,
): SecurityAlert | null {
  if (!watch.alertsEnabled) return null;
  if (watch.referencePriceCents <= 0) return null;

  const movePercent = computePriceMovePercent(watch.referencePriceCents, currentPriceCents);
  const absMove = Math.abs(movePercent);
  if (absMove < watch.alertThresholdPercent || watch.alertThresholdPercent <= 0) {
    return null;
  }

  const direction = moveDirection(movePercent);
  const label = watch.name ? `${watch.symbol} (${watch.name})` : watch.symbol;
  const message = `${label} is ${direction === 'down' ? 'down' : 'up'} ${formatSignedPercent(
    movePercent,
  )} from your reference price.`;

  return {
    watch,
    currentPriceCents,
    movePercent,
    direction,
    level: alertLevel(absMove, watch.alertThresholdPercent),
    message,
  };
}

/**
 * Compute all firing price-move alerts for `watches` given a symbol→price map
 * (prices in cents), sorted by the largest absolute move first. Symbols with no
 * known price are skipped.
 */
export function computeSecurityAlerts(
  watches: readonly SecurityWatch[],
  priceBySymbolCents: ReadonlyMap<string, number>,
): SecurityAlert[] {
  const alerts: SecurityAlert[] = [];
  for (const watch of watches) {
    const price = priceBySymbolCents.get(normalizeSymbol(watch.symbol));
    if (price === undefined) continue;
    const alert = computeSecurityAlert(watch, price);
    if (alert) alerts.push(alert);
  }
  return alerts.sort((a, b) => Math.abs(b.movePercent) - Math.abs(a.movePercent));
}
