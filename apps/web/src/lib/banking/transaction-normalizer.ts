// SPDX-License-Identifier: BUSL-1.1

/**
 * Normalizes provider-specific financial data into the app's standard models.
 *
 * Different banking aggregators return transactions and accounts in wildly
 * different shapes. This module converts them all to the canonical
 * {@link BankTransaction} and {@link BankAccount} types used throughout
 * the application.
 *
 * Key responsibilities:
 * - Dollar → integer-cent conversion with Banker's rounding (HALF_EVEN)
 * - Date normalization to ISO-8601 (YYYY-MM-DD)
 * - Category mapping from provider taxonomies to the app's category set
 * - Deduplication by provider transaction ID
 *
 * @module banking/transaction-normalizer
 */

import type { BankAccount, BankAccountType, BankTransaction } from './types';

// ---------------------------------------------------------------------------
// Raw provider data shapes (intentionally loose)
// ---------------------------------------------------------------------------

/**
 * A transaction record as returned by any provider before normalization.
 *
 * All fields are optional because different providers supply different subsets.
 */
export interface RawProviderTransaction {
  /** Provider's unique transaction identifier. */
  id?: string;
  /** Transaction date in any reasonable string format. */
  date?: string;
  /** Amount as a number (dollars, euros, etc. — NOT cents). */
  amount?: number;
  /** Amount already expressed in integer cents (some providers do this). */
  amountCents?: number;
  /** Primary description or payee line. */
  description?: string;
  /** Provider-specific category label. */
  category?: string;
  /** Merchant name. */
  merchant?: string;
  /** Whether the transaction is pending. */
  pending?: boolean;
  /** Account this transaction belongs to (provider-specific ID). */
  accountId?: string;
}

/**
 * An account record as returned by any provider before normalization.
 */
export interface RawProviderAccount {
  /** Provider's unique account identifier. */
  id?: string;
  /** Display name. */
  name?: string;
  /** Account type in the provider's own taxonomy. */
  type?: string;
  /** ISO 4217 currency code. */
  currency?: string;
  /** Institution name. */
  institution?: string;
  /** Last four digits or mask. */
  mask?: string;
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

/**
 * Maps common provider category labels (lowercased) to the app's category
 * set. Unknown categories fall through to `"uncategorized"`.
 */
const CATEGORY_MAP: Record<string, string> = {
  // Food & drink
  food: 'food_and_drink',
  'food and drink': 'food_and_drink',
  restaurants: 'food_and_drink',
  groceries: 'groceries',
  grocery: 'groceries',

  // Transportation
  transportation: 'transportation',
  transport: 'transportation',
  travel: 'travel',
  'gas stations': 'transportation',
  gas: 'transportation',

  // Housing
  rent: 'housing',
  mortgage: 'housing',
  housing: 'housing',

  // Utilities
  utilities: 'utilities',
  'phone bill': 'utilities',
  internet: 'utilities',

  // Shopping
  shopping: 'shopping',
  merchandise: 'shopping',
  clothing: 'shopping',

  // Entertainment
  entertainment: 'entertainment',
  recreation: 'entertainment',

  // Health
  healthcare: 'healthcare',
  'health care': 'healthcare',
  medical: 'healthcare',
  pharmacy: 'healthcare',

  // Income
  income: 'income',
  payroll: 'income',
  salary: 'income',
  'direct deposit': 'income',

  // Transfer
  transfer: 'transfer',
  'bank transfer': 'transfer',
  payment: 'transfer',

  // Education
  education: 'education',
  tuition: 'education',

  // Personal care
  'personal care': 'personal_care',

  // Subscriptions
  subscription: 'subscriptions',
  subscriptions: 'subscriptions',

  // Insurance
  insurance: 'insurance',

  // Taxes
  tax: 'taxes',
  taxes: 'taxes',
};

/**
 * Map a provider-specific category label to the app's standard category.
 *
 * @param providerCategory - Raw category string from the provider.
 * @returns App-standard category, or `"uncategorized"` if no mapping exists.
 */
export function mapCategory(providerCategory: string | undefined): string {
  if (!providerCategory) return 'uncategorized';
  return CATEGORY_MAP[providerCategory.toLowerCase().trim()] ?? 'uncategorized';
}

// ---------------------------------------------------------------------------
// Amount helpers
// ---------------------------------------------------------------------------

/**
 * Convert a floating-point dollar amount to integer cents using
 * Banker's rounding (round half to even).
 *
 * @param dollars - Amount in dollars (e.g., 12.345).
 * @returns Amount in integer cents (e.g., 1234 for $12.345 → rounds to 1234).
 */
export function dollarsToCents(dollars: number): number {
  // Multiply first, then apply Banker's rounding
  const raw = dollars * 100;
  return bankersRound(raw);
}

/**
 * Banker's rounding (HALF_EVEN): when the value is exactly halfway between
 * two integers, round to the nearest **even** integer.
 *
 * @param value - A numeric value.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  const floored = Math.floor(value);
  const diff = value - floored;

  // Tolerance for "exactly halfway" due to floating-point imprecision
  const EPSILON = 1e-9;

  if (Math.abs(diff - 0.5) < EPSILON) {
    // Exactly halfway — round to even
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a date value to ISO-8601 date string (YYYY-MM-DD).
 *
 * Accepts ISO strings, `Date` objects, Unix timestamps (milliseconds),
 * and several common date formats.
 *
 * @param raw - Date in any reasonable format.
 * @returns Normalized YYYY-MM-DD string, or today's date if parsing fails.
 */
export function normalizeDate(raw: string | number | Date | undefined): string {
  if (!raw) return todayISO();

  let d: Date;
  if (raw instanceof Date) {
    d = raw;
  } else if (typeof raw === 'number') {
    d = new Date(raw);
  } else {
    // Try parsing common formats; Date.parse handles ISO and RFC 2822.
    // For MM/DD/YYYY or DD/MM/YYYY ambiguity we assume M/D/Y (US convention).
    const cleaned = raw.trim();
    const slashParts = cleaned.split('/');
    if (slashParts.length === 3) {
      const [m, day, y] = slashParts;
      d = new Date(`${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`);
    } else {
      d = new Date(cleaned);
    }
  }

  if (isNaN(d.getTime())) return todayISO();

  return d.toISOString().slice(0, 10);
}

/** Today's date as YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Account type mapping
// ---------------------------------------------------------------------------

const ACCOUNT_TYPE_MAP: Record<string, BankAccountType> = {
  checking: 'checking',
  depository: 'checking',
  savings: 'savings',
  credit: 'credit_card',
  'credit card': 'credit_card',
  credit_card: 'credit_card',
  loan: 'loan',
  mortgage: 'loan',
  investment: 'investment',
  brokerage: 'investment',
  retirement: 'investment',
  '401k': 'investment',
  ira: 'investment',
  crypto: 'crypto',
  cryptocurrency: 'crypto',
  wallet: 'crypto',
  exchange: 'crypto',
};

/**
 * Map a provider account type string to the app's {@link BankAccountType}.
 *
 * @param providerType - Raw type string from the provider.
 * @returns Normalized account type, defaulting to `"other"`.
 */
export function mapAccountType(providerType: string | undefined): BankAccountType {
  if (!providerType) return 'other';
  return ACCOUNT_TYPE_MAP[providerType.toLowerCase().trim()] ?? 'other';
}

// ---------------------------------------------------------------------------
// Public normalization functions
// ---------------------------------------------------------------------------

/**
 * Normalize a provider-specific transaction into the app's standard
 * {@link BankTransaction} model.
 *
 * @param raw - Raw transaction data from the provider.
 * @param providerId - Identifier of the originating provider.
 * @returns Normalized transaction with amount in integer cents.
 */
export function normalizeTransaction(
  raw: RawProviderTransaction,
  providerId: string,
): BankTransaction {
  const providerTxId = raw.id ?? `${providerId}-${Date.now()}`;
  const amountCents =
    raw.amountCents !== undefined ? Math.round(raw.amountCents) : dollarsToCents(raw.amount ?? 0);

  return {
    id: crypto.randomUUID(),
    providerTransactionId: providerTxId,
    accountId: raw.accountId ?? '',
    date: normalizeDate(raw.date),
    amountCents,
    description: (raw.description ?? '').trim() || 'Unknown',
    category: mapCategory(raw.category),
    merchant: raw.merchant?.trim() || undefined,
    pending: raw.pending ?? false,
  };
}

/**
 * Normalize a provider-specific account into the app's standard
 * {@link BankAccount} model.
 *
 * @param raw - Raw account data from the provider.
 * @param providerId - Identifier of the originating provider.
 * @returns Normalized account record.
 */
export function normalizeAccount(raw: RawProviderAccount, providerId: string): BankAccount {
  return {
    id: crypto.randomUUID(),
    providerAccountId: raw.id ?? `${providerId}-${Date.now()}`,
    name: (raw.name ?? '').trim() || 'Unnamed Account',
    type: mapAccountType(raw.type),
    currency: (raw.currency ?? 'USD').toUpperCase(),
    institution: (raw.institution ?? '').trim() || 'Unknown',
    mask: raw.mask?.trim() || undefined,
  };
}

/**
 * Deduplicate an array of transactions by their provider transaction ID.
 *
 * When duplicates are found the **first** occurrence wins (preserving
 * insertion order).
 *
 * @param transactions - Array of normalized transactions.
 * @returns Deduplicated array.
 */
export function deduplicateTransactions(transactions: BankTransaction[]): BankTransaction[] {
  const seen = new Set<string>();
  return transactions.filter((tx) => {
    if (seen.has(tx.providerTransactionId)) return false;
    seen.add(tx.providerTransactionId);
    return true;
  });
}
