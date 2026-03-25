// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '../../../kmp/bridge';
import { suggestCategory } from '../categorization-engine';
import { clearLearnedRules, learnFromCorrection } from '../user-rules';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeCat(id: string, name: string): Category {
  return {
    id,
    householdId: 'hh-1',
    name,
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
    ...syncMetadata,
  };
}

const categories: Category[] = [
  makeCat('cat-groceries', 'Groceries'),
  makeCat('cat-dining', 'Dining'),
  makeCat('cat-transport', 'Transportation'),
  makeCat('cat-utilities', 'Utilities'),
  makeCat('cat-entertainment', 'Entertainment'),
  makeCat('cat-healthcare', 'Healthcare'),
  makeCat('cat-shopping', 'Shopping'),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('categorization-engine', () => {
  beforeEach(() => {
    clearLearnedRules();
  });

  // -----------------------------------------------------------------------
  // Known merchant → correct category
  // -----------------------------------------------------------------------

  it('matches "walmart" to Groceries', () => {
    const result = suggestCategory('walmart', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Groceries');
    expect(result!.categoryId).toBe('cat-groceries');
  });

  it('matches "starbucks" to Dining', () => {
    const result = suggestCategory('starbucks', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Dining');
  });

  it('matches "chevron" to Transportation', () => {
    const result = suggestCategory('chevron', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Transportation');
  });

  it('matches "netflix" to Entertainment', () => {
    const result = suggestCategory('netflix', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Entertainment');
  });

  it('matches "cvs" to Healthcare', () => {
    const result = suggestCategory('cvs', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Healthcare');
  });

  it('matches "amazon" to Shopping', () => {
    const result = suggestCategory('amazon', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Shopping');
  });

  it('matches "comcast" to Utilities', () => {
    const result = suggestCategory('comcast', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Utilities');
  });

  // -----------------------------------------------------------------------
  // Case-insensitive matching
  // -----------------------------------------------------------------------

  it('matches case-insensitively: "WALMART" → Groceries', () => {
    const result = suggestCategory('WALMART', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Groceries');
  });

  it('matches case-insensitively: "Starbucks" → Dining', () => {
    const result = suggestCategory('Starbucks', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Dining');
  });

  it('matches mixed case: "NeTfLiX" → Entertainment', () => {
    const result = suggestCategory('NeTfLiX', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Entertainment');
  });

  // -----------------------------------------------------------------------
  // Partial / substring matching
  // -----------------------------------------------------------------------

  it('partial matches "Walmart Supercenter" → Groceries', () => {
    const result = suggestCategory('Walmart Supercenter', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Groceries');
    expect(result!.source).toBe('builtin');
  });

  it('partial matches "STARBUCKS COFFEE #12345" → Dining', () => {
    const result = suggestCategory('STARBUCKS COFFEE #12345', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Dining');
  });

  it('partial matches "Amazon.com*ABC123" → Shopping', () => {
    const result = suggestCategory('Amazon.com*ABC123', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Shopping');
  });

  it('partial matches "CHEVRON GAS STATION 456" → Transportation', () => {
    const result = suggestCategory('CHEVRON GAS STATION 456', categories);
    expect(result).not.toBeNull();
    expect(result!.categoryName).toBe('Transportation');
  });

  // -----------------------------------------------------------------------
  // Unknown merchants
  // -----------------------------------------------------------------------

  it('returns null for an unknown merchant without amount', () => {
    const result = suggestCategory('Random Store XYZ', categories);
    expect(result).toBeNull();
  });

  it('returns null for an empty description', () => {
    const result = suggestCategory('', categories);
    expect(result).toBeNull();
  });

  it('returns null for whitespace-only description', () => {
    const result = suggestCategory('   ', categories);
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Confidence scoring
  // -----------------------------------------------------------------------

  it('exact match has higher confidence than partial match', () => {
    const exact = suggestCategory('walmart', categories);
    const partial = suggestCategory('Walmart Supercenter #1234', categories);

    expect(exact).not.toBeNull();
    expect(partial).not.toBeNull();
    expect(exact!.confidence).toBeGreaterThan(partial!.confidence);
  });

  it('confidence is between 0 and 1', () => {
    const result = suggestCategory('walmart', categories);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('amount-based heuristic produces low confidence', () => {
    // No merchant match, but small amount suggests Dining
    const result = suggestCategory('Mystery Lunch Place', categories, 1200);
    // Might be null or low confidence depending on match
    if (result) {
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    }
  });

  // -----------------------------------------------------------------------
  // User rules override built-in
  // -----------------------------------------------------------------------

  it('user-learned rule overrides built-in match', () => {
    // "amazon" normally maps to Shopping
    const before = suggestCategory('amazon', categories);
    expect(before!.categoryName).toBe('Shopping');

    // User corrects to Groceries
    learnFromCorrection('amazon', 'cat-groceries');

    const after = suggestCategory('amazon', categories);
    expect(after).not.toBeNull();
    expect(after!.categoryId).toBe('cat-groceries');
    expect(after!.source).toBe('user');
    expect(after!.confidence).toBe(0.95);
  });

  // -----------------------------------------------------------------------
  // Source tagging
  // -----------------------------------------------------------------------

  it('built-in exact match has source "builtin"', () => {
    const result = suggestCategory('walmart', categories);
    expect(result!.source).toBe('builtin');
  });

  it('partial match has source "builtin"', () => {
    const result = suggestCategory('Walmart Supercenter', categories);
    expect(result!.source).toBe('builtin');
  });

  it('user rule has source "user"', () => {
    learnFromCorrection('my local store', 'cat-groceries');
    const result = suggestCategory('my local store', categories);
    expect(result!.source).toBe('user');
  });
});
