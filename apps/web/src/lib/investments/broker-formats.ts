// SPDX-License-Identifier: BUSL-1.1

/**
 * Broker-native export format detection.
 *
 * Active traders export trade-confirmation / activity CSVs from many brokers,
 * each with its own column names, date conventions and asset class. The generic
 * header-alias mapper in {@link ./brokerage-import} works, but it still asks the
 * user to type the broker name and eyeball every column.
 *
 * This module recognizes the *signature* header layout of common brokerages
 * (Fidelity, Schwab, Robinhood, Interactive Brokers, E*TRADE, Vanguard, plus the
 * crypto venues Coinbase and Kraken) and returns the broker label, asset class,
 * a pre-tuned {@link BrokerageColumnMapping} resolved against the file's actual
 * headers, and the broker's typical date format. The UI uses this to auto-fill
 * the broker name and column mapping so a trader can import file after file
 * "without remapping every file by hand".
 *
 * Pure and deterministic — no I/O, no database, no floating-point money math.
 * References: issue #2120.
 */

import type { BrokerageColumnMapping } from './brokerage-import';

/** Logical fields a broker profile can map. Mirrors {@link BrokerageColumnMapping}. */
type MappingField = keyof BrokerageColumnMapping;

const MAPPING_FIELDS: readonly MappingField[] = [
  'date',
  'symbol',
  'action',
  'quantity',
  'price',
  'fees',
  'amount',
];

/** Whether a broker trades listed securities or crypto assets. */
export type BrokerAssetClass = 'equities' | 'crypto';

/** A recognized broker export layout. */
export interface BrokerFormatProfile {
  /** Stable machine id, e.g. `"fidelity"`. */
  readonly id: string;
  /** Human-readable broker label, e.g. `"Fidelity"`. */
  readonly broker: string;
  readonly assetClass: BrokerAssetClass;
  /**
   * Normalized header names that must *all* be present for the profile to
   * match. These are the distinctive columns that make the layout unambiguous.
   */
  readonly signature: readonly string[];
  /**
   * Candidate header names per logical field, in priority order. The first one
   * actually present in the file is used. Stored in display casing.
   */
  readonly columns: Readonly<Record<MappingField, readonly string[]>>;
  /** Typical date format (e.g. `"MM/DD/YYYY"`); omitted for ISO timestamps. */
  readonly dateFormat?: string;
}

/** The outcome of a successful detection. */
export interface DetectedBrokerFormat {
  readonly id: string;
  readonly broker: string;
  readonly assetClass: BrokerAssetClass;
  /** Column mapping resolved to the file's actual header strings. */
  readonly mapping: Partial<BrokerageColumnMapping>;
  readonly dateFormat?: string;
  /** Specificity score: number of signature headers matched (higher = surer). */
  readonly confidence: number;
}

/** Normalize a header for comparison (lower-case, collapse internal whitespace). */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Broker profiles, ordered most → least specific. The detector still ranks by
 * matched-signature count, so ordering only breaks exact ties deterministically.
 */
export const BROKER_FORMATS: readonly BrokerFormatProfile[] = [
  {
    id: 'fidelity',
    broker: 'Fidelity',
    assetClass: 'equities',
    signature: ['run date', 'action', 'symbol', 'quantity'],
    columns: {
      date: ['Run Date', 'Date'],
      symbol: ['Symbol'],
      action: ['Action'],
      quantity: ['Quantity'],
      price: ['Price ($)', 'Price'],
      fees: ['Commission ($)', 'Fees ($)', 'Commission'],
      amount: ['Amount ($)', 'Amount'],
    },
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'schwab',
    broker: 'Charles Schwab',
    assetClass: 'equities',
    signature: ['date', 'action', 'symbol', 'fees & comm'],
    columns: {
      date: ['Date'],
      symbol: ['Symbol'],
      action: ['Action'],
      quantity: ['Quantity'],
      price: ['Price'],
      fees: ['Fees & Comm'],
      amount: ['Amount'],
    },
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'robinhood',
    broker: 'Robinhood',
    assetClass: 'equities',
    signature: ['activity date', 'instrument', 'trans code'],
    columns: {
      date: ['Activity Date', 'Process Date', 'Settle Date'],
      symbol: ['Instrument'],
      action: ['Trans Code'],
      quantity: ['Quantity'],
      price: ['Price'],
      fees: ['Fees'],
      amount: ['Amount'],
    },
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'interactive-brokers',
    broker: 'Interactive Brokers',
    assetClass: 'equities',
    signature: ['symbol', 'buy/sell', 'tradeprice'],
    columns: {
      date: ['TradeDate', 'Date/Time', 'Date'],
      symbol: ['Symbol'],
      action: ['Buy/Sell'],
      quantity: ['Quantity'],
      price: ['TradePrice', 'T. Price', 'Price'],
      fees: ['IBCommission', 'Comm/Fee', 'Commission'],
      amount: ['Proceeds', 'NetCash', 'Amount'],
    },
  },
  {
    id: 'etrade',
    broker: 'E*TRADE',
    assetClass: 'equities',
    signature: ['transactiondate', 'transactiontype', 'symbol'],
    columns: {
      date: ['TransactionDate'],
      symbol: ['Symbol'],
      action: ['TransactionType'],
      quantity: ['Quantity'],
      price: ['Price'],
      fees: ['Commission'],
      amount: ['Amount'],
    },
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'vanguard',
    broker: 'Vanguard',
    assetClass: 'equities',
    signature: ['trade date', 'transaction type', 'shares', 'share price'],
    columns: {
      date: ['Trade Date'],
      symbol: ['Symbol'],
      action: ['Transaction Type'],
      quantity: ['Shares'],
      price: ['Share Price'],
      fees: ['Commission Fees'],
      amount: ['Principal Amount', 'Net Amount'],
    },
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'coinbase',
    broker: 'Coinbase',
    assetClass: 'crypto',
    signature: ['timestamp', 'transaction type', 'asset', 'quantity transacted'],
    columns: {
      date: ['Timestamp'],
      symbol: ['Asset'],
      action: ['Transaction Type'],
      quantity: ['Quantity Transacted'],
      price: ['Spot Price at Transaction', 'Price'],
      fees: ['Fees and/or Spread', 'Fees'],
      amount: ['Subtotal', 'Total (inclusive of fees and/or spread)', 'Total'],
    },
  },
  {
    id: 'kraken',
    broker: 'Kraken',
    assetClass: 'crypto',
    signature: ['ordertxid', 'pair', 'vol', 'price'],
    columns: {
      date: ['time'],
      symbol: ['pair'],
      action: ['type'],
      quantity: ['vol'],
      price: ['price'],
      fees: ['fee'],
      amount: ['cost'],
    },
  },
];

/** Resolve a profile's candidate columns against the file's actual headers. */
function resolveMapping(
  profile: BrokerFormatProfile,
  headerByNorm: ReadonlyMap<string, string>,
): Partial<BrokerageColumnMapping> {
  const mapping: Partial<Record<MappingField, string>> = {};
  for (const field of MAPPING_FIELDS) {
    for (const candidate of profile.columns[field]) {
      const actual = headerByNorm.get(normalizeHeader(candidate));
      if (actual) {
        mapping[field] = actual;
        break;
      }
    }
  }
  return mapping;
}

/**
 * Detect the broker behind a CSV from its header row.
 *
 * Returns the best-matching profile (most signature headers matched), with its
 * column mapping resolved to the file's real header strings, or `null` when no
 * known broker layout is recognized (the caller then falls back to the generic
 * alias mapper and asks the user for a broker name).
 */
export function detectBrokerFormat(headers: readonly string[]): DetectedBrokerFormat | null {
  if (headers.length === 0) return null;

  const headerByNorm = new Map<string, string>();
  for (const header of headers) {
    const norm = normalizeHeader(header);
    // First writer wins so duplicate-ish headers keep the leftmost column.
    if (!headerByNorm.has(norm)) headerByNorm.set(norm, header);
  }

  let best: DetectedBrokerFormat | null = null;
  for (const profile of BROKER_FORMATS) {
    const allPresent = profile.signature.every((sig) => headerByNorm.has(sig));
    if (!allPresent) continue;
    const confidence = profile.signature.length;
    if (best && confidence <= best.confidence) continue;
    best = {
      id: profile.id,
      broker: profile.broker,
      assetClass: profile.assetClass,
      mapping: resolveMapping(profile, headerByNorm),
      dateFormat: profile.dateFormat,
      confidence,
    };
  }
  return best;
}

/** Display labels for the broker datalist / docs, in presentation order. */
export const KNOWN_BROKER_LABELS: readonly string[] = BROKER_FORMATS.map((p) => p.broker);
