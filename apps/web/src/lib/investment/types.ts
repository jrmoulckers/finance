// SPDX-License-Identifier: BUSL-1.1

/**
 * Types for investment tracking, rebalancing, dividends, DRIP projections,
 * FIRE calculations, retirement scoring, and Monte Carlo simulation.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Percentages use 0–100 scale unless noted otherwise.
 * Interest/return rates use basis points (1 bp = 0.01%) where noted.
 *
 * References: issues #1600, #1631, #1639, #1675, #1683, #1715, #1726
 */

import type { LocalDate, SyncId } from '../../kmp/bridge';
import type { AssetClass } from '../../types/investment';

// ---------------------------------------------------------------------------
// #1600 — Rebalancing planner
// ---------------------------------------------------------------------------

/** A portfolio holding with current and target allocation data. */
export interface PortfolioHolding {
  readonly id: SyncId;
  readonly symbol: string;
  readonly name: string;
  readonly assetClass: AssetClass;
  /** Number of shares (supports fractional). */
  readonly shares: number;
  /** Current price per share in cents. */
  readonly currentPriceCents: number;
  /** Current market value in cents (shares × price). */
  readonly marketValueCents: number;
}

/** Target allocation for a single asset class. */
export interface AssetAllocationTarget {
  readonly assetClass: AssetClass;
  /** Target weight as a percentage (0–100). */
  readonly targetPercent: number;
}

/** Drift analysis for a single asset class. */
export interface DriftAnalysis {
  readonly assetClass: AssetClass;
  /** Target allocation percentage. */
  readonly targetPercent: number;
  /** Actual allocation percentage. */
  readonly actualPercent: number;
  /** Absolute drift (actual − target). */
  readonly driftPercent: number;
  /** Current value in cents. */
  readonly currentValueCents: number;
  /** Target value in cents. */
  readonly targetValueCents: number;
}

/** A single rebalance trade suggestion. */
export interface RebalanceAction {
  readonly assetClass: AssetClass;
  /** Positive = buy, negative = sell, in cents. */
  readonly amountCents: number;
  /** Direction label for display. */
  readonly direction: 'BUY' | 'SELL';
}

/** Tax-aware rebalancing suggestion with account preference. */
export interface TaxAwareRebalanceAction extends RebalanceAction {
  /** Preferred account type for the trade. */
  readonly preferredAccountType: 'TAXABLE' | 'TAX_DEFERRED' | 'TAX_FREE';
  /** Reason for account preference. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// #1631 — Dividend calendar
// ---------------------------------------------------------------------------

/** Payment frequency for a dividend-paying holding. */
export type DividendFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'IRREGULAR';

/** A single dividend event (past or projected). */
export interface DividendEvent {
  readonly holdingId: SyncId;
  readonly symbol: string;
  /** Ex-dividend date (ISO). */
  readonly exDate: LocalDate;
  /** Payment date (ISO). */
  readonly payDate: LocalDate;
  /** Dividend per share in cents. */
  readonly amountPerShareCents: number;
  /** Total dividend in cents (shares × amount). */
  readonly totalAmountCents: number;
  /** Whether this is a projected (future) event. */
  readonly isProjected: boolean;
}

/** Forward annual income estimate from dividends. */
export interface DividendIncomeEstimate {
  /** Total forward annual income in cents. */
  readonly annualIncomeCents: number;
  /** Monthly average income in cents. */
  readonly monthlyIncomeCents: number;
  /** Yield on current portfolio value (percentage). */
  readonly currentYieldPercent: number;
  /** Per-holding breakdown. */
  readonly holdingEstimates: readonly HoldingDividendEstimate[];
}

/** Per-holding dividend estimate. */
export interface HoldingDividendEstimate {
  readonly holdingId: SyncId;
  readonly symbol: string;
  readonly annualDividendCents: number;
  readonly frequency: DividendFrequency;
  readonly yieldPercent: number;
}

// ---------------------------------------------------------------------------
// #1639 — DRIP and yield-on-cost
// ---------------------------------------------------------------------------

/** Input parameters for DRIP simulation. */
export interface DRIPInput {
  /** Initial number of shares. */
  readonly initialShares: number;
  /** Current share price in cents. */
  readonly sharePriceCents: number;
  /** Annual dividend per share in cents. */
  readonly annualDividendPerShareCents: number;
  /** Expected annual dividend growth rate (percentage, e.g. 5 = 5%). */
  readonly dividendGrowthRatePercent: number;
  /** Expected annual share price appreciation (percentage). */
  readonly priceAppreciationPercent: number;
  /** Number of years to project. */
  readonly years: number;
}

/** One year of DRIP projection results. */
export interface DRIPYearResult {
  readonly year: number;
  /** Total shares owned (including reinvested). */
  readonly totalShares: number;
  /** Share price in cents. */
  readonly sharePriceCents: number;
  /** Annual dividend per share in cents. */
  readonly dividendPerShareCents: number;
  /** Total dividend income for the year in cents. */
  readonly totalDividendCents: number;
  /** Shares acquired via reinvestment this year. */
  readonly newSharesFromDrip: number;
  /** Portfolio market value in cents. */
  readonly portfolioValueCents: number;
  /** Yield on original cost basis (percentage). */
  readonly yieldOnCostPercent: number;
  /** Cumulative dividends received in cents. */
  readonly cumulativeDividendsCents: number;
}

/** Complete DRIP projection result. */
export interface DRIPProjection {
  readonly input: DRIPInput;
  readonly yearResults: readonly DRIPYearResult[];
  /** Final portfolio value in cents. */
  readonly finalValueCents: number;
  /** Total dividends received over the period in cents. */
  readonly totalDividendsCents: number;
  /** Final yield on cost (percentage). */
  readonly finalYieldOnCostPercent: number;
  /** Final number of shares. */
  readonly finalShares: number;
}

// ---------------------------------------------------------------------------
// #1675, #1715 — FIRE metrics
// ---------------------------------------------------------------------------

/** Core FIRE calculation inputs. */
export interface FIREInput {
  /** Current portfolio/investment value in cents. */
  readonly currentPortfolioCents: number;
  /** Annual expenses in cents. */
  readonly annualExpensesCents: number;
  /** Annual savings (contributions) in cents. */
  readonly annualSavingsCents: number;
  /** Annual gross income in cents. */
  readonly annualIncomeCents: number;
  /** Expected annual real return rate (percentage, e.g. 7 = 7%). */
  readonly expectedReturnPercent: number;
  /** Current age. */
  readonly currentAge: number;
  /** Target retirement age. */
  readonly targetRetirementAge: number;
  /** Safe withdrawal rate (percentage, default 4). */
  readonly withdrawalRatePercent: number;
}

/** FIRE dashboard metrics. */
export interface FIREMetrics {
  /** FI number = annual expenses / withdrawal rate. In cents. */
  readonly fiNumberCents: number;
  /** FI percentage = current portfolio / FI number × 100. */
  readonly fiPercent: number;
  /** CoastFI amount needed now (cents) to coast to retirement with no more contributions. */
  readonly coastFICents: number;
  /** Whether the user has already reached CoastFI. */
  readonly isCoastFI: boolean;
  /** Savings rate = annual savings / annual income × 100. */
  readonly savingsRatePercent: number;
  /** Estimated years until FI from current trajectory. */
  readonly yearsToFI: number;
  /** Projected FI date (ISO). */
  readonly projectedFIDate: LocalDate;
  /** Annual passive income at current portfolio value using SWR, in cents. */
  readonly currentPassiveIncomeCents: number;
  /** Income replacement percentage. */
  readonly incomeReplacementPercent: number;
}

// ---------------------------------------------------------------------------
// #1683 — Retirement readiness score
// ---------------------------------------------------------------------------

/** Retirement readiness assessment inputs. */
export interface RetirementInput {
  /** Current portfolio value in cents. */
  readonly currentPortfolioCents: number;
  /** Annual retirement expenses in cents. */
  readonly annualExpensesCents: number;
  /** Current age. */
  readonly currentAge: number;
  /** Target retirement age. */
  readonly retirementAge: number;
  /** Life expectancy for planning. */
  readonly lifeExpectancy: number;
  /** Expected annual return in retirement (percentage). */
  readonly expectedReturnPercent: number;
  /** Expected inflation rate (percentage). */
  readonly inflationRatePercent: number;
  /** Annual Social Security benefit in cents (0 if none/unknown). */
  readonly socialSecurityAnnualCents: number;
  /** Annual pension income in cents (0 if none). */
  readonly pensionAnnualCents: number;
  /** Annual savings contributions in cents. */
  readonly annualSavingsCents: number;
  /** Expected annual return pre-retirement (percentage). */
  readonly preRetirementReturnPercent: number;
}

/** Retirement readiness score result. */
export interface RetirementScore {
  /** Overall readiness score 0–100. */
  readonly score: number;
  /** Score category. */
  readonly category: 'CRITICAL' | 'NEEDS_WORK' | 'ON_TRACK' | 'STRONG' | 'EXCELLENT';
  /** Annual income gap in cents (positive = shortfall). */
  readonly incomeGapCents: number;
  /** Projected portfolio at retirement in cents. */
  readonly projectedPortfolioAtRetirementCents: number;
  /** Required portfolio at retirement in cents. */
  readonly requiredPortfolioCents: number;
  /** Portfolio surplus or deficit in cents. */
  readonly portfolioGapCents: number;
  /** Breakdown of retirement income sources in cents. */
  readonly incomeSources: RetirementIncomeSources;
}

/** Annual retirement income sources. */
export interface RetirementIncomeSources {
  /** Sustainable portfolio withdrawal in cents. */
  readonly portfolioWithdrawalCents: number;
  /** Social Security benefit in cents. */
  readonly socialSecurityCents: number;
  /** Pension income in cents. */
  readonly pensionCents: number;
  /** Total combined annual income in cents. */
  readonly totalAnnualIncomeCents: number;
}

/** Social Security estimation inputs. */
export interface SocialSecurityInput {
  /** Average indexed monthly earnings (AIME) in cents. */
  readonly aimeCents: number;
  /** Full retirement age (e.g. 67). */
  readonly fullRetirementAge: number;
  /** Planned claiming age. */
  readonly claimingAge: number;
}

/** Social Security benefit estimate. */
export interface SocialSecurityEstimate {
  /** Primary insurance amount (PIA) — monthly benefit at FRA in cents. */
  readonly piaMonthlyCents: number;
  /** Adjusted monthly benefit based on claiming age in cents. */
  readonly adjustedMonthlyCents: number;
  /** Annual benefit in cents. */
  readonly annualBenefitCents: number;
  /** Adjustment factor applied (< 1 if early, > 1 if delayed). */
  readonly adjustmentFactor: number;
}

// ---------------------------------------------------------------------------
// #1726 — Monte Carlo simulation
// ---------------------------------------------------------------------------

/** Monte Carlo simulation parameters. */
export interface MonteCarloInput {
  /** Initial portfolio value in cents. */
  readonly initialPortfolioCents: number;
  /** Annual withdrawal in cents. */
  readonly annualWithdrawalCents: number;
  /** Expected annual return (percentage). */
  readonly expectedReturnPercent: number;
  /** Standard deviation of annual returns (percentage). */
  readonly returnStdDevPercent: number;
  /** Number of years to simulate. */
  readonly years: number;
  /** Number of simulation runs (default 1000). */
  readonly simulations: number;
  /** Inflation rate (percentage, applied to withdrawals). */
  readonly inflationRatePercent: number;
}

/** Result of a single Monte Carlo simulation run. */
export interface MonteCarloRun {
  /** Year-end portfolio values in cents. */
  readonly yearEndValues: readonly number[];
  /** Whether the portfolio survived all years. */
  readonly survived: boolean;
  /** Year of depletion (0-indexed), or -1 if survived. */
  readonly depletionYear: number;
}

/** Aggregated Monte Carlo simulation results. */
export interface MonteCarloResult {
  /** Percentage of runs where portfolio survived (0–100). */
  readonly successRate: number;
  /** Total number of simulations run. */
  readonly totalSimulations: number;
  /** Percentile outcomes for final portfolio value in cents. */
  readonly percentiles: MonteCarloPercentiles;
  /** Median year-by-year portfolio values in cents (for charting). */
  readonly medianPath: readonly number[];
  /** 10th percentile path (pessimistic). */
  readonly pessimisticPath: readonly number[];
  /** 90th percentile path (optimistic). */
  readonly optimisticPath: readonly number[];
  /** Average final portfolio value in cents. */
  readonly averageFinalValueCents: number;
}

/** Percentile final values for Monte Carlo results. */
export interface MonteCarloPercentiles {
  readonly p10: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
}

/** Recession scenario parameters. */
export interface RecessionScenario {
  /** Year the recession starts (0-indexed from simulation start). */
  readonly startYear: number;
  /** Duration of the recession in years. */
  readonly durationYears: number;
  /** Annual return during recession (percentage, typically negative). */
  readonly recessionReturnPercent: number;
}

/** Monte Carlo result with a recession overlay. */
export interface MonteCarloRecessionResult {
  /** Base result without recession. */
  readonly baseResult: MonteCarloResult;
  /** Result with recession applied. */
  readonly recessionResult: MonteCarloResult;
  /** Drop in success rate due to recession. */
  readonly successRateImpact: number;
  /** The recession scenario used. */
  readonly scenario: RecessionScenario;
}

// ---------------------------------------------------------------------------
// Seeded PRNG type (for deterministic Monte Carlo tests)
// ---------------------------------------------------------------------------

/** A seeded pseudo-random number generator function. */
export type SeededRng = () => number;
