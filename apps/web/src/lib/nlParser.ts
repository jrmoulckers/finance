// SPDX-License-Identifier: BUSL-1.1

/**
 * Natural language transaction parser.
 *
 * Parses free-text input like:
 *   "coffee at starbucks $5.50"
 *   "$42.99 groceries at whole foods yesterday"
 *   "lunch 15.00 today"
 *   "salary income $5000"
 *   "transfer 200 to savings"
 *
 * Extracts: amount, payee, date, type, and optional category hints.
 *
 * Pure function — no side effects, fully testable.
 *
 * References: issue #322
 */

import type { TransactionType } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of parsing a natural language transaction input. */
export interface ParsedTransaction {
  /** Extracted monetary amount in dollars (NOT cents). `null` if no amount found. */
  amount: number | null;
  /** Extracted payee or description. */
  payee: string;
  /** Extracted date as ISO local date string, or today. */
  date: string;
  /** Inferred transaction type. */
  type: TransactionType;
  /** Category hint extracted from keywords (e.g. "food", "transport"). */
  categoryHint: string | null;
  /** Confidence score (0-1) indicating parse quality. */
  confidence: number;
  /** The original raw input. */
  rawInput: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getToday(): string {
  return formatLocalDate(new Date());
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
}

// Relative date keywords
const DATE_KEYWORDS: Record<string, () => string> = {
  today: getToday,
  yesterday: getYesterday,
  now: getToday,
};

// Date patterns: "jan 15", "1/15", "2025-01-15", "01/15/2025"
const DATE_PATTERNS: Array<{ regex: RegExp; parse: (match: RegExpMatchArray) => string | null }> = [
  {
    // ISO: 2025-01-15
    regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
    parse: (m) => {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
  {
    // US: 01/15/2025 or 1/15/25
    regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/,
    parse: (m) => {
      const month = Number(m[1]);
      const day = Number(m[2]);
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
  {
    // Short: Jan 15, January 15
    regex:
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i,
    parse: (m) => {
      const months: Record<string, number> = {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12,
      };
      const prefix = m[1].toLowerCase().slice(0, 3);
      const month = months[prefix];
      const day = Number(m[2]);
      if (month && day >= 1 && day <= 31) {
        const year = new Date().getFullYear();
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Amount patterns
// ---------------------------------------------------------------------------

// $5.50, $5,500.00, 5.50, 42.99
const AMOUNT_REGEX = /\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/;

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

const INCOME_KEYWORDS = new Set([
  'salary',
  'income',
  'paycheck',
  'payment',
  'refund',
  'reimbursement',
  'dividend',
  'interest',
  'bonus',
  'freelance',
  'deposit',
]);

const TRANSFER_KEYWORDS = new Set(['transfer', 'moved', 'move', 'sent', 'send']);

// ---------------------------------------------------------------------------
// Category hints
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: [
    'coffee',
    'lunch',
    'dinner',
    'breakfast',
    'groceries',
    'restaurant',
    'food',
    'meal',
    'cafe',
    'pizza',
    'burger',
    'sushi',
    'bakery',
  ],
  transport: [
    'uber',
    'lyft',
    'taxi',
    'gas',
    'fuel',
    'parking',
    'bus',
    'train',
    'metro',
    'subway',
    'transit',
  ],
  shopping: ['amazon', 'walmart', 'target', 'costco', 'store', 'mall', 'clothes', 'shoes'],
  entertainment: ['netflix', 'spotify', 'movie', 'cinema', 'concert', 'game', 'subscription'],
  utilities: ['electric', 'water', 'internet', 'phone', 'utility', 'bill'],
  health: ['pharmacy', 'doctor', 'dental', 'medical', 'gym', 'fitness', 'health'],
  housing: ['rent', 'mortgage', 'insurance', 'maintenance'],
};

function inferCategoryHint(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a natural language string into a structured transaction.
 *
 * @param input - Free-text transaction description.
 * @returns Parsed transaction with extracted fields and confidence score.
 */
export function parseNaturalLanguageTransaction(input: string): ParsedTransaction {
  const raw = input.trim();
  if (!raw) {
    return {
      amount: null,
      payee: '',
      date: getToday(),
      type: 'EXPENSE',
      categoryHint: null,
      confidence: 0,
      rawInput: raw,
    };
  }

  let remaining = raw;
  let confidence = 0.3; // Base confidence for any non-empty input

  // --- Extract amount ---
  let amount: number | null = null;
  const amountMatch = remaining.match(AMOUNT_REGEX);
  if (amountMatch) {
    const cleaned = amountMatch[1].replace(/,/g, '');
    amount = parseFloat(cleaned);
    if (!Number.isNaN(amount) && amount > 0) {
      confidence += 0.3;
      remaining = remaining.replace(amountMatch[0], ' ').trim();
    } else {
      amount = null;
    }
  }

  // --- Extract date ---
  let date = getToday();
  let dateFound = false;

  // Check relative keywords first
  for (const [keyword, getDate] of Object.entries(DATE_KEYWORDS)) {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (keywordRegex.test(remaining)) {
      date = getDate();
      remaining = remaining.replace(keywordRegex, ' ').trim();
      dateFound = true;
      confidence += 0.1;
      break;
    }
  }

  // Then check date patterns
  if (!dateFound) {
    for (const pattern of DATE_PATTERNS) {
      const match = remaining.match(pattern.regex);
      if (match) {
        const parsed = pattern.parse(match);
        if (parsed) {
          date = parsed;
          remaining = remaining.replace(match[0], ' ').trim();
          confidence += 0.1;
          break;
        }
      }
    }
  }

  // --- Infer type ---
  let type: TransactionType = 'EXPENSE';
  const words = remaining.toLowerCase().split(/\s+/);

  for (const word of words) {
    if (INCOME_KEYWORDS.has(word)) {
      type = 'INCOME';
      confidence += 0.1;
      break;
    }
    if (TRANSFER_KEYWORDS.has(word)) {
      type = 'TRANSFER';
      confidence += 0.1;
      break;
    }
  }

  // --- Extract category hint ---
  const categoryHint = inferCategoryHint(remaining);
  if (categoryHint) {
    confidence += 0.1;
  }

  // --- Clean up payee ---
  // Remove common filler words
  let payee = remaining
    .replace(/\b(at|for|from|to|on|in|the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter of each word
  payee = payee.replace(/\b\w/g, (c) => c.toUpperCase());

  if (payee.length > 0) {
    confidence += 0.1;
  }

  return {
    amount,
    payee,
    date,
    type,
    categoryHint,
    confidence: Math.min(confidence, 1),
    rawInput: raw,
  };
}
