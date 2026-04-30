// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseTransactionText } from '../useNaturalLanguageInput';

describe('parseTransactionText', () => {
  it('returns empty result for empty string', () => {
    const result = parseTransactionText('');

    expect(result.payee).toBeNull();
    expect(result.amountCents).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('parses "Coffee at Starbucks $4.50"', () => {
    const result = parseTransactionText('Coffee at Starbucks $4.50');

    expect(result.amountCents).toBe(450);
    expect(result.payee).toBe('Starbucks');
    expect(result.category).toBe('Dining');
    expect(result.type).toBe('EXPENSE');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('parses "$25 groceries at Walmart"', () => {
    const result = parseTransactionText('$25 groceries at Walmart');

    expect(result.amountCents).toBe(2500);
    expect(result.payee).toBe('Walmart');
    expect(result.category).toBe('Groceries');
    expect(result.type).toBe('EXPENSE');
  });

  it('parses "Lunch 12.99"', () => {
    const result = parseTransactionText('Lunch 12.99');

    expect(result.amountCents).toBe(1299);
    expect(result.category).toBe('Dining');
    expect(result.type).toBe('EXPENSE');
  });

  it('detects income type', () => {
    const result = parseTransactionText('Income $3000 salary');

    expect(result.amountCents).toBe(300000);
    expect(result.type).toBe('INCOME');
  });

  it('detects transfer type', () => {
    const result = parseTransactionText('Transfer $500 to savings');

    expect(result.amountCents).toBe(50000);
    expect(result.type).toBe('TRANSFER');
  });

  it('parses date from "Gas $45.00 01/15"', () => {
    const result = parseTransactionText('Gas $45.00 01/15');

    expect(result.amountCents).toBe(4500);
    expect(result.category).toBe('Transportation');
    expect(result.date).toMatch(/^\d{4}-01-15$/);
  });

  it('handles amounts with commas', () => {
    const result = parseTransactionText('Rent $1,500.00');

    expect(result.amountCents).toBe(150000);
    expect(result.category).toBe('Housing');
  });

  it('detects entertainment category', () => {
    const result = parseTransactionText('Netflix $15.99');

    expect(result.amountCents).toBe(1599);
    expect(result.category).toBe('Entertainment');
  });

  it('detects utilities category', () => {
    const result = parseTransactionText('Electric bill $120.00');

    expect(result.amountCents).toBe(12000);
    expect(result.category).toBe('Utilities');
  });

  it('parses date with year', () => {
    const result = parseTransactionText('Grocery $50 01/15/2025');

    expect(result.date).toBe('2025-01-15');
  });

  it('caps confidence at 1.0', () => {
    const result = parseTransactionText('Coffee at Starbucks $4.50 01/15/2025');

    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});
