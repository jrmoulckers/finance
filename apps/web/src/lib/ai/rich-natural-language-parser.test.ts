// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseRichNaturalLanguageTransaction } from './rich-natural-language-parser';

const BASE = new Date('2025-03-12T10:00:00');

describe('parseRichNaturalLanguageTransaction', () => {
  it('preserves simple amount and merchant parsing', () => {
    const parsed = parseRichNaturalLanguageTransaction('coffee at starbucks $5.50', {
      baseDate: BASE,
    });

    expect(parsed.amount).toBe(5.5);
    expect(parsed.payee).toBe('Starbucks');
    expect(parsed.date).toBe('2025-03-12');
    expect(parsed.type).toBe('EXPENSE');
    expect(parsed.categoryHints).toContain('coffee');
  });

  it('supports relative dates including yesterday, last Friday, and next payday', () => {
    expect(
      parseRichNaturalLanguageTransaction('groceries $30 yesterday', { baseDate: BASE }).date,
    ).toBe('2025-03-11');
    expect(
      parseRichNaturalLanguageTransaction('dinner $20 last friday', { baseDate: BASE }).date,
    ).toBe('2025-03-07');
    expect(
      parseRichNaturalLanguageTransaction('salary $2000 next payday', {
        baseDate: BASE,
        paydayDay: 15,
      }).date,
    ).toBe('2025-03-15');
  });

  it('uses locale-aware slash date ordering', () => {
    expect(
      parseRichNaturalLanguageTransaction('lunch 05/04/2025 $12', {
        baseDate: BASE,
        locale: 'en-US',
      }).date,
    ).toBe('2025-05-04');
    expect(
      parseRichNaturalLanguageTransaction('lunch 05/04/2025 $12', {
        baseDate: BASE,
        locale: 'en-GB',
      }).date,
    ).toBe('2025-04-05');
  });

  it('separates notes, category hints, and payee', () => {
    const parsed = parseRichNaturalLanguageTransaction(
      'paid $48.20 at Whole Foods for groceries note: dinner party supplies',
      { baseDate: BASE },
    );

    expect(parsed.payee).toBe('Whole Foods');
    expect(parsed.categoryHints).toContain('groceries');
    expect(parsed.note).toBe('dinner party supplies');
  });

  it('parses split transactions with a validated remainder candidate', () => {
    const parsed = parseRichNaturalLanguageTransaction('Costco $90 groceries $30 gas', {
      baseDate: BASE,
    });

    expect(parsed.amount).toBe(90);
    expect(parsed.payee).toBe('Costco');
    expect(parsed.splits).toEqual([
      { label: 'groceries', amount: 30, confidence: 0.82 },
      { label: 'gas', amount: 60, confidence: 0.7 },
    ]);
    expect(parsed.fieldConfidence.splits).toBeGreaterThan(0.7);
  });

  it('detects transfer and income intent with account hints', () => {
    const transfer = parseRichNaturalLanguageTransaction('transfer $200 from checking to savings', {
      baseDate: BASE,
    });
    const income = parseRichNaturalLanguageTransaction('paycheck deposit $2500 next payday', {
      baseDate: BASE,
    });

    expect(transfer.type).toBe('TRANSFER');
    expect(transfer.accountHints).toEqual(['Checking', 'Savings']);
    expect(transfer.fieldConfidence.type).toBeGreaterThan(0.8);
    expect(income.type).toBe('INCOME');
  });
});
