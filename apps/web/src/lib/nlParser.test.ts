// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { parseNaturalLanguageTransaction } from './nlParser';

describe('parseNaturalLanguageTransaction', () => {
  describe('amount extraction', () => {
    it('extracts dollar amount with $ symbol', () => {
      const result = parseNaturalLanguageTransaction('coffee $5.50');
      expect(result.amount).toBe(5.5);
    });

    it('extracts amount without $ symbol', () => {
      const result = parseNaturalLanguageTransaction('lunch 15.00');
      expect(result.amount).toBe(15);
    });

    it('extracts amount with commas', () => {
      const result = parseNaturalLanguageTransaction('salary $5,000.00');
      expect(result.amount).toBe(5000);
    });

    it('extracts integer amount', () => {
      const result = parseNaturalLanguageTransaction('groceries $42');
      expect(result.amount).toBe(42);
    });

    it('returns null amount for no-amount input', () => {
      const result = parseNaturalLanguageTransaction('just a note');
      expect(result.amount).toBeNull();
    });
  });

  describe('payee extraction', () => {
    it('extracts payee from simple input', () => {
      const result = parseNaturalLanguageTransaction('coffee at starbucks $5.50');
      expect(result.payee.toLowerCase()).toContain('starbucks');
    });

    it('extracts payee removing filler words', () => {
      const result = parseNaturalLanguageTransaction('lunch at the restaurant $25');
      expect(result.payee).not.toMatch(/\b(at|the)\b/i);
    });

    it('capitalizes payee words', () => {
      const result = parseNaturalLanguageTransaction('whole foods $42.99');
      expect(result.payee).toMatch(/^[A-Z]/);
    });
  });

  describe('date extraction', () => {
    it('parses "today" keyword', () => {
      const result = parseNaturalLanguageTransaction('coffee $5.50 today');
      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result.date).toBe(expected);
    });

    it('parses "yesterday" keyword', () => {
      const result = parseNaturalLanguageTransaction('lunch $15 yesterday');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expected = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(result.date).toBe(expected);
    });

    it('parses ISO date format', () => {
      const result = parseNaturalLanguageTransaction('groceries $50 2025-03-15');
      expect(result.date).toBe('2025-03-15');
    });

    it('parses US date format', () => {
      const result = parseNaturalLanguageTransaction('rent $1500 01/15/2025');
      expect(result.date).toBe('2025-01-15');
    });

    it('defaults to today when no date found', () => {
      const result = parseNaturalLanguageTransaction('coffee $5.50');
      const today = new Date();
      const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result.date).toBe(expected);
    });
  });

  describe('type inference', () => {
    it('defaults to EXPENSE', () => {
      const result = parseNaturalLanguageTransaction('coffee $5.50');
      expect(result.type).toBe('EXPENSE');
    });

    it('infers INCOME from salary keyword', () => {
      const result = parseNaturalLanguageTransaction('salary $5000');
      expect(result.type).toBe('INCOME');
    });

    it('infers INCOME from refund keyword', () => {
      const result = parseNaturalLanguageTransaction('refund $25');
      expect(result.type).toBe('INCOME');
    });

    it('infers TRANSFER from transfer keyword', () => {
      const result = parseNaturalLanguageTransaction('transfer $200 to savings');
      expect(result.type).toBe('TRANSFER');
    });
  });

  describe('category hints', () => {
    it('detects food category from coffee', () => {
      const result = parseNaturalLanguageTransaction('coffee $5');
      expect(result.categoryHint).toBe('food');
    });

    it('detects transport category from uber', () => {
      const result = parseNaturalLanguageTransaction('uber ride $15');
      expect(result.categoryHint).toBe('transport');
    });

    it('detects entertainment category from netflix', () => {
      const result = parseNaturalLanguageTransaction('netflix $15.99');
      expect(result.categoryHint).toBe('entertainment');
    });

    it('returns null for unknown categories', () => {
      const result = parseNaturalLanguageTransaction('something random $10');
      expect(result.categoryHint).toBeNull();
    });
  });

  describe('confidence scoring', () => {
    it('returns 0 confidence for empty input', () => {
      const result = parseNaturalLanguageTransaction('');
      expect(result.confidence).toBe(0);
    });

    it('returns higher confidence with amount + payee', () => {
      const result = parseNaturalLanguageTransaction('coffee at starbucks $5.50');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('returns highest confidence with amount + date + category', () => {
      const result = parseNaturalLanguageTransaction('coffee at starbucks $5.50 today');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('edge cases', () => {
    it('handles input with only whitespace', () => {
      const result = parseNaturalLanguageTransaction('   ');
      expect(result.amount).toBeNull();
      expect(result.payee).toBe('');
    });

    it('preserves rawInput', () => {
      const input = 'coffee at starbucks $5.50';
      const result = parseNaturalLanguageTransaction(input);
      expect(result.rawInput).toBe(input);
    });

    it('handles $ with space before amount', () => {
      const result = parseNaturalLanguageTransaction('coffee $ 5.50');
      expect(result.amount).toBe(5.5);
    });
  });
});
