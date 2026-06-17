// SPDX-License-Identifier: BUSL-1.1

/**
 * Built-in categorization rules mapping merchant name patterns to categories.
 *
 * Each rule set maps a canonical category name to an array of keyword patterns.
 * Pattern matching is always case-insensitive; the engine normalises input
 * before comparing against these patterns.
 *
 * @module lib/categorization/rules
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single built-in rule mapping keywords to a category name. */
export interface BuiltinRule {
  /** Human-readable category name (must match a real category in the database). */
  readonly categoryName: string;
  /** Lower-case keywords/substrings that identify this category in a merchant name. */
  readonly keywords: readonly string[];
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export const BUILTIN_RULES: readonly BuiltinRule[] = [
  {
    categoryName: 'Groceries',
    keywords: [
      'walmart',
      'costco',
      'kroger',
      'whole foods',
      'trader joe',
      'aldi',
      'safeway',
      'publix',
      'h-e-b',
      'wegmans',
    ],
  },
  {
    categoryName: 'Dining',
    keywords: [
      'mcdonald',
      'starbucks',
      'chipotle',
      'doordash',
      'uber eats',
      'grubhub',
      'subway',
      'chick-fil-a',
      'panera',
      'taco bell',
      'wendy',
      'burger king',
      'pizza hut',
      'domino',
    ],
  },
  {
    categoryName: 'Transportation',
    keywords: [
      'shell',
      'chevron',
      'exxon',
      'bp',
      'speedway',
      'sunoco',
      'marathon',
      'circle k',
      'wawa gas',
      'uber ride',
      'lyft',
    ],
  },
  {
    categoryName: 'Utilities',
    keywords: [
      'electric',
      'water',
      'gas bill',
      'internet',
      'comcast',
      'at&t',
      'verizon',
      'spectrum',
      'xfinity',
      'power bill',
      'sewage',
    ],
  },
  {
    categoryName: 'Entertainment',
    keywords: [
      'netflix',
      'spotify',
      'hulu',
      'disney+',
      'amazon prime',
      'hbo max',
      'apple tv',
      'youtube premium',
      'paramount+',
      'peacock',
    ],
  },
  {
    categoryName: 'Healthcare',
    keywords: [
      'pharmacy',
      'cvs',
      'walgreens',
      'doctor',
      'hospital',
      'dentist',
      'urgent care',
      'clinic',
      'optometrist',
      'rite aid',
    ],
  },
  {
    categoryName: 'Shopping',
    keywords: [
      'amazon',
      'target',
      'best buy',
      'apple.com',
      'ebay',
      'etsy',
      'nordstrom',
      'home depot',
      'ikea',
      'lowes',
    ],
  },
] as const;

/**
 * Find the first built-in rule whose keywords contain an exact match for
 * the given keyword (lower-cased).
 */
export function findExactBuiltinMatch(normalisedDescription: string): BuiltinRule | null {
  for (const rule of BUILTIN_RULES) {
    for (const keyword of rule.keywords) {
      if (normalisedDescription === keyword) {
        return rule;
      }
    }
  }
  return null;
}

/**
 * Find the first built-in rule that has a keyword appearing as a substring
 * inside the given description (already lower-cased).
 */
export function findPartialBuiltinMatch(normalisedDescription: string): BuiltinRule | null {
  for (const rule of BUILTIN_RULES) {
    for (const keyword of rule.keywords) {
      if (normalisedDescription.includes(keyword)) {
        return rule;
      }
    }
  }
  return null;
}
