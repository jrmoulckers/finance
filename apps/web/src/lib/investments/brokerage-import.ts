// SPDX-License-Identifier: BUSL-1.1

/**
 * Brokerage trade-confirmation CSV import + cross-broker reconciliation engine.
 *
 * Pure, deterministic, dependency-light TypeScript. The pipeline is:
 *
 *   1. {@link suggestColumnMapping}    — headers → best-guess column mapping
 *   2. {@link parseBrokerageCsv}       — tolerant CSV → {@link ParsedTrade}[]
 *   3. {@link reconcileTrades}         — fold trades into per-symbol holdings,
 *                                        detect duplicates and oversold positions
 *   4. {@link buildBrokerageImportPlan}— orchestrates 2–3 across many brokers
 *
 * A user exports trade-confirmation CSVs from multiple brokers (Fidelity,
 * Schwab, Robinhood, …) with slightly different column names. The engine maps
 * those header variants onto a common shape, then reconciles buys / sells /
 * dividends into a single unified holdings view with average cost basis.
 *
 * ALL money math is in **integer cents** — never floating point for currency.
 * Share quantities are decimal counts (fractional shares are common) and are
 * rounded to six decimal places for stable aggregation and comparison. Banker's
 * rounding (round-half-to-even) is delegated to the shared import utilities.
 *
 * This module performs no I/O and never touches the database; the UI layer owns
 * file reading and any persistence. References: issue #2120.
 */

import { parseCsv } from '../csv-parser';
import { parseCurrencyToCents, parseDate } from '../import/csv-parser';
import { bankersRound } from '../import/utils';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Trade actions the engine understands. `DIV` is a cash/-reinvested dividend. */
export type BrokerageAction = 'BUY' | 'SELL' | 'DIV';

/** Logical field → CSV header-name mapping. */
export interface BrokerageColumnMapping {
  readonly date: string;
  readonly symbol: string;
  readonly action: string;
  readonly quantity: string;
  readonly price: string;
  /** Optional explicit fee/commission column. */
  readonly fees?: string;
  /** Optional net-amount column (used to derive price/dividend when absent). */
  readonly amount?: string;
}

/** Options for {@link parseBrokerageCsv}. */
export interface BrokerageParseOptions {
  /** Human-readable broker label, e.g. `"Fidelity"`. Used for reconciliation. */
  readonly broker: string;
  /** Column mapping overrides; missing fields fall back to auto-detection. */
  readonly mapping?: Partial<BrokerageColumnMapping>;
  /** Explicit date format (e.g. `"MM/DD/YYYY"`); auto-detected when omitted. */
  readonly dateFormat?: string;
  /** Whether the first row is a header row. @default true */
  readonly hasHeader?: boolean;
  /** Delimiter override; auto-detected when omitted. */
  readonly delimiter?: string;
}

/** A single normalized, parsed trade row. */
export interface ParsedTrade {
  readonly broker: string;
  /** 1-based source line number (header counted). */
  readonly line: number;
  /** ISO-8601 trade date (`YYYY-MM-DD`). */
  readonly date: string;
  /** Upper-cased ticker symbol. */
  readonly symbol: string;
  readonly action: BrokerageAction;
  /** Absolute share quantity (fractional allowed). */
  readonly quantity: number;
  /** Price per share, integer cents (>= 0). */
  readonly priceCents: number;
  /** Fees / commission, integer cents (>= 0). */
  readonly feesCents: number;
  /** Gross trade value before fees, integer cents (`round(qty * price)`). */
  readonly grossCents: number;
  /** Signed cash impact: BUY negative, SELL / DIV positive. */
  readonly cashFlowCents: number;
  /** Stable, broker-agnostic key used for duplicate detection. */
  readonly dedupeKey: string;
  /** Unique id for this parsed row (includes broker + line). */
  readonly id: string;
}

/** A row that could not be parsed. */
export interface BrokerageParseError {
  readonly broker: string;
  readonly line: number;
  readonly message: string;
  readonly raw: string;
}

/** Result of parsing a single broker's CSV. */
export interface BrokerageParseResult {
  readonly broker: string;
  readonly trades: readonly ParsedTrade[];
  readonly errors: readonly BrokerageParseError[];
  /** The resolved (auto-detected + overridden) column mapping. */
  readonly mapping: BrokerageColumnMapping;
  /** Detected CSV headers. */
  readonly headers: readonly string[];
}

/** Per-broker contribution to a reconciled holding. */
export interface BrokerContribution {
  readonly broker: string;
  readonly quantity: number;
  readonly costBasisCents: number;
}

/** A single symbol reconciled across all brokers. */
export interface ReconciledHolding {
  readonly symbol: string;
  /** Net open quantity (buys minus sells), rounded to 6 dp. */
  readonly netQuantity: number;
  /** Remaining cost basis of the open position, integer cents. */
  readonly costBasisCents: number;
  /** Average cost per share of the open position, integer cents. */
  readonly averageCostCents: number;
  /** Realized gain/loss from closed lots (proceeds minus basis), integer cents. */
  readonly realizedGainCents: number;
  /** Total dividends received, integer cents. */
  readonly dividendsCents: number;
  /** Total fees paid across all trades, integer cents. */
  readonly totalFeesCents: number;
  /** Brokers that contributed trades for this symbol. */
  readonly brokers: readonly string[];
  /** Remaining quantity / basis attributed to each broker. */
  readonly contributions: readonly BrokerContribution[];
  readonly buyCount: number;
  readonly sellCount: number;
}

/** Categories of reconciliation warning. */
export type BrokerageWarningType =
  | 'duplicate-within-broker'
  | 'duplicate-cross-broker'
  | 'oversold-position';

/** A group of trades flagged as duplicates of one another. */
export interface DuplicateGroup {
  readonly key: string;
  readonly symbol: string;
  readonly tradeIds: readonly string[];
  /** True when the duplicate spans more than one broker. */
  readonly crossBroker: boolean;
}

/** A non-fatal reconciliation finding surfaced to the user. */
export interface BrokerageWarning {
  readonly type: BrokerageWarningType;
  readonly severity: 'info' | 'warning';
  readonly symbol?: string;
  readonly message: string;
  readonly tradeIds: readonly string[];
}

/** Aggregate totals across the whole import. */
export interface BrokerageTotals {
  readonly tradeCount: number;
  readonly buyCount: number;
  readonly sellCount: number;
  readonly dividendCount: number;
  /** Net cash invested: buy costs minus sell proceeds, integer cents. */
  readonly netInvestedCents: number;
  readonly dividendsCents: number;
  readonly feesCents: number;
}

/** The full, recomputable import plan. */
export interface BrokerageImportPlan {
  readonly trades: readonly ParsedTrade[];
  readonly holdings: readonly ReconciledHolding[];
  readonly duplicates: readonly DuplicateGroup[];
  readonly warnings: readonly BrokerageWarning[];
  readonly errors: readonly BrokerageParseError[];
  readonly brokers: readonly string[];
  readonly totals: BrokerageTotals;
}

// ---------------------------------------------------------------------------
// Column-mapping detection
// ---------------------------------------------------------------------------

/**
 * Header aliases per logical field, in priority order. Lower-cased; matched
 * first by exact equality, then by substring inclusion for robustness against
 * broker-specific suffixes (e.g. `"Price (USD)"` → `price`).
 */
const COLUMN_ALIASES: Record<keyof BrokerageColumnMapping, readonly string[]> = {
  date: [
    'trade date',
    'run date',
    'activity date',
    'settlement date',
    'transaction date',
    'as of date',
    'date',
  ],
  symbol: ['symbol', 'ticker', 'instrument', 'security id', 'security', 'cusip'],
  action: [
    'action',
    'transaction type',
    'trans code',
    'activity type',
    'buy/sell',
    'side',
    'type',
    'activity',
    'transaction',
    'description',
  ],
  quantity: ['quantity', 'shares', 'share quantity', 'no. of shares', 'units', 'qty'],
  price: [
    'price per share',
    'execution price',
    'average price',
    'avg price',
    'share price',
    'unit price',
    'trade price',
    'price',
  ],
  fees: [
    'fees & comm',
    'commission/fees',
    'commission',
    'total fees',
    'reg fee',
    'fees',
    'fee',
    'comm',
  ],
  amount: ['net amount', 'net cash', 'amount', 'proceeds', 'total', 'value', 'cost'],
};

/** Normalize a header for comparison (lower-case, collapse whitespace). */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Find the first header that matches one of `aliases` (exact then substring). */
function matchHeader(headers: readonly string[], aliases: readonly string[]): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  for (const alias of aliases) {
    const exact = normalized.find((h) => h.norm === alias);
    if (exact) return exact.raw;
  }
  for (const alias of aliases) {
    const partial = normalized.find((h) => h.norm.includes(alias));
    if (partial) return partial.raw;
  }
  return undefined;
}

/**
 * Suggest a column mapping from a CSV's headers using {@link COLUMN_ALIASES}.
 * Fields that cannot be matched are left as empty strings (the UI prompts the
 * user to resolve them).
 */
export function suggestColumnMapping(headers: readonly string[]): BrokerageColumnMapping {
  return {
    date: matchHeader(headers, COLUMN_ALIASES.date) ?? '',
    symbol: matchHeader(headers, COLUMN_ALIASES.symbol) ?? '',
    action: matchHeader(headers, COLUMN_ALIASES.action) ?? '',
    quantity: matchHeader(headers, COLUMN_ALIASES.quantity) ?? '',
    price: matchHeader(headers, COLUMN_ALIASES.price) ?? '',
    fees: matchHeader(headers, COLUMN_ALIASES.fees) ?? '',
    amount: matchHeader(headers, COLUMN_ALIASES.amount) ?? '',
  };
}

/** Merge auto-detected mapping with caller overrides. */
function resolveMapping(
  headers: readonly string[],
  overrides?: Partial<BrokerageColumnMapping>,
): BrokerageColumnMapping {
  const detected = suggestColumnMapping(headers);
  return {
    date: overrides?.date ?? detected.date,
    symbol: overrides?.symbol ?? detected.symbol,
    action: overrides?.action ?? detected.action,
    quantity: overrides?.quantity ?? detected.quantity,
    price: overrides?.price ?? detected.price,
    fees: overrides?.fees ?? detected.fees,
    amount: overrides?.amount ?? detected.amount,
  };
}

// ---------------------------------------------------------------------------
// Value parsing helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw action string to a {@link BrokerageAction}. Tolerant of broker
 * phrasings ("YOU BOUGHT", "Buy", "Sold", "Reinvest Dividend", …).
 * Returns `null` when the action cannot be recognized.
 */
export function normalizeAction(raw: string): BrokerageAction | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('div') || s.includes('reinvest') || s.includes('drip')) return 'DIV';
  if (s.includes('sell') || s.includes('sold') || s.includes('sale')) return 'SELL';
  if (s.includes('buy') || s.includes('bought') || s.includes('purchase')) return 'BUY';
  return null;
}

/** Round a share quantity to 6 decimal places for stable aggregation. */
function roundQuantity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Parse a raw share-quantity string into a finite number, or `null`. */
function parseQuantity(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  if (cleaned.length === 0) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return roundQuantity(value);
}

/** Resolve a mapped field's raw cell value from a row. */
function fieldValue(
  row: readonly string[],
  headers: readonly string[],
  column: string | undefined,
): string {
  if (!column) return '';
  const index = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(column));
  if (index < 0) return '';
  return row[index] ?? '';
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single broker's trade-confirmation CSV into normalized trades.
 *
 * Malformed rows are collected into {@link BrokerageParseResult.errors} rather
 * than throwing, so one bad row never aborts the whole import.
 */
export function parseBrokerageCsv(
  content: string,
  options: BrokerageParseOptions,
): BrokerageParseResult {
  const broker = options.broker.trim() || 'Unknown broker';
  const { headers, rows } = parseCsv(content, {
    hasHeader: options.hasHeader ?? true,
    delimiter: options.delimiter,
  });
  const mapping = resolveMapping(headers, options.mapping);

  const trades: ParsedTrade[] = [];
  const errors: BrokerageParseError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const line = i + (options.hasHeader === false ? 1 : 2);
    const row = rows[i];
    const raw = row.join(',');

    try {
      const trade = parseRow(row, headers, mapping, broker, line, options.dateFormat);
      if ('message' in trade) {
        errors.push({ broker, line, message: trade.message, raw });
      } else {
        trades.push(trade);
      }
    } catch {
      errors.push({ broker, line, message: 'Unexpected error parsing row', raw });
    }
  }

  return { broker, trades, errors, mapping, headers };
}

/** Parse one row into a {@link ParsedTrade} or a `{ message }` failure. */
function parseRow(
  row: readonly string[],
  headers: readonly string[],
  mapping: BrokerageColumnMapping,
  broker: string,
  line: number,
  dateFormat?: string,
): ParsedTrade | { message: string } {
  const dateRaw = fieldValue(row, headers, mapping.date);
  if (!dateRaw.trim()) return { message: 'Missing trade date' };
  const date = parseDate(dateRaw, dateFormat);
  if (!date) return { message: `Unable to parse date "${dateRaw}"` };

  const action = normalizeAction(fieldValue(row, headers, mapping.action));
  if (!action) {
    const rawAction = fieldValue(row, headers, mapping.action).trim();
    return { message: rawAction ? `Unrecognized action "${rawAction}"` : 'Missing action' };
  }

  const symbol = fieldValue(row, headers, mapping.symbol).trim().toUpperCase();
  if (!symbol) return { message: 'Missing symbol' };

  const feesRaw = fieldValue(row, headers, mapping.fees);
  const feesCents = feesRaw.trim() ? Math.abs(parseCurrencyToCents(feesRaw) ?? 0) : 0;

  const amountRaw = fieldValue(row, headers, mapping.amount);
  const amountCents = amountRaw.trim() ? parseCurrencyToCents(amountRaw) : null;

  let quantity: number;
  let priceCents: number;
  let grossCents: number;

  if (action === 'DIV') {
    const qty = parseQuantity(fieldValue(row, headers, mapping.quantity));
    const priceRaw = fieldValue(row, headers, mapping.price);
    const priceParsed = priceRaw.trim() ? parseCurrencyToCents(priceRaw) : null;
    // Dividend value comes from the amount column, else qty * price, else price.
    const dividend =
      amountCents !== null
        ? Math.abs(amountCents)
        : qty !== null && priceParsed !== null
          ? Math.abs(bankersRound(qty * priceParsed))
          : priceParsed !== null
            ? Math.abs(priceParsed)
            : null;
    if (dividend === null) return { message: 'Missing dividend amount' };
    quantity = qty ?? 0;
    priceCents = priceParsed !== null ? Math.abs(priceParsed) : 0;
    grossCents = dividend;
  } else {
    const qty = parseQuantity(fieldValue(row, headers, mapping.quantity));
    if (qty === null || qty === 0) return { message: 'Missing or invalid quantity' };
    quantity = Math.abs(qty);

    const priceRaw = fieldValue(row, headers, mapping.price);
    const priceParsed = priceRaw.trim() ? parseCurrencyToCents(priceRaw) : null;
    if (priceParsed !== null) {
      priceCents = Math.abs(priceParsed);
      grossCents = bankersRound(quantity * priceCents);
    } else if (amountCents !== null) {
      // Derive gross/price from the net amount when no price column exists.
      grossCents = Math.max(0, Math.abs(amountCents) - feesCents);
      priceCents = quantity > 0 ? bankersRound(grossCents / quantity) : 0;
    } else {
      return { message: 'Missing price' };
    }
  }

  const cashFlowCents =
    action === 'BUY'
      ? -(grossCents + feesCents)
      : action === 'SELL'
        ? grossCents - feesCents
        : grossCents;

  const dedupeKey = [
    date,
    symbol,
    action,
    Math.round(quantity * 1_000_000),
    grossCents,
    feesCents,
  ].join('|');
  const id = `${broker}#${line}#${dedupeKey}`;

  return {
    broker,
    line,
    date,
    symbol,
    action,
    quantity,
    priceCents,
    feesCents,
    grossCents,
    cashFlowCents,
    dedupeKey,
    id,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

interface MutableContribution {
  quantity: number;
  costBasisCents: number;
}

/** Stable sort of trades: by date, then symbol, then source line. */
function sortTrades(trades: readonly ParsedTrade[]): ParsedTrade[] {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
    if (a.broker !== b.broker) return a.broker < b.broker ? -1 : 1;
    return a.line - b.line;
  });
}

/**
 * Reconcile parsed trades into per-symbol holdings using the **average cost**
 * method, pooling lots across every broker into a single unified position.
 * Also detects duplicate trades and oversold positions.
 */
export function reconcileTrades(trades: readonly ParsedTrade[]): {
  holdings: ReconciledHolding[];
  duplicates: DuplicateGroup[];
  warnings: BrokerageWarning[];
} {
  const sorted = sortTrades(trades);
  const bySymbol = new Map<string, ParsedTrade[]>();
  for (const trade of sorted) {
    const list = bySymbol.get(trade.symbol);
    if (list) list.push(trade);
    else bySymbol.set(trade.symbol, [trade]);
  }

  const holdings: ReconciledHolding[] = [];
  const warnings: BrokerageWarning[] = [];

  for (const [symbol, symbolTrades] of bySymbol) {
    let runningQty = 0;
    let runningCostCents = 0;
    let realizedGainCents = 0;
    let dividendsCents = 0;
    let totalFeesCents = 0;
    let buyCount = 0;
    let sellCount = 0;
    const contributions = new Map<string, MutableContribution>();
    const oversoldIds: string[] = [];

    const contributionFor = (broker: string): MutableContribution => {
      let c = contributions.get(broker);
      if (!c) {
        c = { quantity: 0, costBasisCents: 0 };
        contributions.set(broker, c);
      }
      return c;
    };

    for (const trade of symbolTrades) {
      totalFeesCents += trade.feesCents;
      const contribution = contributionFor(trade.broker);

      if (trade.action === 'BUY') {
        const lotCost = trade.grossCents + trade.feesCents;
        runningCostCents += lotCost;
        runningQty = roundQuantity(runningQty + trade.quantity);
        contribution.quantity = roundQuantity(contribution.quantity + trade.quantity);
        contribution.costBasisCents += lotCost;
        buyCount += 1;
      } else if (trade.action === 'SELL') {
        sellCount += 1;
        const avgCost = runningQty > 0 ? runningCostCents / runningQty : 0;
        const closedQty = runningQty > 0 ? Math.min(trade.quantity, runningQty) : 0;
        const costRemoved = bankersRound(avgCost * closedQty);
        const proceeds = trade.grossCents - trade.feesCents;
        realizedGainCents += proceeds - costRemoved;
        runningCostCents = Math.max(0, runningCostCents - costRemoved);
        runningQty = roundQuantity(runningQty - trade.quantity);
        contribution.quantity = roundQuantity(contribution.quantity - trade.quantity);
        contribution.costBasisCents = Math.max(0, contribution.costBasisCents - costRemoved);
        if (runningQty < -1e-6) oversoldIds.push(trade.id);
      } else {
        dividendsCents += trade.grossCents;
      }
    }

    const netQuantity = roundQuantity(runningQty);
    const hasOpenPosition = netQuantity > 1e-9;
    const costBasisCents = hasOpenPosition ? Math.round(runningCostCents) : 0;
    const averageCostCents = hasOpenPosition ? bankersRound(runningCostCents / netQuantity) : 0;

    const brokers = [...contributions.keys()].sort();
    const contributionList: BrokerContribution[] = brokers.map((broker) => {
      const c = contributions.get(broker)!;
      return {
        broker,
        quantity: roundQuantity(c.quantity),
        costBasisCents: Math.max(0, Math.round(c.costBasisCents)),
      };
    });

    if (oversoldIds.length > 0) {
      warnings.push({
        type: 'oversold-position',
        severity: 'warning',
        symbol,
        message: `Sells for ${symbol} exceed recorded buys. A buy may be missing from another broker's export.`,
        tradeIds: oversoldIds,
      });
    }

    holdings.push({
      symbol,
      netQuantity,
      costBasisCents,
      averageCostCents,
      realizedGainCents,
      dividendsCents,
      totalFeesCents,
      brokers,
      contributions: contributionList,
      buyCount,
      sellCount,
    });
  }

  holdings.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));

  const duplicates = detectDuplicates(sorted);
  for (const group of duplicates) {
    warnings.push({
      type: group.crossBroker ? 'duplicate-cross-broker' : 'duplicate-within-broker',
      severity: group.crossBroker ? 'info' : 'warning',
      symbol: group.symbol,
      message: group.crossBroker
        ? `Identical ${group.symbol} trade found in more than one broker export. Confirm it is not the same trade counted twice.`
        : `Identical ${group.symbol} trade appears ${group.tradeIds.length} times in one export. This is likely a duplicate import.`,
      tradeIds: group.tradeIds,
    });
  }

  return { holdings, duplicates, warnings };
}

/**
 * Detect duplicate trades. Trades sharing a {@link ParsedTrade.dedupeKey} are
 * grouped; a group spanning multiple brokers is flagged `crossBroker`.
 */
export function detectDuplicates(trades: readonly ParsedTrade[]): DuplicateGroup[] {
  const groups = new Map<string, ParsedTrade[]>();
  for (const trade of trades) {
    const list = groups.get(trade.dedupeKey);
    if (list) list.push(trade);
    else groups.set(trade.dedupeKey, [trade]);
  }

  const result: DuplicateGroup[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const brokers = new Set(group.map((t) => t.broker));
    result.push({
      key,
      symbol: group[0].symbol,
      tradeIds: group.map((t) => t.id),
      crossBroker: brokers.size > 1,
    });
  }
  result.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return result;
}

// ---------------------------------------------------------------------------
// Plan orchestration
// ---------------------------------------------------------------------------

/** A parsed-and-ready broker source fed into {@link buildBrokerageImportPlan}. */
export type BrokerageSource = BrokerageParseResult;

/** Compute aggregate totals across every parsed trade. */
function computeTotals(trades: readonly ParsedTrade[]): BrokerageTotals {
  let buyCount = 0;
  let sellCount = 0;
  let dividendCount = 0;
  let netInvestedCents = 0;
  let dividendsCents = 0;
  let feesCents = 0;

  for (const trade of trades) {
    feesCents += trade.feesCents;
    if (trade.action === 'BUY') {
      buyCount += 1;
      netInvestedCents += trade.grossCents + trade.feesCents;
    } else if (trade.action === 'SELL') {
      sellCount += 1;
      netInvestedCents -= trade.grossCents - trade.feesCents;
    } else {
      dividendCount += 1;
      dividendsCents += trade.grossCents;
    }
  }

  return {
    tradeCount: trades.length,
    buyCount,
    sellCount,
    dividendCount,
    netInvestedCents,
    dividendsCents,
    feesCents,
  };
}

/**
 * Build a complete, recomputable import plan from one or more parsed broker
 * sources. The trades are pooled, reconciled into unified holdings, and
 * duplicate / oversold findings are surfaced as warnings.
 */
export function buildBrokerageImportPlan(sources: readonly BrokerageSource[]): BrokerageImportPlan {
  const trades = sortTrades(sources.flatMap((source) => source.trades));
  const errors = sources.flatMap((source) => source.errors);
  const brokers = [...new Set(sources.map((source) => source.broker))].sort();
  const { holdings, duplicates, warnings } = reconcileTrades(trades);

  return {
    trades,
    holdings,
    duplicates,
    warnings,
    errors,
    brokers,
    totals: computeTotals(trades),
  };
}

/**
 * Convenience wrapper: parse each raw broker CSV and build the plan in one call.
 */
export function importBrokerageCsvs(
  inputs: readonly { content: string; options: BrokerageParseOptions }[],
): BrokerageImportPlan {
  const sources = inputs.map((input) => parseBrokerageCsv(input.content, input.options));
  return buildBrokerageImportPlan(sources);
}
