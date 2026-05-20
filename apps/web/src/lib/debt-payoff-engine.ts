// SPDX-License-Identifier: BUSL-1.1

/**
 * Debt payoff calculation engine.
 *
 * Implements avalanche (highest interest first) and snowball (smallest
 * balance first) debt payoff strategies with amortization scheduling.
 *
 * All monetary values are integer cents. Interest is calculated using
 * banker's rounding (round half to even) to avoid systematic bias.
 *
 * Pure functions — no side effects, fully testable.
 *
 * References: issue #1662
 */

import type {
  AmortizationEntry,
  AmortizationSchedule,
  Debt,
  PayoffStrategy,
  StrategyComparison,
  StrategyResult,
} from './debt-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum months to simulate before giving up.
 * Prevents infinite loops for debts where minimum payment < monthly interest.
 */
const MAX_MONTHS = 1200; // 100 years

/** Basis points per whole percent. */
const BPS_PER_PERCENT = 100;

/** Months per year. */
const MONTHS_PER_YEAR = 12;

// ---------------------------------------------------------------------------
// Banker's rounding helper
// ---------------------------------------------------------------------------

/**
 * Rounds a number to the nearest integer using banker's rounding
 * (round half to even / IEEE 754 HALF_EVEN).
 *
 * Examples:
 *   bankersRound(0.5) → 0
 *   bankersRound(1.5) → 2
 *   bankersRound(2.5) → 2
 *   bankersRound(3.5) → 4
 */
export function bankersRound(value: number): number {
  const rounded = Math.round(value);
  // Math.round rounds 0.5 up — we need to check if it was exactly 0.5
  // and adjust to nearest even.
  const diff = Math.abs(value - rounded);
  if (diff === 0.5 || diff === -0.5) {
    // We're at a tie — Math.round already rounded. Check if wrong direction.
    // Actually: Math.round(0.5) = 1, Math.round(1.5) = 2, Math.round(2.5) = 3
    // We want: 0, 2, 2
    const floor = Math.floor(value);
    const frac = value - floor;
    if (Math.abs(frac - 0.5) < Number.EPSILON) {
      // Exactly half — round to even
      return floor % 2 === 0 ? floor : floor + 1;
    }
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculates monthly interest on a balance in cents.
 *
 * Uses simple interest formula: balance × (annual_rate / 12).
 * Annual rate is in basis points (1999 = 19.99%).
 * Result is rounded using banker's rounding.
 *
 * @param balanceCents - Current balance in cents (must be >= 0).
 * @param annualRateBps - Annual interest rate in basis points.
 * @returns Monthly interest amount in cents.
 */
export function calculateMonthlyInterestCents(balanceCents: number, annualRateBps: number): number {
  if (balanceCents <= 0 || annualRateBps <= 0) {
    return 0;
  }
  // Convert bps to decimal rate: 1999 bps → 0.1999
  const annualRate = annualRateBps / (BPS_PER_PERCENT * 100);
  const monthlyRate = annualRate / MONTHS_PER_YEAR;
  return bankersRound(balanceCents * monthlyRate);
}

/**
 * Builds an amortization schedule for a single debt.
 *
 * @param debt - The debt to amortize.
 * @param monthlyPaymentCents - Fixed monthly payment in cents.
 * @returns Full amortization schedule.
 */
export function buildAmortizationSchedule(
  debt: Debt,
  monthlyPaymentCents: number,
): AmortizationSchedule {
  if (debt.balanceCents <= 0) {
    return {
      debtId: debt.id,
      debtName: debt.name,
      entries: [],
      totalInterestCents: 0,
      totalPaidCents: 0,
      monthsToPayoff: 0,
    };
  }

  const entries: AmortizationEntry[] = [];
  let remainingBalance = debt.balanceCents;
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;

  while (remainingBalance > 0 && month < MAX_MONTHS) {
    month++;
    const interestCents = calculateMonthlyInterestCents(remainingBalance, debt.annualRateBps);

    // Payment is the lesser of scheduled payment or remaining balance + interest
    const payment = Math.min(monthlyPaymentCents, remainingBalance + interestCents);

    // If payment doesn't cover interest, the debt will never be paid off
    // Still record the entry but cap at MAX_MONTHS
    const principalCents = Math.max(0, payment - interestCents);
    remainingBalance = Math.max(0, remainingBalance - principalCents);

    totalInterest += interestCents;
    totalPaid += payment;

    entries.push({
      month,
      paymentCents: payment,
      principalCents,
      interestCents,
      remainingBalanceCents: remainingBalance,
    });
  }

  return {
    debtId: debt.id,
    debtName: debt.name,
    entries,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    monthsToPayoff: month,
  };
}

// ---------------------------------------------------------------------------
// Strategy ordering
// ---------------------------------------------------------------------------

/**
 * Returns debt IDs sorted for avalanche strategy (highest interest rate first).
 * Ties broken by highest balance first.
 */
export function calculateAvalancheOrder(debts: readonly Debt[]): string[] {
  return [...debts]
    .sort((a, b) => {
      const rateDiff = b.annualRateBps - a.annualRateBps;
      if (rateDiff !== 0) return rateDiff;
      return b.balanceCents - a.balanceCents;
    })
    .map((d) => d.id);
}

/**
 * Returns debt IDs sorted for snowball strategy (smallest balance first).
 * Ties broken by highest interest rate first.
 */
export function calculateSnowballOrder(debts: readonly Debt[]): string[] {
  return [...debts]
    .sort((a, b) => {
      const balanceDiff = a.balanceCents - b.balanceCents;
      if (balanceDiff !== 0) return balanceDiff;
      return b.annualRateBps - a.annualRateBps;
    })
    .map((d) => d.id);
}

// ---------------------------------------------------------------------------
// Multi-debt strategy simulation
// ---------------------------------------------------------------------------

/**
 * Simulates a full multi-debt payoff using the given strategy and extra payment.
 *
 * Extra payment is allocated to the target debt (per strategy ordering).
 * When a debt is paid off, its minimum payment rolls into the extra amount
 * for the next target.
 *
 * @param debts - All debts to include.
 * @param strategy - 'avalanche' or 'snowball'.
 * @param extraPaymentCents - Additional monthly payment beyond all minimums (in cents).
 * @returns Full strategy result with per-debt schedules and timeline.
 */
export function calculateStrategyResult(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  extraPaymentCents: number,
): StrategyResult {
  if (debts.length === 0) {
    return {
      strategy,
      schedules: [],
      payoffOrder: [],
      totalInterestCents: 0,
      totalPaidCents: 0,
      totalMonths: 0,
      timelineBalanceCents: [],
    };
  }

  const safeExtra = Math.max(0, extraPaymentCents);

  // Order debts by strategy
  const orderedIds =
    strategy === 'avalanche' ? calculateAvalancheOrder(debts) : calculateSnowballOrder(debts);

  // Create mutable balance tracker
  const debtMap = new Map(debts.map((d) => [d.id, { ...d }]));
  const balances = new Map(debts.map((d) => [d.id, d.balanceCents]));
  const scheduleEntries = new Map<string, AmortizationEntry[]>(debts.map((d) => [d.id, []]));
  const interestTotals = new Map<string, number>(debts.map((d) => [d.id, 0]));
  const paidTotals = new Map<string, number>(debts.map((d) => [d.id, 0]));
  const payoffMonths = new Map<string, number>(debts.map((d) => [d.id, 0]));

  const timelineBalanceCents: number[] = [];
  const payoffOrder: string[] = [];

  let month = 0;
  let freedUpPayment = 0; // From paid-off debts' minimums

  while (month < MAX_MONTHS) {
    // Check if all debts are paid
    let totalRemaining = 0;
    for (const bal of balances.values()) {
      totalRemaining += bal;
    }
    if (totalRemaining <= 0) break;

    month++;

    // Find current target debt (first unpaid in order)
    let targetId: string | null = null;
    for (const id of orderedIds) {
      if ((balances.get(id) ?? 0) > 0) {
        targetId = id;
        break;
      }
    }

    // Process each debt
    for (const id of orderedIds) {
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;

      const debt = debtMap.get(id)!;
      const interestCents = calculateMonthlyInterestCents(balance, debt.annualRateBps);

      // Calculate payment: minimum + extra (if this is the target debt)
      let payment = debt.minimumPaymentCents;
      if (id === targetId) {
        payment += safeExtra + freedUpPayment;
      }

      // Cap payment at balance + interest
      payment = Math.min(payment, balance + interestCents);

      const principalCents = Math.max(0, payment - interestCents);
      const newBalance = Math.max(0, balance - principalCents);
      balances.set(id, newBalance);

      interestTotals.set(id, (interestTotals.get(id) ?? 0) + interestCents);
      paidTotals.set(id, (paidTotals.get(id) ?? 0) + payment);

      scheduleEntries.get(id)!.push({
        month,
        paymentCents: payment,
        principalCents,
        interestCents,
        remainingBalanceCents: newBalance,
      });

      // If debt just got paid off
      if (newBalance <= 0 && balance > 0) {
        payoffMonths.set(id, month);
        payoffOrder.push(id);
        // Free up this debt's minimum for the next target
        freedUpPayment += debt.minimumPaymentCents;
      }
    }

    // Record timeline
    let combinedBalance = 0;
    for (const bal of balances.values()) {
      combinedBalance += bal;
    }
    timelineBalanceCents.push(combinedBalance);
  }

  // Build schedules
  const schedules: AmortizationSchedule[] = orderedIds.map((id) => {
    const debt = debtMap.get(id)!;
    return {
      debtId: id,
      debtName: debt.name,
      entries: scheduleEntries.get(id) ?? [],
      totalInterestCents: interestTotals.get(id) ?? 0,
      totalPaidCents: paidTotals.get(id) ?? 0,
      monthsToPayoff: payoffMonths.get(id) ?? month,
    };
  });

  let totalInterestCents = 0;
  let totalPaidCents = 0;
  for (const s of schedules) {
    totalInterestCents += s.totalInterestCents;
    totalPaidCents += s.totalPaidCents;
  }

  return {
    strategy,
    schedules,
    payoffOrder,
    totalInterestCents,
    totalPaidCents,
    totalMonths: month,
    timelineBalanceCents,
  };
}

/**
 * Compares avalanche vs. snowball strategies side by side.
 *
 * @param debts - All debts to include.
 * @param extraPaymentCents - Additional monthly payment beyond all minimums.
 * @returns Comparison with interest and time savings.
 */
export function compareStrategies(
  debts: readonly Debt[],
  extraPaymentCents: number,
): StrategyComparison {
  const avalanche = calculateStrategyResult(debts, 'avalanche', extraPaymentCents);
  const snowball = calculateStrategyResult(debts, 'snowball', extraPaymentCents);

  return {
    avalanche,
    snowball,
    interestSavingsCents: snowball.totalInterestCents - avalanche.totalInterestCents,
    timeSavingsMonths: snowball.totalMonths - avalanche.totalMonths,
  };
}
