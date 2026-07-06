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
  DebtMilestone,
  DebtMilestoneSummary,
  DebtToIncomeSummary,
  DebtToIncomeThresholdCrossing,
  DebtToIncomeTrendOptions,
  DebtToIncomeTrendPoint,
  ExtraPaymentImpactScenario,
  LumpSumImpact,
  OneTimePayment,
  PayoffStrategy,
  PayoffStrategyRecommendation,
  StrategyComparison,
  StrategyResult,
  TargetDateSolution,
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
 * Extra payment is allocated to debts in strategy order. When a debt is
 * cleared, its minimum rolls into the pool for the next target, and any
 * money left over in a debt's payoff month cascades onto the next debt in
 * the same month (a true snowball, with no wasted surplus).
 *
 * @param debts - All debts to include.
 * @param strategy - 'avalanche' or 'snowball'.
 * @param extraPaymentCents - Additional monthly payment beyond all minimums (in cents).
 * @param oneTimePayments - Optional one-time lump sums applied in specific months
 *   (e.g. a tax refund). Each joins that month's shared pool and cascades in
 *   strategy order like any other extra.
 * @returns Full strategy result with per-debt schedules and timeline.
 */
export function calculateStrategyResult(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  extraPaymentCents: number,
  oneTimePayments: readonly OneTimePayment[] = [],
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
      fullyPaidOff: true,
      unpaidDebtIds: [],
    };
  }

  const safeExtra = Math.max(0, extraPaymentCents);

  // Sum any one-time lump sums by the month they land in. Only positive amounts
  // in real (>= 1) months count.
  const oneTimeByMonth = new Map<number, number>();
  for (const payment of oneTimePayments) {
    if (payment.month >= 1 && payment.cents > 0) {
      oneTimeByMonth.set(payment.month, (oneTimeByMonth.get(payment.month) ?? 0) + payment.cents);
    }
  }

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

    // Determine this month's interest and each debt's own minimum payment.
    // Any money beyond a debt's own minimum — the user's extra payment, the
    // minimums freed by debts cleared in earlier months, and the unused part
    // of a minimum that over-covers a nearly-paid debt — joins a shared pool
    // that cascades to debts in strategy order within THIS month.
    const monthInterest = new Map<string, number>();
    const monthPayment = new Map<string, number>();
    let pool = safeExtra + freedUpPayment + (oneTimeByMonth.get(month) ?? 0);

    for (const id of orderedIds) {
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;

      const debt = debtMap.get(id)!;
      const interestCents = calculateMonthlyInterestCents(balance, debt.annualRateBps);
      monthInterest.set(id, interestCents);

      const payoffCents = balance + interestCents;
      const minPaymentCents = Math.min(debt.minimumPaymentCents, payoffCents);
      monthPayment.set(id, minPaymentCents);
      // If the minimum over-covers this debt, the surplus cascades too.
      pool += debt.minimumPaymentCents - minPaymentCents;
    }

    // Cascade the pool across debts in strategy order. When a debt is fully
    // covered, the leftover immediately flows to the next target this month.
    for (const id of orderedIds) {
      if (pool <= 0) break;
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;

      const interestCents = monthInterest.get(id) ?? 0;
      const payoffCents = balance + interestCents;
      const alreadyCents = monthPayment.get(id) ?? 0;
      const roomCents = Math.max(0, payoffCents - alreadyCents);
      const appliedCents = Math.min(pool, roomCents);
      monthPayment.set(id, alreadyCents + appliedCents);
      pool -= appliedCents;
    }

    // Commit payments, update balances, record schedules, and detect payoffs.
    for (const id of orderedIds) {
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;

      const debt = debtMap.get(id)!;
      const interestCents = monthInterest.get(id) ?? 0;
      const payment = monthPayment.get(id) ?? 0;
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

      // If debt just got paid off, free its minimum for future months.
      if (newBalance <= 0 && balance > 0) {
        payoffMonths.set(id, month);
        payoffOrder.push(id);
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

  // Any debt still carrying a balance at the horizon never amortized — its
  // payment does not cover its interest. Report these so callers can warn the
  // user instead of rendering the capped horizon as a real payoff countdown.
  const unpaidDebtIds: string[] = [];
  for (const id of orderedIds) {
    if ((balances.get(id) ?? 0) > 0) {
      unpaidDebtIds.push(id);
    }
  }

  return {
    strategy,
    schedules,
    payoffOrder,
    totalInterestCents,
    totalPaidCents,
    totalMonths: month,
    timelineBalanceCents,
    fullyPaidOff: unpaidDebtIds.length === 0,
    unpaidDebtIds,
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

/**
 * Model the effect of a one-time lump-sum payment on the active plan.
 *
 * Runs the same strategy twice — once with the recurring extra only, once with
 * the lump sum added in the chosen month — and reports how much sooner the user
 * reaches debt-free and how much interest they avoid. Savings are clamped at
 * zero so a lump sum never appears to cost time or money.
 *
 * @param debts - All debts to include.
 * @param strategy - Active payoff strategy.
 * @param extraPaymentCents - Recurring monthly extra payment (cents).
 * @param lumpSumCents - One-time amount to apply (cents); <= 0 yields no effect.
 * @param appliedMonth - 1-indexed month to apply the lump sum (default: 1).
 * @returns The lump sum's impact on months-to-debt-free and total interest.
 */
export function calculateLumpSumImpact(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  extraPaymentCents: number,
  lumpSumCents: number,
  appliedMonth = 1,
): LumpSumImpact {
  const safeMonth = Math.max(1, Math.floor(appliedMonth));
  const safeLumpSum = Math.max(0, lumpSumCents);

  const baseline = calculateStrategyResult(debts, strategy, extraPaymentCents);
  const withLumpSum =
    safeLumpSum > 0
      ? calculateStrategyResult(debts, strategy, extraPaymentCents, [
          { month: safeMonth, cents: safeLumpSum },
        ])
      : baseline;

  return {
    lumpSumCents: safeLumpSum,
    appliedMonth: safeMonth,
    baselineMonths: baseline.totalMonths,
    withLumpSumMonths: withLumpSum.totalMonths,
    monthsSaved: Math.max(0, baseline.totalMonths - withLumpSum.totalMonths),
    interestSavedCents: Math.max(0, baseline.totalInterestCents - withLumpSum.totalInterestCents),
  };
}

/**
 * Solve for the minimum recurring extra payment needed to be debt-free by a
 * target month.
 *
 * More extra payment never increases the number of months to debt-free, so the
 * relationship is monotonic and a binary search over the extra amount finds the
 * smallest payment that reaches the target. The search upper bound pays every
 * balance (plus its first month of interest) at once, clearing all debt in the
 * first month; if even that cannot meet the target, the target is infeasible.
 *
 * @param debts - All debts to include.
 * @param strategy - Active payoff strategy.
 * @param targetMonths - Desired months-to-debt-free (>= 1).
 * @returns The required extra payment and whether the target is achievable.
 */
export function solveExtraPaymentForTargetDate(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  targetMonths: number,
): TargetDateSolution {
  if (debts.length === 0) {
    return { feasible: true, requiredExtraPaymentCents: 0, resultingMonths: 0 };
  }

  const target = Math.floor(targetMonths);

  // Months to debt-free at a given extra; Infinity when the plan never clears.
  const monthsAt = (extraCents: number): number => {
    const result = calculateStrategyResult(debts, strategy, extraCents);
    return result.fullyPaidOff ? result.totalMonths : Number.POSITIVE_INFINITY;
  };

  const baseline = calculateStrategyResult(debts, strategy, 0);

  if (target < 1) {
    return { feasible: false, requiredExtraPaymentCents: 0, resultingMonths: baseline.totalMonths };
  }

  // Already on track with no extra payment.
  if (baseline.fullyPaidOff && baseline.totalMonths <= target) {
    return { feasible: true, requiredExtraPaymentCents: 0, resultingMonths: baseline.totalMonths };
  }

  // Upper bound: enough extra to clear every balance (and its first-month
  // interest) in month one.
  const totalBalanceCents = debts.reduce((sum, d) => sum + Math.max(0, d.balanceCents), 0);
  const firstMonthInterestCents = debts.reduce(
    (sum, d) => sum + calculateMonthlyInterestCents(Math.max(0, d.balanceCents), d.annualRateBps),
    0,
  );
  const maxExtraCents = totalBalanceCents + firstMonthInterestCents;

  const fastestMonths = monthsAt(maxExtraCents);
  if (fastestMonths > target) {
    // Even the largest payment cannot beat the target; report the soonest the
    // user could realistically be debt-free instead of the minimum-only plan.
    return {
      feasible: false,
      requiredExtraPaymentCents: 0,
      resultingMonths: Number.isFinite(fastestMonths) ? fastestMonths : baseline.totalMonths,
    };
  }

  // Binary search the smallest extra in [0, maxExtraCents] meeting the target.
  let lo = 0;
  let hi = maxExtraCents;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (monthsAt(mid) <= target) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const resultingMonths = monthsAt(lo);
  return {
    feasible: true,
    requiredExtraPaymentCents: lo,
    resultingMonths: Number.isFinite(resultingMonths) ? resultingMonths : baseline.totalMonths,
  };
}

// ---------------------------------------------------------------------------
// Motivation, milestones, and DTI helpers
// ---------------------------------------------------------------------------

const MILESTONE_THRESHOLDS: readonly DebtMilestone['thresholdPercent'][] = [10, 25, 50, 75, 100];
const DEFAULT_DTI_THRESHOLDS = [36, 43] as const;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Calculates interest saved by applying extra payments versus minimum-only payoff.
 */
export function calculateInterestSavedCents(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  extraPaymentCents: number,
): number {
  if (debts.length === 0 || extraPaymentCents <= 0) {
    return 0;
  }

  const minimumOnly = calculateStrategyResult(debts, strategy, 0);
  const accelerated = calculateStrategyResult(debts, strategy, extraPaymentCents);
  return Math.max(0, minimumOnly.totalInterestCents - accelerated.totalInterestCents);
}

/**
 * Calculates total payoff progress and milestone badge state.
 */
export function calculateDebtMilestoneSummary(
  debts: readonly Debt[],
  manualInterestPaidToDateCents = 0,
): DebtMilestoneSummary {
  let totalOriginalDebtCents = 0;
  let currentDebtCents = 0;
  let knownInterestPaidToDateCents = 0;

  for (const debt of debts) {
    const original = Math.max(debt.originalBalanceCents ?? debt.balanceCents, debt.balanceCents);
    totalOriginalDebtCents += original;
    currentDebtCents += Math.max(0, debt.balanceCents);
    knownInterestPaidToDateCents += Math.max(0, debt.interestPaidToDateCents ?? 0);
  }

  const paidOffCents = Math.max(0, totalOriginalDebtCents - currentDebtCents);
  const percentPaidOff =
    totalOriginalDebtCents > 0
      ? roundToOneDecimal((paidOffCents * 100) / totalOriginalDebtCents)
      : 0;

  return {
    totalOriginalDebtCents,
    currentDebtCents,
    paidOffCents,
    totalInterestPaidToDateCents:
      knownInterestPaidToDateCents + Math.max(0, manualInterestPaidToDateCents),
    percentPaidOff,
    milestones: MILESTONE_THRESHOLDS.map((thresholdPercent) => ({
      thresholdPercent,
      isReached: percentPaidOff >= thresholdPercent,
    })),
  };
}

/**
 * Calculates debt-to-income ratio as monthly required debt payments / monthly income.
 */
export function calculateDebtToIncomeRatioPercent(
  monthlyDebtPaymentCents: number,
  monthlyIncomeCents: number,
): number {
  if (monthlyIncomeCents <= 0 || monthlyDebtPaymentCents <= 0) {
    return 0;
  }
  return roundToOneDecimal((monthlyDebtPaymentCents * 100) / monthlyIncomeCents);
}

/**
 * Projects how required minimum debt payments decline as debts are paid off.
 */
function normalizeDtiThresholds(targetRatioPercent?: number): number[] {
  return Array.from(
    new Set(
      [...DEFAULT_DTI_THRESHOLDS, targetRatioPercent]
        .filter(
          (threshold): threshold is number =>
            typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0,
        )
        .map((threshold) => roundToOneDecimal(threshold)),
    ),
  ).sort((a, b) => a - b);
}

function calculateProjectedMonthlyIncome(
  startingMonthlyIncomeCents: number,
  month: number,
  options: DebtToIncomeTrendOptions,
): number {
  const incomeChanges = [...(options.incomeChanges ?? [])]
    .filter((change) => change.month >= 0 && change.monthlyIncomeCents >= 0)
    .sort((a, b) => a.month - b.month);
  let baseIncome = Math.max(0, startingMonthlyIncomeCents);
  let baseMonth = 0;

  for (const change of incomeChanges) {
    if (change.month > month) break;
    baseIncome = change.monthlyIncomeCents;
    baseMonth = change.month;
  }

  const annualRaiseRate = Math.max(0, options.annualRaiseBps ?? 0) / 10000;
  const raisePeriods = Math.floor(Math.max(0, month - baseMonth) / MONTHS_PER_YEAR);
  return bankersRound(baseIncome * Math.pow(1 + annualRaiseRate, raisePeriods));
}

function buildDtiPoint(
  month: number,
  requiredDebtPaymentCents: number,
  monthlyIncomeCents: number,
  thresholds: readonly number[],
): DebtToIncomeTrendPoint {
  const ratioPercent = calculateDebtToIncomeRatioPercent(
    requiredDebtPaymentCents,
    monthlyIncomeCents,
  );
  return {
    month,
    requiredDebtPaymentCents,
    monthlyIncomeCents,
    ratioPercent,
    thresholdStatuses: thresholds.map((thresholdPercent) => ({
      thresholdPercent,
      isAtOrBelow: monthlyIncomeCents > 0 && ratioPercent <= thresholdPercent,
    })),
  };
}

function calculateDtiThresholdCrossings(
  trend: readonly DebtToIncomeTrendPoint[],
  thresholds: readonly number[],
): DebtToIncomeThresholdCrossing[] {
  return thresholds.map((thresholdPercent) => ({
    thresholdPercent,
    month:
      trend.find((point) =>
        point.thresholdStatuses.some(
          (status) => status.thresholdPercent === thresholdPercent && status.isAtOrBelow,
        ),
      )?.month ?? null,
  }));
}

export function calculateDebtToIncomeTrend(
  debts: readonly Debt[],
  monthlyIncomeCents: number,
  strategy: PayoffStrategy,
  extraPaymentCents: number,
  options: DebtToIncomeTrendOptions = {},
): DebtToIncomeSummary {
  const thresholds = normalizeDtiThresholds(options.targetRatioPercent);
  const currentRequiredPaymentCents = debts.reduce(
    (total, debt) => total + Math.max(0, debt.minimumPaymentCents),
    0,
  );
  const currentIncomeCents = calculateProjectedMonthlyIncome(monthlyIncomeCents, 0, options);
  const currentPoint = buildDtiPoint(
    0,
    currentRequiredPaymentCents,
    currentIncomeCents,
    thresholds,
  );

  if (debts.length === 0) {
    const trend = [buildDtiPoint(0, 0, currentIncomeCents, thresholds)];
    return {
      currentRatioPercent: 0,
      projectedFinalRatioPercent: 0,
      isImproving: false,
      thresholds,
      thresholdCrossings: calculateDtiThresholdCrossings(trend, thresholds),
      paymentBasis: options.paymentBasis ?? 'minimum',
      trend,
    };
  }

  const result = calculateStrategyResult(debts, strategy, extraPaymentCents);
  const trend: DebtToIncomeTrendPoint[] = [currentPoint];

  for (let month = 1; month <= result.totalMonths; month++) {
    let requiredDebtPaymentCents = 0;
    for (const schedule of result.schedules) {
      const entry = schedule.entries[Math.min(month - 1, schedule.entries.length - 1)];
      if (entry && entry.remainingBalanceCents > 0) {
        const debt = debts.find((candidate) => candidate.id === schedule.debtId);
        requiredDebtPaymentCents += debt?.minimumPaymentCents ?? 0;
      }
    }
    const projectedIncomeCents = calculateProjectedMonthlyIncome(
      monthlyIncomeCents,
      month,
      options,
    );
    trend.push(buildDtiPoint(month, requiredDebtPaymentCents, projectedIncomeCents, thresholds));
  }

  const projectedFinalRatioPercent = trend[trend.length - 1]?.ratioPercent ?? 0;
  return {
    currentRatioPercent: currentPoint.ratioPercent,
    projectedFinalRatioPercent,
    isImproving: projectedFinalRatioPercent < currentPoint.ratioPercent,
    thresholds,
    thresholdCrossings: calculateDtiThresholdCrossings(trend, thresholds),
    paymentBasis: options.paymentBasis ?? 'minimum',
    trend,
  };
}

export function calculatePayoffStrategyRecommendation(
  comparison: StrategyComparison,
): PayoffStrategyRecommendation {
  const avalancheWinsOnInterest = comparison.interestSavingsCents >= 0;
  const recommendedStrategy: PayoffStrategy = avalancheWinsOnInterest ? 'avalanche' : 'snowball';
  const monthsSaved = avalancheWinsOnInterest
    ? Math.max(0, comparison.timeSavingsMonths)
    : Math.max(0, -comparison.timeSavingsMonths);

  return {
    recommendedStrategy,
    recommendationReason: avalancheWinsOnInterest
      ? 'Avalanche is the default recommendation because it minimizes interest cost by targeting the highest APR first.'
      : 'Snowball is recommended here because it is at least as cost-effective for this debt mix while creating faster wins.',
    snowballMotivationNote:
      'Snowball may still be motivationally preferable if paying off smaller balances sooner helps you stay committed.',
    interestSavingsCents: Math.abs(comparison.interestSavingsCents),
    monthsSaved,
  };
}

export function calculateExtraPaymentImpactScenarios(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  extraPaymentAmountsCents: readonly number[],
): ExtraPaymentImpactScenario[] {
  const modeledAmounts = Array.from(
    new Set([0, ...extraPaymentAmountsCents.map((amount) => Math.max(0, amount))]),
  ).sort((a, b) => a - b);
  const baseline = calculateStrategyResult(debts, strategy, 0);
  let previousInterestSaved = 0;
  let previousIncrementalSavings: number | null = null;

  return modeledAmounts.map((extraPaymentCents) => {
    const result = calculateStrategyResult(debts, strategy, extraPaymentCents);
    const interestSavedCents = Math.max(0, baseline.totalInterestCents - result.totalInterestCents);
    const incrementalInterestSavedCents = Math.max(0, interestSavedCents - previousInterestSaved);
    const isDiminishingReturn =
      previousIncrementalSavings !== null &&
      extraPaymentCents > 0 &&
      incrementalInterestSavedCents < previousIncrementalSavings;

    previousInterestSaved = interestSavedCents;
    previousIncrementalSavings = incrementalInterestSavedCents;

    return {
      extraPaymentCents,
      totalInterestCents: result.totalInterestCents,
      totalPaidCents: result.totalPaidCents,
      totalMonths: result.totalMonths,
      monthsSaved: Math.max(0, baseline.totalMonths - result.totalMonths),
      interestSavedCents,
      incrementalInterestSavedCents,
      isDiminishingReturn,
      payoffOrder: result.payoffOrder,
    };
  });
}
