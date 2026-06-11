// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseVoiceTransaction } from './transactionParser';

describe('parseVoiceTransaction', () => {
  it('parses spoken expense transactions with merchants and categories', () => {
    const parsed = parseVoiceTransaction('Spent $45 at Whole Foods on groceries', {
      now: new Date('2026-06-11T12:00:00Z'),
    });

    expect(parsed.intent).toBe('expense');
    expect(parsed.type).toBe('EXPENSE');
    expect(parsed.amountCents).toBe(4500);
    expect(parsed.payee).toBe('Whole Foods');
    expect(parsed.category).toBe('Groceries');
    expect(parsed.missingFields).toEqual([]);
  });

  it('parses income phrases with source and relative dates', () => {
    const parsed = parseVoiceTransaction('Received 1800 from payroll yesterday', {
      now: new Date('2026-06-11T12:00:00Z'),
    });

    expect(parsed.intent).toBe('income');
    expect(parsed.type).toBe('INCOME');
    expect(parsed.amountCents).toBe(180000);
    expect(parsed.payee).toBe('Payroll');
    expect(parsed.date).toBe('2026-06-10');
  });

  it('parses transfer phrases and extracts the destination account', () => {
    const parsed = parseVoiceTransaction('Transferred 250 to savings on 06/01', {
      now: new Date('2026-06-11T12:00:00Z'),
    });

    expect(parsed.intent).toBe('transfer');
    expect(parsed.type).toBe('TRANSFER');
    expect(parsed.amountCents).toBe(25000);
    expect(parsed.transferAccount).toBe('Savings');
    expect(parsed.payee).toBe('Transfer to Savings');
    expect(parsed.date).toBe('2026-06-01');
  });

  it('parses split expenses and preserves the counterparty', () => {
    const parsed = parseVoiceTransaction('Split 64 with Alex at dinner', {
      now: new Date('2026-06-11T12:00:00Z'),
    });

    expect(parsed.intent).toBe('split');
    expect(parsed.type).toBe('EXPENSE');
    expect(parsed.amountCents).toBe(6400);
    expect(parsed.splitWith).toBe('Alex');
    expect(parsed.payee).toBe('Dinner');
    expect(parsed.category).toBe('Dining');
    expect(parsed.note).toContain('Alex');
  });

  it('flags missing required fields when speech is incomplete', () => {
    const parsed = parseVoiceTransaction('Paid for lunch', {
      now: new Date('2026-06-11T12:00:00Z'),
    });

    expect(parsed.amountCents).toBeNull();
    expect(parsed.payee).toBe('Lunch');
    expect(parsed.missingFields).toContain('amount');
    expect(parsed.confidence).toBeLessThan(1);
  });
});
