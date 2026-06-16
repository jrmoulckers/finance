// SPDX-License-Identifier: BUSL-1.1

/**
 * Credit card payment reservation engine.
 *
 * Tracks credit card balances and due dates, reserves funds from
 * checking accounts for upcoming payments, and generates payment
 * reminder alerts.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1569
 */

import type {
  CardUtilization,
  CreditCard,
  CreditUtilizationStatus,
  CreditUtilizationSummary,
  CreditUtilizationThresholds,
  PaymentAlert,
  PaymentReservation,
  ReservationSummary,
} from './debt-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days before due date to trigger "due soon" alert. */
const DUE_SOON_DAYS = 5;

const DEFAULT_UTILIZATION_THRESHOLDS: CreditUtilizationThresholds = {
  warningPercent: 30,
  highPercent: 50,
  criticalPercent: 90,
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function getUtilizationStatus(
  utilizationPercent: number | null,
  thresholds: CreditUtilizationThresholds,
): CreditUtilizationStatus {
  if (utilizationPercent === null) return 'unknown_limit';
  if (utilizationPercent >= thresholds.criticalPercent) return 'critical';
  if (utilizationPercent >= thresholds.highPercent) return 'high';
  if (utilizationPercent >= thresholds.warningPercent) return 'warning';
  return 'low';
}

function buildUtilizationMessage(
  cardName: string,
  utilizationPercent: number | null,
  status: CreditUtilizationStatus,
  statementDate: string,
): string {
  if (status === 'unknown_limit') {
    return `${cardName} needs a credit limit before utilization can be calculated.`;
  }
  const percent = utilizationPercent?.toFixed(1) ?? '0.0';
  const reportingContext = statementDate ? ` before the ${statementDate} statement` : '';
  switch (status) {
    case 'critical':
      return `${cardName} is at ${percent}% utilization${reportingContext}; prioritize a payment to get below 90%.`;
    case 'high':
      return `${cardName} is at ${percent}% utilization${reportingContext}; consider getting below 50%.`;
    case 'warning':
      return `${cardName} is at ${percent}% utilization${reportingContext}; below 30% is safer.`;
    case 'low':
      return `${cardName} is at ${percent}% utilization${reportingContext}.`;
  }
}

// ---------------------------------------------------------------------------
// Reservation calculation
// ---------------------------------------------------------------------------

/**
 * Calculates payment reservations for all credit cards.
 *
 * By default, reserves the full statement balance for each card
 * (to avoid interest). Falls back to minimum payment if override
 * amounts are provided.
 *
 * @param cards - Credit cards with current balances and due dates.
 * @param overrides - Optional map of cardId → reserved amount in cents.
 * @returns Array of payment reservations.
 */
export function calculatePaymentReservations(
  cards: readonly CreditCard[],
  overrides?: ReadonlyMap<string, number>,
): PaymentReservation[] {
  return cards
    .filter((card) => card.balanceCents > 0)
    .map((card) => {
      const overrideAmount = overrides?.get(card.id);
      const isAutoCalculated = overrideAmount === undefined;

      // Auto: reserve full balance to avoid interest charges
      // Override: use the manually specified amount (capped at balance)
      const reservedAmount = isAutoCalculated
        ? card.balanceCents
        : Math.min(Math.max(0, overrideAmount), card.balanceCents);

      return {
        cardId: card.id,
        cardName: card.name,
        reservedAmountCents: reservedAmount,
        dueDate: card.dueDate,
        isAutoCalculated,
      };
    });
}

/**
 * Calculates the full reservation summary including available balance.
 *
 * @param checkingBalanceCents - Current checking account balance in cents.
 * @param cards - Credit cards with balances and due dates.
 * @param todayIso - Today's date as ISO string (YYYY-MM-DD).
 * @param overrides - Optional map of cardId → reserved amount in cents.
 * @returns Full reservation summary with alerts.
 */
export function calculateReservationSummary(
  checkingBalanceCents: number,
  cards: readonly CreditCard[],
  todayIso: string,
  overrides?: ReadonlyMap<string, number>,
): ReservationSummary {
  const reservations = calculatePaymentReservations(cards, overrides);
  const alerts = generatePaymentAlerts(cards, todayIso);

  let totalReservedCents = 0;
  for (const r of reservations) {
    totalReservedCents += r.reservedAmountCents;
  }

  return {
    checkingBalanceCents,
    totalReservedCents,
    availableAfterReservationsCents: checkingBalanceCents - totalReservedCents,
    reservations,
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Payment alerts
// ---------------------------------------------------------------------------

/**
 * Generates payment reminder alerts for credit cards.
 *
 * Alert types:
 * - 'overdue': Due date has passed
 * - 'due_today': Due date is today
 * - 'due_soon': Due within {@link DUE_SOON_DAYS} days
 *
 * @param cards - Credit cards to check.
 * @param todayIso - Today's date as ISO string (YYYY-MM-DD).
 * @returns Array of payment alerts, sorted by urgency (overdue first).
 */
export function generatePaymentAlerts(
  cards: readonly CreditCard[],
  todayIso: string,
): PaymentAlert[] {
  const today = new Date(todayIso + 'T00:00:00Z');
  const alerts: PaymentAlert[] = [];

  for (const card of cards) {
    if (card.balanceCents <= 0) continue;

    const dueDate = new Date(card.dueDate + 'T00:00:00Z');
    const diffMs = dueDate.getTime() - today.getTime();
    const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

    let alertType: PaymentAlert['type'] | null = null;
    let message = '';

    if (daysUntilDue < 0) {
      alertType = 'overdue';
      message = `${card.name} payment is ${Math.abs(daysUntilDue)} day(s) overdue.`;
    } else if (daysUntilDue === 0) {
      alertType = 'due_today';
      message = `${card.name} payment is due today.`;
    } else if (daysUntilDue <= DUE_SOON_DAYS) {
      alertType = 'due_soon';
      message = `${card.name} payment is due in ${daysUntilDue} day(s).`;
    }

    if (alertType) {
      alerts.push({
        type: alertType,
        cardName: card.name,
        cardId: card.id,
        dueDate: card.dueDate,
        amountDueCents: card.minimumPaymentCents,
        daysUntilDue,
        message,
      });
    }
  }

  // Sort by urgency: overdue first, then due_today, then due_soon
  const priority: Record<PaymentAlert['type'], number> = {
    overdue: 0,
    due_today: 1,
    due_soon: 2,
  };

  return alerts.sort((a, b) => {
    const pDiff = priority[a.type] - priority[b.type];
    if (pDiff !== 0) return pDiff;
    return a.daysUntilDue - b.daysUntilDue;
  });
}

// ---------------------------------------------------------------------------
// Credit utilization tracking
// ---------------------------------------------------------------------------

export function calculateCreditUtilizationSummary(
  cards: readonly CreditCard[],
  thresholds: CreditUtilizationThresholds = DEFAULT_UTILIZATION_THRESHOLDS,
): CreditUtilizationSummary {
  const normalizedThresholds: CreditUtilizationThresholds = {
    warningPercent: Math.max(0, thresholds.warningPercent),
    highPercent: Math.max(thresholds.warningPercent, thresholds.highPercent),
    criticalPercent: Math.max(thresholds.highPercent, thresholds.criticalPercent),
  };
  let aggregateBalanceCents = 0;
  let aggregateCreditLimitCents = 0;
  let unknownLimitCount = 0;

  const utilizationCards: CardUtilization[] = cards.map((card) => {
    const creditLimitCents = Math.max(0, card.creditLimitCents ?? 0);
    if (creditLimitCents <= 0) {
      unknownLimitCount++;
      return {
        cardId: card.id,
        cardName: card.name,
        balanceCents: Math.max(0, card.balanceCents),
        creditLimitCents: null,
        utilizationPercent: null,
        status: 'unknown_limit',
        statementDate: card.statementDate,
        message: buildUtilizationMessage(card.name, null, 'unknown_limit', card.statementDate),
      };
    }

    const balanceCents = Math.max(0, card.balanceCents);
    const utilizationPercent = roundToOneDecimal((balanceCents * 100) / creditLimitCents);
    const status = getUtilizationStatus(utilizationPercent, normalizedThresholds);
    aggregateBalanceCents += balanceCents;
    aggregateCreditLimitCents += creditLimitCents;

    return {
      cardId: card.id,
      cardName: card.name,
      balanceCents,
      creditLimitCents,
      utilizationPercent,
      status,
      statementDate: card.statementDate,
      message: buildUtilizationMessage(card.name, utilizationPercent, status, card.statementDate),
    };
  });

  const aggregateUtilizationPercent =
    aggregateCreditLimitCents > 0
      ? roundToOneDecimal((aggregateBalanceCents * 100) / aggregateCreditLimitCents)
      : null;

  return {
    cards: utilizationCards,
    aggregateBalanceCents,
    aggregateCreditLimitCents,
    aggregateUtilizationPercent,
    aggregateStatus: getUtilizationStatus(aggregateUtilizationPercent, normalizedThresholds),
    unknownLimitCount,
    thresholds: normalizedThresholds,
  };
}
