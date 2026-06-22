// SPDX-License-Identifier: BUSL-1.1

/**
 * Gig-platform earnings engine.
 *
 * Pure functions that:
 *   1. map income transactions to a gig platform (Uber, DoorDash, Instacart,
 *      Lyft, Grubhub, ...) via user-defined keyword rules with built-in
 *      defaults,
 *   2. aggregate earnings by platform for today / this week / this month plus
 *      a combined (cross-platform) total, and
 *   3. reconcile an expected payout against the deposits actually received.
 *
 * All monetary values are integer cents. No floating-point money: divisions
 * (percentages) use banker's rounding (round-half-to-even) to stay
 * deterministic and unbiased.
 *
 * References: issue #2133
 */

import type { Transaction } from '../../kmp/bridge';
import {
  OTHER_PLATFORM_LABEL,
  type ExpectedPayout,
  type GigMatchField,
  type GigPeriodAmounts,
  type GigPeriodKey,
  type GigPlatformRule,
  type PlatformEarnings,
  type PlatformEarningsOptions,
  type PlatformEarningsResult,
  type PlatformReconciliation,
  type ReconciliationOptions,
  type ReconciliationStatus,
} from './platform-types';

// ---------------------------------------------------------------------------
// Built-in defaults
// ---------------------------------------------------------------------------

/**
 * Sensible built-in mapping rules. These match against ANY text field
 * (payee, note, statement description, counterparty, account name) so that
 * payouts are recognised regardless of how the deposit was recorded.
 */
export const DEFAULT_GIG_PLATFORM_RULES: readonly GigPlatformRule[] = [
  {
    id: 'builtin-uber',
    platform: 'Uber',
    matchField: 'any',
    keywords: ['uber'],
    enabled: true,
    isBuiltIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-doordash',
    platform: 'DoorDash',
    matchField: 'any',
    keywords: ['doordash', 'door dash', 'dasher'],
    enabled: true,
    isBuiltIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-instacart',
    platform: 'Instacart',
    matchField: 'any',
    keywords: ['instacart', 'maplebear'],
    enabled: true,
    isBuiltIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-lyft',
    platform: 'Lyft',
    matchField: 'any',
    keywords: ['lyft'],
    enabled: true,
    isBuiltIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-grubhub',
    platform: 'Grubhub',
    matchField: 'any',
    keywords: ['grubhub', 'grub hub'],
    enabled: true,
    isBuiltIn: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Rounding (banker's / round-half-to-even)
// ---------------------------------------------------------------------------

/**
 * Round a value to the nearest integer using banker's rounding (round half to
 * even). Exact halves resolve toward the nearest even integer, which removes
 * the upward bias of {@link Math.round}.
 *
 * @example bankersRound(2.5) === 2; bankersRound(3.5) === 4; bankersRound(2.4) === 2
 */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  // Exactly .5 — round to the nearest even integer.
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

/** Build the lower-cased text a rule's keywords are matched against. */
function matchTextFor(
  tx: Transaction,
  field: GigMatchField,
  accountNames: ReadonlyMap<string, string>,
): string {
  const accountName = accountNames.get(tx.accountId) ?? '';
  let parts: (string | null)[];
  switch (field) {
    case 'payee':
      parts = [tx.payee, tx.counterpartyName];
      break;
    case 'description':
      parts = [tx.note, tx.statementDescription];
      break;
    case 'account':
      parts = [accountName];
      break;
    case 'any':
    default:
      parts = [tx.payee, tx.counterpartyName, tx.note, tx.statementDescription, accountName];
      break;
  }
  return parts
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * Resolve the platform a transaction maps to.
 *
 * Rules are evaluated in array order; the FIRST enabled rule with a keyword
 * contained in the transaction's text wins (so user rules placed ahead of the
 * built-ins take precedence). Returns `null` when nothing matches.
 */
export function matchTransactionPlatform(
  tx: Transaction,
  rules: readonly GigPlatformRule[],
  accountNames: ReadonlyMap<string, string> = new Map(),
): string | null {
  for (const rule of rules) {
    if (!rule.enabled || rule.keywords.length === 0) continue;
    const text = matchTextFor(tx, rule.matchField, accountNames);
    if (!text) continue;
    const hit = rule.keywords.some((keyword) => {
      const needle = keyword.trim().toLowerCase();
      return needle.length > 0 && text.includes(needle);
    });
    if (hit) return rule.platform;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Period bucketing
// ---------------------------------------------------------------------------

interface PeriodBounds {
  readonly todayStart: number;
  readonly weekStart: number;
  readonly weekEnd: number;
  readonly monthStart: number;
  readonly monthEnd: number;
}

/** Local midnight timestamp for the given Y/M/D (month is 0-based). */
function midnight(year: number, month: number, day: number): number {
  return new Date(year, month, day).getTime();
}

/** Parse an ISO local date ("YYYY-MM-DD") to a local-midnight timestamp. */
function parseLocalDateMidnight(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return midnight(year, month, day);
}

/** Compute today/week/month boundaries from a reference date. */
export function computePeriodBounds(
  referenceDate: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
): PeriodBounds {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const d = referenceDate.getDate();

  const todayStart = midnight(y, m, d);

  const dow = new Date(y, m, d).getDay(); // 0=Sun … 6=Sat
  const back = (dow - weekStartsOn + 7) % 7;
  const weekStartDate = new Date(y, m, d - back);
  const weekStart = weekStartDate.getTime();
  const weekEndDate = new Date(
    weekStartDate.getFullYear(),
    weekStartDate.getMonth(),
    weekStartDate.getDate() + 6,
  );
  const weekEnd = weekEndDate.getTime();

  const monthStart = midnight(y, m, 1);
  const monthEnd = midnight(y, m + 1, 0); // day 0 of next month = last day this month

  return { todayStart, weekStart, weekEnd, monthStart, monthEnd };
}

/** Determine which of today/week/month a transaction date falls into. */
function periodFlags(
  ts: number,
  bounds: PeriodBounds,
): { today: boolean; week: boolean; month: boolean } {
  return {
    today: ts === bounds.todayStart,
    week: ts >= bounds.weekStart && ts <= bounds.weekEnd,
    month: ts >= bounds.monthStart && ts <= bounds.monthEnd,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const ZERO_AMOUNTS: GigPeriodAmounts = { today: 0, week: 0, month: 0 };

interface MutableAmounts {
  today: number;
  week: number;
  month: number;
}

/**
 * Aggregate income transactions into per-platform earnings for today / this
 * week / this month, plus combined cross-platform totals.
 *
 * Only `INCOME` transactions are considered (gig payouts are deposits).
 * Transactions that match no rule are grouped under "Other".
 */
export function computePlatformEarnings(
  transactions: readonly Transaction[],
  rules: readonly GigPlatformRule[],
  options: PlatformEarningsOptions = {},
): PlatformEarningsResult {
  const bounds = computePeriodBounds(options.referenceDate, options.weekStartsOn ?? 1);
  const accountNames = options.accountNames ?? new Map<string, string>();

  const amountsByPlatform = new Map<string, MutableAmounts>();
  const countsByPlatform = new Map<string, MutableAmounts>();
  const combined: MutableAmounts = { today: 0, week: 0, month: 0 };
  const combinedCounts: MutableAmounts = { today: 0, week: 0, month: 0 };

  for (const tx of transactions) {
    if (tx.type !== 'INCOME') continue;
    const ts = parseLocalDateMidnight(tx.date);
    if (ts === null) continue;
    const flags = periodFlags(ts, bounds);
    if (!flags.today && !flags.week && !flags.month) continue;

    const platform = matchTransactionPlatform(tx, rules, accountNames) ?? OTHER_PLATFORM_LABEL;
    const amount = tx.amount.amount;

    const amounts = amountsByPlatform.get(platform) ?? { today: 0, week: 0, month: 0 };
    const counts = countsByPlatform.get(platform) ?? { today: 0, week: 0, month: 0 };

    if (flags.today) {
      amounts.today += amount;
      counts.today += 1;
      combined.today += amount;
      combinedCounts.today += 1;
    }
    if (flags.week) {
      amounts.week += amount;
      counts.week += 1;
      combined.week += amount;
      combinedCounts.week += 1;
    }
    if (flags.month) {
      amounts.month += amount;
      counts.month += 1;
      combined.month += amount;
      combinedCounts.month += 1;
    }

    amountsByPlatform.set(platform, amounts);
    countsByPlatform.set(platform, counts);
  }

  const platforms: PlatformEarnings[] = [];
  for (const [platform, amounts] of amountsByPlatform.entries()) {
    platforms.push({
      platform,
      amounts: { today: amounts.today, week: amounts.week, month: amounts.month },
      counts: countsByPlatform.get(platform) ?? ZERO_AMOUNTS,
    });
  }

  platforms.sort((a, b) => {
    // "Other" always sorts last for readability.
    if (a.platform === OTHER_PLATFORM_LABEL && b.platform !== OTHER_PLATFORM_LABEL) return 1;
    if (b.platform === OTHER_PLATFORM_LABEL && a.platform !== OTHER_PLATFORM_LABEL) return -1;
    if (b.amounts.month !== a.amounts.month) return b.amounts.month - a.amounts.month;
    if (b.amounts.week !== a.amounts.week) return b.amounts.week - a.amounts.week;
    if (b.amounts.today !== a.amounts.today) return b.amounts.today - a.amounts.today;
    return a.platform.localeCompare(b.platform);
  });

  return {
    platforms,
    combined: { today: combined.today, week: combined.week, month: combined.month },
    combinedCounts: {
      today: combinedCounts.today,
      week: combinedCounts.week,
      month: combinedCounts.month,
    },
  };
}

/**
 * Percentage (0–100, banker's-rounded) a platform contributes to the combined
 * earnings for a given period. Returns 0 when the period total is zero.
 */
export function platformPercent(
  platform: PlatformEarnings,
  result: PlatformEarningsResult,
  period: GigPeriodKey,
): number {
  const total = result.combined[period];
  if (total <= 0) return 0;
  return bankersRound((platform.amounts[period] / total) * 100);
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

function reconciliationStatus(
  receivedCents: number,
  expectedCents: number,
  toleranceCents: number,
): ReconciliationStatus {
  if (receivedCents === 0 && expectedCents > 0) return 'pending';
  const variance = receivedCents - expectedCents;
  if (variance > toleranceCents) return 'over';
  if (variance < -toleranceCents) return 'under';
  return 'matched';
}

/**
 * Reconcile expected payouts against the deposits actually received.
 *
 * The received amount is taken from the platform's earnings for the chosen
 * period (default: this month). A platform with neither an expected payout nor
 * any received amount is omitted.
 */
export function reconcilePlatformPayouts(
  expected: readonly ExpectedPayout[],
  result: PlatformEarningsResult,
  options: ReconciliationOptions = {},
): PlatformReconciliation[] {
  const period = options.period ?? 'month';
  const tolerance = Math.max(0, options.toleranceCents ?? 0);

  const receivedByPlatform = new Map<string, number>();
  for (const p of result.platforms) {
    receivedByPlatform.set(p.platform, p.amounts[period]);
  }

  const seen = new Set<string>();
  const rows: PlatformReconciliation[] = [];

  for (const entry of expected) {
    seen.add(entry.platform);
    const receivedCents = receivedByPlatform.get(entry.platform) ?? 0;
    const expectedCents = entry.expectedCents;
    if (expectedCents === 0 && receivedCents === 0) continue;
    rows.push({
      platform: entry.platform,
      expectedCents,
      receivedCents,
      varianceCents: receivedCents - expectedCents,
      status: reconciliationStatus(receivedCents, expectedCents, tolerance),
    });
  }

  // Include platforms with received deposits but no expected payout entry.
  for (const p of result.platforms) {
    if (seen.has(p.platform)) continue;
    const receivedCents = p.amounts[period];
    if (receivedCents === 0) continue;
    rows.push({
      platform: p.platform,
      expectedCents: 0,
      receivedCents,
      varianceCents: receivedCents,
      status: reconciliationStatus(receivedCents, 0, tolerance),
    });
  }

  return rows;
}
