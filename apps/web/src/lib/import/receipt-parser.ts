// SPDX-License-Identifier: BUSL-1.1

/**
 * On-device receipt OCR parsing contract and parser.
 *
 * OCR adapters pass recognised text from platform-native engines into this
 * pure parser. No image bytes or extracted receipt text are transmitted.
 */

import { bankersRound } from './utils';

/** A category available for rule-based split suggestions. */
export interface ReceiptCategoryOption {
  readonly id: string;
  readonly name: string;
}

/** One itemized receipt line with an optional category proposal. */
export interface ExtractedReceiptLineItem {
  readonly description: string;
  readonly total: number;
  readonly quantity: number | null;
  readonly suggestedCategory: string | null;
  readonly suggestedCategoryId: string | null;
  readonly categoryAccepted: boolean;
}

/** Standard receipt OCR output shared by every platform adapter. */
export interface ExtractedReceiptText {
  readonly merchant: string | null;
  /** ISO 8601 local date (YYYY-MM-DD). */
  readonly date: string | null;
  /** Receipt total in cents. */
  readonly total: number | null;
  readonly currency: string | null;
  readonly lineItems: readonly ExtractedReceiptLineItem[];
  /** Raw OCR text. Serialises to `raw_text` across native bridge payloads. */
  readonly rawText: string;
  /** Confidence as a percentage from 0 to 100. */
  readonly confidence: number;
}

const TOTAL_LABEL = /\b(total|amount\s+due|balance\s+due|grand\s+total)\b/i;
const NON_ITEM_LABEL = /\b(sub\s*-?\s*total|tax|tip|change|cash|card)\b/i;
const AMOUNT_AT_END = /(?<!\d)([$€£¥]?\s*-?\d{1,4}(?:,\d{3})*\.\d{2})\s*$/;
const DATE_PATTERNS = [
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/,
];

const CATEGORY_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Groceries', ['apple', 'banana', 'milk', 'bread', 'grocery', 'produce', 'eggs']],
  ['Restaurants', ['burger', 'coffee', 'latte', 'pizza', 'sandwich', 'taco']],
  ['Transportation', ['fuel', 'gas', 'diesel', 'parking', 'transit']],
  ['Household', ['soap', 'detergent', 'paper', 'towel', 'cleaner']],
  ['Healthcare', ['pharmacy', 'medicine', 'rx', 'vitamin']],
  ['Shopping', ['shirt', 'book', 'toy', 'electronics', 'home']],
];

/** Parses raw on-device OCR text into the shared receipt contract. */
export function parseReceiptText(
  rawText: string,
  options: {
    readonly ocrConfidence?: number;
    readonly categories?: readonly ReceiptCategoryOption[];
  } = {},
): ExtractedReceiptText {
  const lines = normaliseLines(rawText);
  const merchant = extractMerchant(lines);
  const date = extractDate(rawText);
  const total = extractTotal(lines);
  const currency = extractCurrency(rawText);
  const lineItems = extractLineItems(lines, options.categories ?? [], total);
  const confidence =
    normaliseConfidence(options.ocrConfidence) ??
    estimateConfidence({ merchant, date, total, lineItems });

  return {
    merchant,
    date,
    total,
    currency,
    lineItems,
    rawText,
    confidence,
  };
}

/** Returns the first rule-based category name matching a receipt line. */
export function suggestReceiptCategory(text: string): string | null {
  const normalised = text.toLowerCase();
  const match = CATEGORY_RULES.find(([, keywords]) =>
    keywords.some((keyword) => normalised.includes(keyword)),
  );
  return match?.[0] ?? null;
}

function normaliseLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);
}

function extractMerchant(lines: readonly string[]): string | null {
  const merchant = lines.find(
    (line) =>
      !TOTAL_LABEL.test(line) &&
      !NON_ITEM_LABEL.test(line) &&
      parseAmount(line) === null &&
      extractDate(line) === null,
  );
  return merchant?.slice(0, 80) ?? null;
}

function extractTotal(lines: readonly string[]): number | null {
  for (const line of [...lines].reverse()) {
    if (TOTAL_LABEL.test(line)) {
      const amount = parseAmount(line);
      if (amount !== null) return amount;
    }
  }

  const amounts = lines.map(parseAmount).filter((amount): amount is number => amount !== null);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function extractLineItems(
  lines: readonly string[],
  categories: readonly ReceiptCategoryOption[],
  receiptTotal: number | null,
): ExtractedReceiptLineItem[] {
  return lines.flatMap((line) => {
    const match = line.match(AMOUNT_AT_END);
    if (match === null || TOTAL_LABEL.test(line) || NON_ITEM_LABEL.test(line)) return [];

    const amount = parseAmount(match[0]);
    const description = line
      .slice(0, match.index)
      .trim()
      .replace(/[ .-]+$/, '');
    if (amount === null || amount === receiptTotal || description.length < 2) return [];

    const suggestedCategory = suggestReceiptCategory(description);
    const suggestedCategoryId = mapCategoryId(suggestedCategory, categories);

    return [
      {
        description,
        total: amount,
        quantity: extractQuantity(description),
        suggestedCategory,
        suggestedCategoryId,
        categoryAccepted: false,
      },
    ];
  });
}

function extractDate(text: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match === null) continue;

    if (match[1].length === 4) {
      return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    const parsedYear = Number(match[3]);
    const year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    return toIsoDate(year, Number(match[1]), Number(match[2]));
  }
  return null;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null;
  return date.toISOString().slice(0, 10);
}

function extractCurrency(text: string): string | null {
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('¥')) return 'JPY';
  if (text.includes('$')) return 'USD';
  return null;
}

function parseAmount(text: string): number | null {
  const source = text.match(AMOUNT_AT_END)?.[0] ?? text;
  const normalised = source
    .replace(/[^\d.,-]/g, '')
    .replaceAll(',', '')
    .trim();
  if (!normalised.includes('.')) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? Math.abs(bankersRound(value * 100)) : null;
}

function extractQuantity(description: string): number | null {
  const match = description.match(/\b(\d+(?:\.\d+)?)\s*(x|qty|ct)\b/i);
  return match?.[1] === undefined ? null : Number(match[1]);
}

function mapCategoryId(
  suggestedCategory: string | null,
  categories: readonly ReceiptCategoryOption[],
): string | null {
  if (suggestedCategory === null) return null;
  const normalised = suggestedCategory.toLowerCase();
  const exact = categories.find((category) => category.name.toLowerCase() === normalised);
  return exact?.id ?? null;
}

function normaliseConfidence(confidence: number | undefined): number | null {
  if (confidence === undefined) return null;
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return Math.min(100, Math.max(0, percent));
}

function estimateConfidence(input: {
  readonly merchant: string | null;
  readonly date: string | null;
  readonly total: number | null;
  readonly lineItems: readonly ExtractedReceiptLineItem[];
}): number {
  return (
    (input.merchant === null ? 0 : 30) +
    (input.date === null ? 0 : 20) +
    (input.total === null ? 0 : 30) +
    (input.lineItems.length === 0 ? 0 : 20)
  );
}
