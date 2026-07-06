// SPDX-License-Identifier: BUSL-1.1

/**
 * Small-business Profit & Loss (P&L) engine.
 *
 * Builds a weekly or monthly profit-and-loss statement from categorized
 * transactions for an owner-operator (e.g. a food-truck) who needs to know
 * whether the business is actually profitable after the cost of goods sold,
 * labor and other operating expenses.
 *
 * Each transaction is classified into one of four P&L buckets:
 *
 *   - `revenue`  — money the business takes in (sales).
 *   - `cogs`     — cost of goods sold (ingredients, supplies resold, ...).
 *   - `labor`    — wages / payroll / contractor pay.
 *   - `overhead` — other operating expenses (rent, fuel, insurance, ...).
 *
 * The classic statement is then derived:
 *
 *   gross profit       = revenue − COGS
 *   operating expenses = labor + overhead
 *   net profit         = gross profit − operating expenses
 *   gross margin %     = gross profit / revenue
 *   net margin %       = net profit / revenue
 *
 * ──────────────────────────────────────────────────────────────────────────
 * MONEY & MARGINS — every monetary value is an INTEGER number of cents and is
 * only summed/subtracted (never divided) so totals stay exact. Margins are
 * returned as INTEGER **basis points** (1% = 100 bps, computed as
 * `round(part * 10_000 / revenue)`) so the percentage carries no accumulated
 * floating-point error; UI formatting divides by 100 only at display time.
 * When revenue is zero the margin is `null` (N/A) rather than a divide-by-zero.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * This module is pure and deterministic: same input → same output, no clock,
 * no I/O. Splits are not expanded — a transaction's whole amount is allocated
 * to its single classified bucket.
 *
 * References: issue #2184.
 */

import type { LocalDate, Transaction } from '../../kmp/bridge';
import { escapeCsvField } from '../export/simple-export';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four buckets that make up a profit-and-loss statement. */
export type PnlCategory = 'revenue' | 'cogs' | 'labor' | 'overhead';

/** Reporting cadence for the statement. */
export type PnlGranularity = 'weekly' | 'monthly';

/**
 * Tag markers (case-insensitive, matched as whole tags) that force a
 * transaction into a specific P&L bucket regardless of its income/expense
 * type. Explicit tags always win over the type-based fallback.
 */
export interface PnlTagConfig {
  readonly revenueTags?: readonly string[];
  readonly cogsTags?: readonly string[];
  readonly laborTags?: readonly string[];
  readonly overheadTags?: readonly string[];
}

export interface PnlOptions extends PnlTagConfig {
  /** Reporting cadence. Default `'monthly'`. */
  readonly granularity?: PnlGranularity;
  /** Inclusive lower date bound (`YYYY-MM-DD`). */
  readonly startDate?: LocalDate;
  /** Inclusive upper date bound (`YYYY-MM-DD`). */
  readonly endDate?: LocalDate;
}

/** The aggregated money + margin figures for a slice of activity. */
export interface PnlTotals {
  /** Total sales (cents, ≥ 0). */
  readonly revenueCents: number;
  /** Cost of goods sold (cents, ≥ 0). */
  readonly cogsCents: number;
  /** Labor / payroll cost (cents, ≥ 0). */
  readonly laborCents: number;
  /** Other operating expenses (cents, ≥ 0). */
  readonly overheadCents: number;
  /** Gross profit: revenue − COGS (cents, may be negative). */
  readonly grossProfitCents: number;
  /** Operating expenses below the gross line: labor + overhead (cents, ≥ 0). */
  readonly operatingExpensesCents: number;
  /** Net profit: gross profit − operating expenses (cents, may be negative). */
  readonly netProfitCents: number;
  /** Gross margin in integer basis points; `null` when revenue is 0. */
  readonly grossMarginBps: number | null;
  /** Net margin in integer basis points; `null` when revenue is 0. */
  readonly netMarginBps: number | null;
  /** Count of transactions that contributed to this slice. */
  readonly transactionCount: number;
}

/** A single reporting period (one week or one month). */
export interface PnlPeriod extends PnlTotals {
  /** Sort/identity key — `YYYY-MM-DD` (week start) or `YYYY-MM` (month). */
  readonly key: string;
  /** Human-readable label, e.g. `"Week of 2024-01-15"` or `"Jan 2024"`. */
  readonly label: string;
}

/** The full statement: per-period rows plus combined totals. */
export interface PnlStatement {
  readonly granularity: PnlGranularity;
  /** Periods sorted ascending by key (chronological). */
  readonly periods: readonly PnlPeriod[];
  /** Combined totals across every included period. */
  readonly totals: PnlTotals;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default whole-tag markers for each P&L bucket. A transaction tagged with any
 * of these (case-insensitive) is forced into that bucket. Untagged income
 * falls back to `revenue` and untagged expenses to `overhead`.
 */
export const DEFAULT_PNL_TAGS: Readonly<Record<PnlCategory, readonly string[]>> = Object.freeze({
  revenue: Object.freeze(['pnl:revenue', 'revenue', 'sales']),
  cogs: Object.freeze(['pnl:cogs', 'cogs', 'cost-of-goods']),
  labor: Object.freeze(['pnl:labor', 'labor', 'payroll', 'wages']),
  overhead: Object.freeze(['pnl:overhead', 'overhead', 'opex', 'operating-expense']),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce to a finite, non-negative integer cent magnitude. */
function magnitudeCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.abs(Math.round(value));
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function normalizeTagList(
  tags: readonly string[] | undefined,
  fallback: readonly string[],
): Set<string> {
  const source = tags && tags.length > 0 ? tags : fallback;
  return new Set(source.map(normalizeTag).filter((tag) => tag !== ''));
}

function isInDateRange(
  transaction: Transaction,
  startDate?: LocalDate,
  endDate?: LocalDate,
): boolean {
  if (startDate !== undefined && transaction.date < startDate) {
    return false;
  }
  if (endDate !== undefined && transaction.date > endDate) {
    return false;
  }
  return true;
}

/**
 * Margin in integer basis points (1% = 100 bps), or `null` when revenue is not
 * positive. Uses integer cents in the ratio so no float dollars are involved;
 * only the final basis-point figure is rounded.
 */
export function marginBasisPoints(partCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) {
    return null;
  }
  return Math.round((partCents * 10_000) / revenueCents);
}

/**
 * Format a basis-point margin for display.
 *
 * @example
 * formatMarginPercent(2537);  // "25.4%"
 * formatMarginPercent(-1200); // "-12.0%"
 * formatMarginPercent(null);  // "N/A"
 */
export function formatMarginPercent(bps: number | null, fractionDigits = 1): string {
  if (bps === null || !Number.isFinite(bps)) {
    return 'N/A';
  }
  return `${(bps / 100).toFixed(fractionDigits)}%`;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Monday-based ISO week-start date key (`YYYY-MM-DD`) for a `YYYY-MM-DD` input.
 * Invalid dates are returned unchanged so they still bucket deterministically.
 */
export function weekStartKey(date: LocalDate): string {
  const dt = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    return date;
  }
  const day = dt.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + offsetToMonday);
  return dt.toISOString().slice(0, 10);
}

/** Bucket key for a transaction date under the chosen cadence. */
export function periodKey(date: LocalDate, granularity: PnlGranularity): string {
  if (granularity === 'weekly') {
    return weekStartKey(date);
  }
  return date.slice(0, 7); // YYYY-MM
}

/** Human-readable label for a bucket key. */
export function periodLabel(key: string, granularity: PnlGranularity): string {
  if (granularity === 'weekly') {
    return `Week of ${key}`;
  }
  const [year, month] = key.split('-');
  const monthIndex = Number(month) - 1;
  const monthName = MONTH_NAMES[monthIndex] ?? month;
  return `${monthName} ${year}`;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface CompiledPnlTagSets {
  readonly revenue: Set<string>;
  readonly cogs: Set<string>;
  readonly labor: Set<string>;
  readonly overhead: Set<string>;
}

/** Pre-compile the configured (or default) tag markers into lookup sets. */
export function compilePnlTagSets(config: PnlTagConfig = {}): CompiledPnlTagSets {
  return {
    revenue: normalizeTagList(config.revenueTags, DEFAULT_PNL_TAGS.revenue),
    cogs: normalizeTagList(config.cogsTags, DEFAULT_PNL_TAGS.cogs),
    labor: normalizeTagList(config.laborTags, DEFAULT_PNL_TAGS.labor),
    overhead: normalizeTagList(config.overheadTags, DEFAULT_PNL_TAGS.overhead),
  };
}

function hasTag(tags: readonly string[], markers: Set<string>): boolean {
  return tags.some((tag) => markers.has(normalizeTag(tag)));
}

/**
 * Classify a transaction into a P&L bucket, or `null` if it should be ignored
 * (transfers and voided transactions).
 *
 * Priority: explicit bucket tags win (checked COGS → labor → overhead →
 * revenue), otherwise income falls back to `revenue` and expenses to
 * `overhead` (other operating expense).
 */
export function classifyTransaction(
  transaction: Transaction,
  tagSets: CompiledPnlTagSets,
): PnlCategory | null {
  if (transaction.type === 'TRANSFER' || transaction.status === 'VOID') {
    return null;
  }

  const tags = transaction.tags ?? [];
  if (hasTag(tags, tagSets.cogs)) return 'cogs';
  if (hasTag(tags, tagSets.labor)) return 'labor';
  if (hasTag(tags, tagSets.overhead)) return 'overhead';
  if (hasTag(tags, tagSets.revenue)) return 'revenue';

  return transaction.type === 'INCOME' ? 'revenue' : 'overhead';
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface MutableBucket {
  revenueCents: number;
  cogsCents: number;
  laborCents: number;
  overheadCents: number;
  transactionCount: number;
}

function emptyBucket(): MutableBucket {
  return {
    revenueCents: 0,
    cogsCents: 0,
    laborCents: 0,
    overheadCents: 0,
    transactionCount: 0,
  };
}

function addToBucket(bucket: MutableBucket, category: PnlCategory, cents: number): void {
  switch (category) {
    case 'revenue':
      bucket.revenueCents += cents;
      break;
    case 'cogs':
      bucket.cogsCents += cents;
      break;
    case 'labor':
      bucket.laborCents += cents;
      break;
    case 'overhead':
      bucket.overheadCents += cents;
      break;
  }
  bucket.transactionCount += 1;
}

function finalizeBucket(bucket: MutableBucket): PnlTotals {
  const grossProfitCents = bucket.revenueCents - bucket.cogsCents;
  const operatingExpensesCents = bucket.laborCents + bucket.overheadCents;
  const netProfitCents = grossProfitCents - operatingExpensesCents;

  return {
    revenueCents: bucket.revenueCents,
    cogsCents: bucket.cogsCents,
    laborCents: bucket.laborCents,
    overheadCents: bucket.overheadCents,
    grossProfitCents,
    operatingExpensesCents,
    netProfitCents,
    grossMarginBps: marginBasisPoints(grossProfitCents, bucket.revenueCents),
    netMarginBps: marginBasisPoints(netProfitCents, bucket.revenueCents),
    transactionCount: bucket.transactionCount,
  };
}

/**
 * Build a weekly or monthly profit-and-loss statement from transactions.
 *
 * Transfers and voided transactions are ignored. Other transactions are
 * classified (see {@link classifyTransaction}), grouped into the chosen
 * period, and reduced into per-period plus combined totals.
 *
 * @example
 * ```ts
 * const statement = buildProfitAndLoss(transactions, { granularity: 'monthly' });
 * statement.totals.netProfitCents;   // exact integer cents
 * formatMarginPercent(statement.totals.netMarginBps); // "12.5%"
 * ```
 */
export function buildProfitAndLoss(
  transactions: readonly Transaction[],
  options: PnlOptions = {},
): PnlStatement {
  const granularity: PnlGranularity = options.granularity ?? 'monthly';
  const tagSets = compilePnlTagSets(options);

  const buckets = new Map<string, MutableBucket>();
  const combined = emptyBucket();

  for (const transaction of transactions) {
    if (!isInDateRange(transaction, options.startDate, options.endDate)) {
      continue;
    }

    const category = classifyTransaction(transaction, tagSets);
    if (category === null) {
      continue;
    }

    const cents = magnitudeCents(transaction.amount.amount);
    const key = periodKey(transaction.date, granularity);
    const bucket = buckets.get(key) ?? emptyBucket();
    addToBucket(bucket, category, cents);
    buckets.set(key, bucket);

    addToBucket(combined, category, cents);
  }

  const periods = [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: periodLabel(key, granularity),
      ...finalizeBucket(bucket),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    granularity,
    periods,
    totals: finalizeBucket(combined),
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** Format an integer cent amount as major currency units with two decimals. */
function formatCsvAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Format a basis-point margin as a plain percentage, or blank when N/A. */
function formatCsvMargin(bps: number | null): string {
  return bps === null || !Number.isFinite(bps) ? '' : (bps / 100).toFixed(1);
}

const PNL_CSV_HEADER =
  'Period,Revenue,COGS,Gross profit,Gross margin %,Labor,Overhead,Operating expenses,Net profit,Net margin %,Transactions';

function pnlCsvRow(label: string, totals: PnlTotals): string {
  return [
    escapeCsvField(label),
    formatCsvAmount(totals.revenueCents),
    formatCsvAmount(totals.cogsCents),
    formatCsvAmount(totals.grossProfitCents),
    formatCsvMargin(totals.grossMarginBps),
    formatCsvAmount(totals.laborCents),
    formatCsvAmount(totals.overheadCents),
    formatCsvAmount(totals.operatingExpensesCents),
    formatCsvAmount(totals.netProfitCents),
    formatCsvMargin(totals.netMarginBps),
    String(totals.transactionCount),
  ].join(',');
}

/**
 * Serialize a profit-and-loss statement as CSV for handing to an accountant.
 *
 * Emits one row per reporting period followed by an "All periods" totals row.
 * Amounts are major currency units with two decimals; margins are plain
 * percentages (blank when revenue is zero and the margin is N/A). The totals
 * transaction count is exact because P&L classification never splits a
 * transaction across buckets.
 */
export function exportBusinessPnlCsv(statement: PnlStatement): string {
  const rows = statement.periods.map((period) => pnlCsvRow(period.label, period));
  const totals = pnlCsvRow('All periods', statement.totals);
  return [PNL_CSV_HEADER, ...rows, totals].join('\n');
}
