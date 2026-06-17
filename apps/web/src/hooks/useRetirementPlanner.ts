// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for retirement readiness planning.
 *
 * Manages retirement planning parameters and computes readiness scores,
 * Monte Carlo simulations, and contribution gap analysis.
 *
 * Usage:
 * ```tsx
 * const { readiness, params, setRetirementAge, ... } = useRetirementPlanner();
 * ```
 *
 * References: #1721, #1679
 */

import { useCallback, useMemo, useState } from 'react';
import {
  type RetirementParams,
  type RetirementReadiness,
  type MonteCarloResult,
  assessRetirementReadiness,
  calculateNetRetirementSpending,
  runMonteCarlo,
} from '../lib/planning';
import { useAccounts } from './useAccounts';

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance:retirement-params';

/** Load saved retirement parameters from localStorage. */
function loadParams(): Partial<RetirementParams> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<RetirementParams>;
  } catch {
    return {};
  }
}

/** Persist parameters to localStorage. */
function saveParams(params: RetirementParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // Storage quota exceeded — silently fail
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: RetirementParams = {
  currentAge: 30,
  retirementAge: 65,
  planningHorizonAge: 90,
  currentSavingsCents: 0,
  monthlyContributionCents: 50000, // $500
  annualReturnRate: 0.07,
  annualInflationRate: 0.03,
  desiredMonthlySpendingCents: 400000, // $4,000
  monthlyRetirementIncomeCents: 0,
  annualReturnStdDev: 0.15,
};

export type RetirementProjectionPhase = 'accumulation' | 'drawdown';

export interface RetirementIncomeProjectionPoint {
  readonly age: number;
  readonly year: number;
  readonly phase: RetirementProjectionPhase;
  readonly startingBalanceCents: number;
  readonly contributionCents: number;
  readonly targetSpendCents: number;
  readonly retirementIncomeCents: number;
  readonly withdrawalCents: number;
  readonly growthCents: number;
  readonly endingBalanceCents: number;
  readonly depleted: boolean;
}

export interface RetirementIncomeProjection {
  readonly points: readonly RetirementIncomeProjectionPoint[];
  readonly depletionAge: number | null;
  readonly lastsThroughHorizon: boolean;
  readonly finalBalanceCents: number;
  readonly horizonAge: number;
}

export function buildRetirementIncomeProjection(
  params: RetirementParams,
): RetirementIncomeProjection {
  const currentAge = Math.max(0, params.currentAge);
  const retirementAge = params.retirementAge;
  const horizonAge = Math.max(params.planningHorizonAge, 90, currentAge);
  const annualReturnRate = Number.isFinite(params.annualReturnRate) ? params.annualReturnRate : 0;
  const inflationRate = Number.isFinite(params.annualInflationRate)
    ? params.annualInflationRate
    : 0;
  const annualContributionCents = Math.max(0, params.monthlyContributionCents) * 12;
  const netMonthlyRetirementNeedCents = calculateNetRetirementSpending(
    params.desiredMonthlySpendingCents,
    params.monthlyRetirementIncomeCents,
  );

  let balance = Math.max(0, params.currentSavingsCents);
  let depletionAge: number | null = null;
  const points: RetirementIncomeProjectionPoint[] = [
    {
      age: currentAge,
      year: 0,
      phase: currentAge >= retirementAge ? 'drawdown' : 'accumulation',
      startingBalanceCents: balance,
      contributionCents: 0,
      targetSpendCents: 0,
      retirementIncomeCents: 0,
      withdrawalCents: 0,
      growthCents: 0,
      endingBalanceCents: balance,
      depleted: false,
    },
  ];

  for (let year = 1; currentAge + year <= horizonAge; year++) {
    const startAge = currentAge + year - 1;
    const age = currentAge + year;
    const phase: RetirementProjectionPhase = startAge < retirementAge ? 'accumulation' : 'drawdown';
    const startingBalanceCents = balance;
    const growthCents = Math.round(startingBalanceCents * annualReturnRate);
    const contributionCents = phase === 'accumulation' ? annualContributionCents : 0;
    const yearsInRetirement = Math.max(0, startAge - retirementAge);
    const inflationMultiplier = Math.pow(1 + inflationRate, yearsInRetirement);
    const targetSpendCents =
      phase === 'drawdown'
        ? Math.round(Math.max(0, params.desiredMonthlySpendingCents) * 12 * inflationMultiplier)
        : 0;
    const retirementIncomeCents =
      phase === 'drawdown'
        ? Math.round(Math.max(0, params.monthlyRetirementIncomeCents) * 12 * inflationMultiplier)
        : 0;
    const withdrawalCents =
      phase === 'drawdown'
        ? Math.round(netMonthlyRetirementNeedCents * 12 * inflationMultiplier)
        : 0;

    let endingBalanceCents = Math.round(
      startingBalanceCents + growthCents + contributionCents - withdrawalCents,
    );
    const depleted = phase === 'drawdown' && withdrawalCents > 0 && endingBalanceCents <= 0;

    if (depleted) {
      endingBalanceCents = 0;
      depletionAge ??= age;
    }

    balance = endingBalanceCents;
    points.push({
      age,
      year,
      phase,
      startingBalanceCents,
      contributionCents,
      targetSpendCents,
      retirementIncomeCents,
      withdrawalCents,
      growthCents,
      endingBalanceCents,
      depleted,
    });
  }

  const finalBalanceCents = points.at(-1)?.endingBalanceCents ?? balance;

  return {
    points,
    depletionAge,
    lastsThroughHorizon: depletionAge === null,
    finalBalanceCents,
    horizonAge,
  };
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useRetirementPlanner}. */
export interface UseRetirementPlannerResult {
  /** Current retirement planning parameters. */
  params: RetirementParams;
  /** Computed retirement readiness assessment (null while loading). */
  readiness: RetirementReadiness | null;
  /** Deterministic income projection through at least age 90. */
  incomeProjection: RetirementIncomeProjection;
  /** Whether the assessment is being computed. */
  computing: boolean;
  /** Set current age. */
  setCurrentAge: (age: number) => void;
  /** Set target retirement age. */
  setRetirementAge: (age: number) => void;
  /** Set planning horizon age. */
  setPlanningHorizonAge: (age: number) => void;
  /** Set monthly contribution in cents. */
  setMonthlyContribution: (cents: number) => void;
  /** Set desired monthly spending in cents. */
  setDesiredSpending: (cents: number) => void;
  /** Set monthly Social Security/pension income in cents. */
  setRetirementIncome: (cents: number) => void;
  /** Set expected annual return rate (0-1). */
  setAnnualReturn: (rate: number) => void;
  /** Set expected annual inflation rate (0-1). */
  setInflationRate: (rate: number) => void;
  /** Run Monte Carlo at a specific spending level. */
  simulateAtSpending: (monthlyCents: number) => MonteCarloResult;
  /** Reset parameters to defaults. */
  resetToDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Manage retirement planning parameters and compute readiness. */
export function useRetirementPlanner(): UseRetirementPlannerResult {
  const { accounts } = useAccounts();

  // Derive current savings from investment/savings accounts
  const currentSavingsFromAccounts = useMemo(() => {
    const savingsAccounts = accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'INVESTMENT');
    return savingsAccounts.reduce((sum, a) => sum + a.currentBalance.amount, 0);
  }, [accounts]);

  const saved = loadParams();
  const [params, setParams] = useState<RetirementParams>(() => ({
    ...DEFAULT_PARAMS,
    ...saved,
    currentSavingsCents:
      (saved.currentSavingsCents ?? currentSavingsFromAccounts) ||
      DEFAULT_PARAMS.currentSavingsCents,
  }));

  const effectiveParams = useMemo<RetirementParams>(
    () => ({
      ...params,
      currentSavingsCents: params.currentSavingsCents || currentSavingsFromAccounts,
    }),
    [params, currentSavingsFromAccounts],
  );

  // Compute readiness assessment
  const readiness = useMemo(() => assessRetirementReadiness(effectiveParams), [effectiveParams]);

  const incomeProjection = useMemo(
    () => buildRetirementIncomeProjection(effectiveParams),
    [effectiveParams],
  );

  // Parameter setters
  const updateParam = useCallback(
    <K extends keyof RetirementParams>(key: K, value: RetirementParams[K]) => {
      setParams((prev) => {
        const next = { ...prev, [key]: value };
        saveParams(next);
        return next;
      });
    },
    [],
  );

  const setCurrentAge = useCallback((age: number) => updateParam('currentAge', age), [updateParam]);
  const setRetirementAge = useCallback(
    (age: number) => updateParam('retirementAge', age),
    [updateParam],
  );
  const setPlanningHorizonAge = useCallback(
    (age: number) => updateParam('planningHorizonAge', age),
    [updateParam],
  );
  const setMonthlyContribution = useCallback(
    (cents: number) => updateParam('monthlyContributionCents', cents),
    [updateParam],
  );
  const setDesiredSpending = useCallback(
    (cents: number) => updateParam('desiredMonthlySpendingCents', cents),
    [updateParam],
  );
  const setRetirementIncome = useCallback(
    (cents: number) => updateParam('monthlyRetirementIncomeCents', cents),
    [updateParam],
  );
  const setAnnualReturn = useCallback(
    (rate: number) => updateParam('annualReturnRate', rate),
    [updateParam],
  );
  const setInflationRate = useCallback(
    (rate: number) => updateParam('annualInflationRate', rate),
    [updateParam],
  );

  const simulateAtSpending = useCallback(
    (monthlyCents: number): MonteCarloResult => {
      const effectiveParams: RetirementParams = {
        ...params,
        currentSavingsCents: params.currentSavingsCents || currentSavingsFromAccounts,
        desiredMonthlySpendingCents: monthlyCents,
      };
      return runMonteCarlo(effectiveParams);
    },
    [params, currentSavingsFromAccounts],
  );

  const resetToDefaults = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    saveParams(DEFAULT_PARAMS);
  }, []);

  return {
    params,
    readiness,
    incomeProjection,
    computing: false,
    setCurrentAge,
    setRetirementAge,
    setPlanningHorizonAge,
    setMonthlyContribution,
    setDesiredSpending,
    setRetirementIncome,
    setAnnualReturn,
    setInflationRate,
    simulateAtSpending,
    resetToDefaults,
  };
}
