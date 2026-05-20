// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for sweep rule engine.
 *
 * References: #1635
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateRule,
  evaluateAllRules,
  createLogEntry,
  createRoundUpRule,
  createPercentRule,
  createThresholdRule,
  createFixedAmountRule,
  type SweepContext,
} from './sweep-engine';
import type { SweepRule } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CHECKING_ID = 'acct-checking';
const SAVINGS_ID = 'acct-savings';
const GOAL_ID = 'goal-vacation';

const BASE_CONTEXT: SweepContext = {
  accounts: [
    { id: CHECKING_ID, name: 'Checking', balanceCents: 800000 }, // $8,000
    { id: SAVINGS_ID, name: 'Savings', balanceCents: 2000000 }, // $20,000
  ],
  goals: [{ id: GOAL_ID, name: 'Vacation Fund' }],
  recentTransactions: [
    { amountCents: 425, accountId: CHECKING_ID, type: 'EXPENSE' }, // $4.25
    { amountCents: 1299, accountId: CHECKING_ID, type: 'EXPENSE' }, // $12.99
    { amountCents: 750, accountId: CHECKING_ID, type: 'EXPENSE' }, // $7.50
    { amountCents: 500000, accountId: CHECKING_ID, type: 'INCOME' }, // $5,000
  ],
  dayOfMonth: 15,
};

// ---------------------------------------------------------------------------
// Round-up rule
// ---------------------------------------------------------------------------

describe('evaluateRule — round-up', () => {
  it('calculates correct round-up amounts', () => {
    const rule = createRoundUpRule('Round-up', CHECKING_ID, SAVINGS_ID, 'account', 100);
    const result = evaluateRule(rule, BASE_CONTEXT);

    // $4.25 → round-up $0.75
    // $12.99 → round-up $0.01
    // $7.50 → round-up $0.50
    // Total: $1.26 = 126 cents
    expect(result.amountCents).toBe(126);
    expect(result.feasible).toBe(true);
  });

  it('returns 0 when all transactions are exact multiples', () => {
    const rule = createRoundUpRule('Round-up', CHECKING_ID, SAVINGS_ID, 'account', 100);
    const context: SweepContext = {
      ...BASE_CONTEXT,
      recentTransactions: [
        { amountCents: 500, accountId: CHECKING_ID, type: 'EXPENSE' },
        { amountCents: 1000, accountId: CHECKING_ID, type: 'EXPENSE' },
      ],
    };
    const result = evaluateRule(rule, context);
    expect(result.amountCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Percent-of-income rule
// ---------------------------------------------------------------------------

describe('evaluateRule — percent-of-income', () => {
  it('calculates 10% of income', () => {
    const rule = createPercentRule('Save 10%', CHECKING_ID, SAVINGS_ID, 'account', 10);
    const result = evaluateRule(rule, BASE_CONTEXT);
    // 10% of $5,000 = $500 = 50,000 cents
    expect(result.amountCents).toBe(50000);
    expect(result.feasible).toBe(true);
  });

  it('returns 0 when no income transactions', () => {
    const rule = createPercentRule('Save 10%', CHECKING_ID, SAVINGS_ID, 'account', 10);
    const context: SweepContext = {
      ...BASE_CONTEXT,
      recentTransactions: [{ amountCents: 1000, accountId: CHECKING_ID, type: 'EXPENSE' }],
    };
    const result = evaluateRule(rule, context);
    expect(result.amountCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Threshold rule
// ---------------------------------------------------------------------------

describe('evaluateRule — threshold', () => {
  it('sweeps excess above threshold', () => {
    const rule = createThresholdRule(
      'Sweep excess',
      CHECKING_ID,
      SAVINGS_ID,
      'account',
      500000, // $5,000 threshold
    );
    const result = evaluateRule(rule, BASE_CONTEXT);
    // $8,000 - $5,000 = $3,000 = 300,000 cents
    expect(result.amountCents).toBe(300000);
    expect(result.feasible).toBe(true);
  });

  it('returns 0 when balance is below threshold', () => {
    const rule = createThresholdRule(
      'Sweep excess',
      CHECKING_ID,
      SAVINGS_ID,
      'account',
      1000000, // $10,000 threshold (above $8,000 balance)
    );
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.amountCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fixed amount rule
// ---------------------------------------------------------------------------

describe('evaluateRule — fixed-amount', () => {
  it('returns the configured fixed amount', () => {
    const rule = createFixedAmountRule(
      'Weekly save',
      CHECKING_ID,
      GOAL_ID,
      'goal',
      10000, // $100
    );
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.amountCents).toBe(10000);
    expect(result.feasible).toBe(true);
    expect(result.destinationName).toBe('Vacation Fund');
  });

  it('is not feasible when balance is insufficient', () => {
    const rule = createFixedAmountRule(
      'Big save',
      CHECKING_ID,
      SAVINGS_ID,
      'account',
      900000, // $9,000 (above $8,000 balance)
    );
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('Insufficient');
  });
});

// ---------------------------------------------------------------------------
// Date-based rule
// ---------------------------------------------------------------------------

describe('evaluateRule — date-based', () => {
  it('triggers on matching day of month', () => {
    const rule = createFixedAmountRule(
      'Monthly save',
      CHECKING_ID,
      SAVINGS_ID,
      'account',
      25000, // $250
      15, // 15th of the month
    );
    // Context day is 15
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.amountCents).toBe(25000);
    expect(result.feasible).toBe(true);
  });

  it('returns 0 on non-matching day', () => {
    const rule = createFixedAmountRule(
      'Monthly save',
      CHECKING_ID,
      SAVINGS_ID,
      'account',
      25000,
      1, // 1st of the month
    );
    // Context day is 15
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.amountCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('evaluateRule — error handling', () => {
  it('handles missing source account', () => {
    const rule: SweepRule = {
      id: 'r1',
      name: 'Bad rule',
      type: 'fixed-amount',
      enabled: true,
      sourceAccountId: 'nonexistent',
      destinationId: SAVINGS_ID,
      destinationType: 'account',
      fixedAmountCents: 1000,
      createdAt: new Date().toISOString(),
    };
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('Source account not found');
  });

  it('handles missing destination', () => {
    const rule: SweepRule = {
      id: 'r2',
      name: 'Bad rule',
      type: 'fixed-amount',
      enabled: true,
      sourceAccountId: CHECKING_ID,
      destinationId: 'nonexistent',
      destinationType: 'goal',
      fixedAmountCents: 1000,
      createdAt: new Date().toISOString(),
    };
    const result = evaluateRule(rule, BASE_CONTEXT);
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('Destination');
  });
});

// ---------------------------------------------------------------------------
// evaluateAllRules
// ---------------------------------------------------------------------------

describe('evaluateAllRules', () => {
  it('evaluates only enabled rules', () => {
    const r1 = createRoundUpRule('Active', CHECKING_ID, SAVINGS_ID, 'account');
    const r2: SweepRule = {
      ...createThresholdRule('Disabled', CHECKING_ID, SAVINGS_ID, 'account', 500000),
      enabled: false,
    };
    const results = evaluateAllRules([r1, r2], BASE_CONTEXT);
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe(r1.id);
  });
});

// ---------------------------------------------------------------------------
// createLogEntry
// ---------------------------------------------------------------------------

describe('createLogEntry', () => {
  it('creates a log entry from an evaluation', () => {
    const rule = createFixedAmountRule('Test', CHECKING_ID, SAVINGS_ID, 'account', 5000);
    const evaluation = evaluateRule(rule, BASE_CONTEXT);
    const log = createLogEntry(evaluation, 'simulated');
    expect(log.ruleId).toBe(rule.id);
    expect(log.amountCents).toBe(5000);
    expect(log.mode).toBe('simulated');
    expect(log.success).toBe(true);
    expect(log.id).toBeTruthy();
  });
});
