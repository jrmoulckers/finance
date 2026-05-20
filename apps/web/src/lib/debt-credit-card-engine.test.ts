// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the credit card payment reservation engine.
 *
 * Covers: reservation calculation, summary with available balance,
 * payment alert generation, and edge cases.
 *
 * Edge cases: zero balance cards, overdue payments, no cards,
 * checking balance less than total reservations, manual overrides.
 *
 * References: issue #1569
 */

import { describe, expect, it } from 'vitest';
import {
  calculatePaymentReservations,
  calculateReservationSummary,
  generatePaymentAlerts,
} from './debt-credit-card-engine';
import type { CreditCard } from './debt-types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CARD_A: CreditCard = {
  id: 'card-a',
  name: 'Chase Sapphire',
  balanceCents: 150_000, // $1,500
  creditLimitCents: 1_000_000,
  minimumPaymentCents: 3_500, // $35
  dueDate: '2025-02-20',
  annualRateBps: 2199,
  statementDate: '2025-01-25',
};

const CARD_B: CreditCard = {
  id: 'card-b',
  name: 'Citi Double Cash',
  balanceCents: 45_000, // $450
  creditLimitCents: 500_000,
  minimumPaymentCents: 2_500,
  dueDate: '2025-02-15',
  annualRateBps: 1899,
  statementDate: '2025-01-20',
};

const ZERO_BALANCE_CARD: CreditCard = {
  id: 'card-c',
  name: 'Amex Gold',
  balanceCents: 0,
  creditLimitCents: 2_000_000,
  minimumPaymentCents: 0,
  dueDate: '2025-02-25',
  annualRateBps: 2399,
  statementDate: '2025-01-28',
};

// ---------------------------------------------------------------------------
// Reservation calculation
// ---------------------------------------------------------------------------

describe('calculatePaymentReservations', () => {
  it('reserves full balance by default', () => {
    const reservations = calculatePaymentReservations([CARD_A, CARD_B]);
    expect(reservations).toHaveLength(2);

    const cardARes = reservations.find((r) => r.cardId === 'card-a')!;
    expect(cardARes.reservedAmountCents).toBe(150_000);
    expect(cardARes.isAutoCalculated).toBe(true);
  });

  it('excludes zero-balance cards', () => {
    const reservations = calculatePaymentReservations([CARD_A, ZERO_BALANCE_CARD]);
    expect(reservations).toHaveLength(1);
    expect(reservations[0].cardId).toBe('card-a');
  });

  it('uses override amount when provided', () => {
    const overrides = new Map([['card-a', 50_000]]);
    const reservations = calculatePaymentReservations([CARD_A], overrides);
    expect(reservations[0].reservedAmountCents).toBe(50_000);
    expect(reservations[0].isAutoCalculated).toBe(false);
  });

  it('caps override at card balance', () => {
    const overrides = new Map([['card-a', 200_000]]); // More than $1,500 balance
    const reservations = calculatePaymentReservations([CARD_A], overrides);
    expect(reservations[0].reservedAmountCents).toBe(150_000);
  });

  it('clamps negative override to zero', () => {
    const overrides = new Map([['card-a', -500]]);
    const reservations = calculatePaymentReservations([CARD_A], overrides);
    expect(reservations[0].reservedAmountCents).toBe(0);
  });

  it('returns empty for no cards', () => {
    expect(calculatePaymentReservations([])).toEqual([]);
  });

  it('preserves due date from card', () => {
    const reservations = calculatePaymentReservations([CARD_B]);
    expect(reservations[0].dueDate).toBe('2025-02-15');
  });
});

// ---------------------------------------------------------------------------
// Reservation summary
// ---------------------------------------------------------------------------

describe('calculateReservationSummary', () => {
  it('calculates available balance after reservations', () => {
    const summary = calculateReservationSummary(300_000, [CARD_A, CARD_B], '2025-02-10');
    expect(summary.checkingBalanceCents).toBe(300_000);
    expect(summary.totalReservedCents).toBe(150_000 + 45_000);
    expect(summary.availableAfterReservationsCents).toBe(300_000 - 195_000);
  });

  it('allows negative available balance (overspent)', () => {
    const summary = calculateReservationSummary(100_000, [CARD_A, CARD_B], '2025-02-10');
    expect(summary.availableAfterReservationsCents).toBe(100_000 - 195_000);
    expect(summary.availableAfterReservationsCents).toBeLessThan(0);
  });

  it('includes alerts in summary', () => {
    const summary = calculateReservationSummary(300_000, [CARD_A, CARD_B], '2025-02-14');
    expect(summary.alerts.length).toBeGreaterThan(0);
  });

  it('handles empty card list', () => {
    const summary = calculateReservationSummary(500_000, [], '2025-02-10');
    expect(summary.totalReservedCents).toBe(0);
    expect(summary.availableAfterReservationsCents).toBe(500_000);
    expect(summary.alerts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Payment alerts
// ---------------------------------------------------------------------------

describe('generatePaymentAlerts', () => {
  it('generates no alerts for zero-balance cards', () => {
    const alerts = generatePaymentAlerts([ZERO_BALANCE_CARD], '2025-02-24');
    expect(alerts).toHaveLength(0);
  });

  it('generates "due_soon" alert within 5 days', () => {
    const alerts = generatePaymentAlerts([CARD_A], '2025-02-16');
    // Due date is 2025-02-20, today is 2025-02-16 → 4 days out
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('due_soon');
    expect(alerts[0].daysUntilDue).toBe(4);
    expect(alerts[0].cardName).toBe('Chase Sapphire');
  });

  it('generates "due_today" alert on due date', () => {
    const alerts = generatePaymentAlerts([CARD_A], '2025-02-20');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('due_today');
    expect(alerts[0].daysUntilDue).toBe(0);
  });

  it('generates "overdue" alert after due date', () => {
    const alerts = generatePaymentAlerts([CARD_A], '2025-02-23');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('overdue');
    expect(alerts[0].daysUntilDue).toBeLessThan(0);
  });

  it('does not alert for payments far in the future', () => {
    const alerts = generatePaymentAlerts([CARD_A], '2025-02-01');
    // Due date 2025-02-20, today is 2025-02-01 → 19 days out → no alert
    expect(alerts).toHaveLength(0);
  });

  it('sorts by urgency (overdue > due_today > due_soon)', () => {
    const cards: CreditCard[] = [
      { ...CARD_A, id: 'soon', dueDate: '2025-02-18' },
      { ...CARD_B, id: 'overdue', dueDate: '2025-02-10' },
      { ...CARD_A, id: 'today', name: 'Today Card', dueDate: '2025-02-14' },
    ];
    const alerts = generatePaymentAlerts(cards, '2025-02-14');
    expect(alerts[0].type).toBe('overdue');
    expect(alerts[1].type).toBe('due_today');
    expect(alerts[2].type).toBe('due_soon');
  });

  it('includes amount due in alert', () => {
    const alerts = generatePaymentAlerts([CARD_A], '2025-02-19');
    expect(alerts[0].amountDueCents).toBe(3_500);
  });
});
