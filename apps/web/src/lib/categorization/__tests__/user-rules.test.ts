// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearLearnedRules,
  findUserRule,
  learnFromCorrection,
  loadUserRules,
  saveUserRules,
} from '../user-rules';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('user-rules', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // learnFromCorrection
  // -----------------------------------------------------------------------

  it('learns a correction and stores it', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    const rules = loadUserRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.merchant).toBe('walmart');
    expect(rules[0]!.categoryId).toBe('cat-groceries');
  });

  it('normalises the merchant name before storing', () => {
    learnFromCorrection('  WALMART  SUPERCENTER  ', 'cat-groceries');
    const rules = loadUserRules();
    expect(rules[0]!.merchant).toBe('walmart supercenter');
  });

  it('updates an existing rule for the same merchant', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    learnFromCorrection('walmart', 'cat-shopping');

    const rules = loadUserRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.categoryId).toBe('cat-shopping');
  });

  it('stores multiple rules for different merchants', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    learnFromCorrection('starbucks', 'cat-dining');
    learnFromCorrection('netflix', 'cat-entertainment');

    const rules = loadUserRules();
    expect(rules).toHaveLength(3);
  });

  it('ignores empty description', () => {
    learnFromCorrection('', 'cat-groceries');
    learnFromCorrection('   ', 'cat-groceries');
    expect(loadUserRules()).toHaveLength(0);
  });

  it('records learnedAt timestamp', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    const rules = loadUserRules();
    const iso = rules[0]!.learnedAt;
    expect(new Date(iso).getTime()).not.toBeNaN();
  });

  // -----------------------------------------------------------------------
  // User rules override built-in
  // -----------------------------------------------------------------------

  it('findUserRule returns the learned rule', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    const rule = findUserRule('walmart');
    expect(rule).not.toBeNull();
    expect(rule!.categoryId).toBe('cat-groceries');
  });

  it('findUserRule matches case-insensitively', () => {
    learnFromCorrection('Walmart', 'cat-groceries');
    const rule = findUserRule('WALMART');
    expect(rule).not.toBeNull();
    expect(rule!.categoryId).toBe('cat-groceries');
  });

  it('findUserRule returns null for unknown merchant', () => {
    const rule = findUserRule('unknown merchant');
    expect(rule).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Persistence (localStorage)
  // -----------------------------------------------------------------------

  it('persists to localStorage', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    const raw = localStorage.getItem('finance-user-categorization-rules');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].merchant).toBe('walmart');
  });

  it('loads from localStorage on startup', () => {
    // Manually seed localStorage
    const rules = [
      { merchant: 'target', categoryId: 'cat-shopping', learnedAt: '2025-01-01T00:00:00Z' },
    ];
    localStorage.setItem('finance-user-categorization-rules', JSON.stringify(rules));

    const loaded = loadUserRules();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.merchant).toBe('target');
    expect(loaded[0]!.categoryId).toBe('cat-shopping');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('finance-user-categorization-rules', 'not valid json!!!');
    const loaded = loadUserRules();
    expect(loaded).toEqual([]);
  });

  it('handles non-array localStorage data gracefully', () => {
    localStorage.setItem('finance-user-categorization-rules', '"just a string"');
    const loaded = loadUserRules();
    expect(loaded).toEqual([]);
  });

  it('filters out malformed entries from localStorage', () => {
    const data = [
      { merchant: 'valid', categoryId: 'cat-1', learnedAt: '2025-01-01T00:00:00Z' },
      { merchant: 123, categoryId: 'cat-2', learnedAt: '2025-01-01T00:00:00Z' }, // bad: merchant not string
      { categoryId: 'cat-3', learnedAt: '2025-01-01T00:00:00Z' }, // bad: no merchant
      null,
    ];
    localStorage.setItem('finance-user-categorization-rules', JSON.stringify(data));

    const loaded = loadUserRules();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.merchant).toBe('valid');
  });

  // -----------------------------------------------------------------------
  // clearLearnedRules
  // -----------------------------------------------------------------------

  it('clearLearnedRules removes all rules', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    learnFromCorrection('starbucks', 'cat-dining');
    expect(loadUserRules()).toHaveLength(2);

    clearLearnedRules();
    expect(loadUserRules()).toHaveLength(0);
  });

  it('clearLearnedRules removes the localStorage key', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    clearLearnedRules();
    expect(localStorage.getItem('finance-user-categorization-rules')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // saveUserRules
  // -----------------------------------------------------------------------

  it('saveUserRules overwrites all rules', () => {
    learnFromCorrection('walmart', 'cat-groceries');
    saveUserRules([]);
    expect(loadUserRules()).toHaveLength(0);
  });
});
