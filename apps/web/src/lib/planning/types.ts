// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for financial planning tools.
 *
 * All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * References: #1743, #1735, #1721, #1679, #1644, #1635
 */

// ---------------------------------------------------------------------------
// Scenario Modeler types (#1743 / #1735)
// ---------------------------------------------------------------------------

/** A single parameter adjustment within a scenario. */
export interface ScenarioAdjustment {
  /** Unique identifier for this adjustment. */
  readonly id: string;
  /** Human-readable label (e.g. "Mortgage payment"). */
  readonly label: string;
  /** Category of adjustment. */
  readonly category: 'income' | 'expense' | 'savings' | 'one-time';
  /** Monthly amount change in cents (positive = increase, negative = decrease). */
  readonly monthlyCents: number;
  /**
   * For one-time events, the month offset from today when it occurs.
   * Ignored for recurring adjustments.
   */
  readonly monthOffset?: number;
}

/** A named what-if scenario with one or more adjustments. */
export interface Scenario {
  /** Unique identifier. */
  readonly id: string;
  /** User-given name (e.g. "Buy a house"). */
  readonly name: string;
  /** Optional description. */
  readonly description: string;
  /** Adjustments applied in this scenario. */
  readonly adjustments: readonly ScenarioAdjustment[];
  /** ISO-8601 date when this scenario was created. */
  readonly createdAt: string;
  /** ISO-8601 date when this scenario was last modified. */
  readonly updatedAt: string;
}

/** Monthly projection data point for a scenario. */
export interface ProjectionPoint {
  /** Month index (0 = current month). */
  readonly month: number;
  /** Projected net worth in cents at this month. */
  readonly netWorthCents: number;
  /** Projected savings balance in cents. */
  readonly savingsCents: number;
  /** Monthly cash flow in cents (income - expenses). */
  readonly cashFlowCents: number;
}

/** Result of projecting a scenario over time. */
export interface ScenarioProjection {
  /** The scenario that was projected. */
  readonly scenarioId: string;
  /** Array of monthly data points. */
  readonly points: readonly ProjectionPoint[];
  /** Months until net worth reaches zero (null if never). */
  readonly monthsToZero: number | null;
  /** Net worth change versus baseline at projection end, in cents. */
  readonly netWorthDeltaCents: number;
}

// ---------------------------------------------------------------------------
// Retirement Planner types (#1721 / #1679)
// ---------------------------------------------------------------------------

/** Input parameters for retirement planning. */
export interface RetirementParams {
  /** Current age in years. */
  readonly currentAge: number;
  /** Target retirement age. */
  readonly retirementAge: number;
  /** Expected death/planning-horizon age. */
  readonly planningHorizonAge: number;
  /** Current total retirement savings in cents. */
  readonly currentSavingsCents: number;
  /** Monthly contribution in cents. */
  readonly monthlyContributionCents: number;
  /** Expected annual return rate (e.g. 0.07 = 7%). */
  readonly annualReturnRate: number;
  /** Expected annual inflation rate (e.g. 0.03 = 3%). */
  readonly annualInflationRate: number;
  /** Desired monthly spending in retirement, in today's cents. */
  readonly desiredMonthlySpendingCents: number;
  /** Annual return standard deviation for Monte Carlo (e.g. 0.15 = 15%). */
  readonly annualReturnStdDev: number;
}

/** Result of a single Monte Carlo iteration. */
export interface MonteCarloIteration {
  /** Year-by-year portfolio values in cents. */
  readonly yearlyBalances: readonly number[];
  /** Whether the portfolio survived through the planning horizon. */
  readonly succeeded: boolean;
}

/** Aggregated Monte Carlo simulation result. */
export interface MonteCarloResult {
  /** Number of iterations run. */
  readonly iterations: number;
  /** Probability of success (0-1). */
  readonly successRate: number;
  /** Median final portfolio value in cents. */
  readonly medianFinalCents: number;
  /** 10th percentile final portfolio value in cents. */
  readonly p10FinalCents: number;
  /** 90th percentile final portfolio value in cents. */
  readonly p90FinalCents: number;
  /** Year-by-year median balances for chart display. */
  readonly medianPath: readonly number[];
  /** Year-by-year 10th percentile balances. */
  readonly p10Path: readonly number[];
  /** Year-by-year 90th percentile balances. */
  readonly p90Path: readonly number[];
}

/** Retirement readiness assessment. */
export interface RetirementReadiness {
  /** Score from 0-100. */
  readonly score: number;
  /** Qualitative assessment. */
  readonly rating: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  /** Monthly contribution gap to reach 80% success rate, in cents. */
  readonly monthlyGapCents: number;
  /** Monte Carlo simulation result. */
  readonly monteCarlo: MonteCarloResult;
  /** Projected retirement savings at retirement age (deterministic), in cents. */
  readonly projectedSavingsCents: number;
  /** Amount needed at retirement for desired spending (deterministic), in cents. */
  readonly targetNestEggCents: number;
  /** Key factors driving the score. */
  readonly factors: readonly RetirementFactor[];
}

/** A factor contributing to or detracting from retirement readiness. */
export interface RetirementFactor {
  readonly label: string;
  readonly impact: 'positive' | 'negative' | 'neutral';
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Savings Goal types (#1644)
// ---------------------------------------------------------------------------

/** A savings goal linked to an account for automatic progress tracking. */
export interface LinkedGoal {
  /** Goal ID. */
  readonly goalId: string;
  /** Goal name. */
  readonly name: string;
  /** Target amount in cents. */
  readonly targetCents: number;
  /** Current progress in cents (from linked account balance). */
  readonly currentCents: number;
  /** Linked account ID (null if not linked). */
  readonly accountId: string | null;
  /** Linked account name for display. */
  readonly accountName: string | null;
  /** Progress as 0-100 percentage. */
  readonly progressPercent: number;
  /** Projected completion date based on contribution pace (ISO-8601 or null). */
  readonly projectedCompletionDate: string | null;
  /** Monthly contribution pace in cents (based on recent history). */
  readonly monthlyPaceCents: number;
  /** Contribution history entries. */
  readonly contributions: readonly GoalContribution[];
  /** Milestones with completion status. */
  readonly milestones: readonly GoalMilestone[];
}

/** A contribution record for a savings goal. */
export interface GoalContribution {
  /** ISO-8601 date. */
  readonly date: string;
  /** Amount in cents. */
  readonly amountCents: number;
  /** Running total after this contribution in cents. */
  readonly runningTotalCents: number;
}

/** A progress milestone for a savings goal. */
export interface GoalMilestone {
  /** Milestone percentage (e.g. 25, 50, 75, 100). */
  readonly percent: number;
  /** Label (e.g. "Quarter way there!"). */
  readonly label: string;
  /** Whether this milestone has been reached. */
  readonly reached: boolean;
  /** Date reached (ISO-8601 or null). */
  readonly reachedDate: string | null;
}

// ---------------------------------------------------------------------------
// Sweep Rule types (#1635)
// ---------------------------------------------------------------------------

/** Types of sweep rule triggers. */
export type SweepRuleType =
  | 'round-up'
  | 'percent-of-income'
  | 'threshold'
  | 'fixed-amount'
  | 'date-based';

/** A configurable sweep automation rule. */
export interface SweepRule {
  /** Unique identifier. */
  readonly id: string;
  /** User-given name. */
  readonly name: string;
  /** Rule type. */
  readonly type: SweepRuleType;
  /** Whether this rule is currently active. */
  readonly enabled: boolean;
  /** Source account ID. */
  readonly sourceAccountId: string;
  /** Destination account or goal ID. */
  readonly destinationId: string;
  /** Destination type. */
  readonly destinationType: 'account' | 'goal';

  // Type-specific parameters (all in cents where applicable):

  /** For 'round-up': rounding target in cents (e.g. 100 = round to $1). */
  readonly roundUpTargetCents?: number;
  /** For 'percent-of-income': percentage (e.g. 10 = 10%). */
  readonly percentOfIncome?: number;
  /** For 'threshold': balance threshold in cents (sweep excess above this). */
  readonly thresholdCents?: number;
  /** For 'fixed-amount': fixed sweep amount in cents. */
  readonly fixedAmountCents?: number;
  /** For 'date-based': day of month to sweep (1-28). */
  readonly dayOfMonth?: number;

  /** ISO-8601 creation date. */
  readonly createdAt: string;
}

/** Result of evaluating a sweep rule against current data. */
export interface SweepEvaluation {
  /** The rule that was evaluated. */
  readonly ruleId: string;
  /** The rule name. */
  readonly ruleName: string;
  /** Amount that would be swept in cents. */
  readonly amountCents: number;
  /** Source account name. */
  readonly sourceAccountName: string;
  /** Destination name. */
  readonly destinationName: string;
  /** Whether the sweep would succeed (sufficient balance). */
  readonly feasible: boolean;
  /** Reason if not feasible. */
  readonly reason?: string;
}

/** A log entry for an executed or simulated sweep. */
export interface SweepLogEntry {
  /** Unique ID. */
  readonly id: string;
  /** Rule ID. */
  readonly ruleId: string;
  /** Rule name. */
  readonly ruleName: string;
  /** Amount swept in cents. */
  readonly amountCents: number;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Whether this was a real execution or simulation. */
  readonly mode: 'executed' | 'simulated';
  /** Whether it was successful. */
  readonly success: boolean;
}
