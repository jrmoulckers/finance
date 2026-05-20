// SPDX-License-Identifier: BUSL-1.1

/**
 * Anonymous peer spending benchmarks using BLS Consumer Expenditure Survey data.
 *
 * All data is static reference data embedded in code — no network calls,
 * no social features. Compares a user's spending against national averages
 * adjusted by life stage.
 *
 * All monetary values are integer cents. All functions are pure.
 *
 * References: issue #1670
 */

import type {
  BenchmarkCategory,
  LifeStage,
  LifeStageDefinition,
  PeerComparison,
  PeerBenchmarkReport,
  CategoryMapping,
} from './types';
import { bankersRound } from './budget-tags';

// ---------------------------------------------------------------------------
// BLS Consumer Expenditure Survey 2023 reference data
// ---------------------------------------------------------------------------

/**
 * National average spending by category from the 2023 BLS
 * Consumer Expenditure Survey. Percentages of total expenditure.
 */
export const BLS_CATEGORIES: readonly BenchmarkCategory[] = [
  { key: 'housing', label: 'Housing', nationalAveragePercent: 33.0 },
  { key: 'transportation', label: 'Transportation', nationalAveragePercent: 16.0 },
  { key: 'food', label: 'Food', nationalAveragePercent: 13.0 },
  { key: 'insurance_pensions', label: 'Insurance & Pensions', nationalAveragePercent: 12.0 },
  { key: 'healthcare', label: 'Healthcare', nationalAveragePercent: 8.0 },
  { key: 'entertainment', label: 'Entertainment', nationalAveragePercent: 5.0 },
  { key: 'apparel', label: 'Apparel & Services', nationalAveragePercent: 3.0 },
  { key: 'education', label: 'Education', nationalAveragePercent: 2.0 },
  { key: 'personal_care', label: 'Personal Care', nationalAveragePercent: 1.5 },
  { key: 'miscellaneous', label: 'Miscellaneous', nationalAveragePercent: 6.5 },
] as const;

// ---------------------------------------------------------------------------
// Life stage definitions with adjusted benchmarks
// ---------------------------------------------------------------------------

/**
 * Life stage definitions with percentage adjustments relative to the
 * national average. Each adjustment object maps category keys to the
 * adjusted benchmark percentage for that life stage.
 */
export const LIFE_STAGES: readonly LifeStageDefinition[] = [
  {
    stage: 'single_young_professional',
    label: 'Single Young Professional',
    adjustments: {
      housing: 35.0,
      transportation: 15.0,
      food: 14.0,
      insurance_pensions: 10.0,
      healthcare: 5.0,
      entertainment: 7.0,
      apparel: 4.0,
      education: 3.0,
      personal_care: 2.0,
      miscellaneous: 5.0,
    },
  },
  {
    stage: 'couple_no_kids',
    label: 'Couple, No Kids',
    adjustments: {
      housing: 32.0,
      transportation: 17.0,
      food: 13.0,
      insurance_pensions: 12.0,
      healthcare: 6.0,
      entertainment: 6.0,
      apparel: 3.0,
      education: 2.0,
      personal_care: 2.0,
      miscellaneous: 7.0,
    },
  },
  {
    stage: 'family_young_kids',
    label: 'Family with Young Kids',
    adjustments: {
      housing: 34.0,
      transportation: 15.0,
      food: 14.0,
      insurance_pensions: 12.0,
      healthcare: 8.0,
      entertainment: 4.0,
      apparel: 4.0,
      education: 3.0,
      personal_care: 1.5,
      miscellaneous: 4.5,
    },
  },
  {
    stage: 'family_teens',
    label: 'Family with Teens',
    adjustments: {
      housing: 32.0,
      transportation: 18.0,
      food: 15.0,
      insurance_pensions: 11.0,
      healthcare: 7.0,
      entertainment: 5.0,
      apparel: 3.5,
      education: 3.5,
      personal_care: 1.5,
      miscellaneous: 3.5,
    },
  },
  {
    stage: 'empty_nester',
    label: 'Empty Nester',
    adjustments: {
      housing: 33.0,
      transportation: 16.0,
      food: 12.0,
      insurance_pensions: 13.0,
      healthcare: 10.0,
      entertainment: 5.5,
      apparel: 2.5,
      education: 1.0,
      personal_care: 1.5,
      miscellaneous: 5.5,
    },
  },
  {
    stage: 'retiree',
    label: 'Retiree',
    adjustments: {
      housing: 35.0,
      transportation: 14.0,
      food: 13.0,
      insurance_pensions: 8.0,
      healthcare: 14.0,
      entertainment: 5.0,
      apparel: 2.0,
      education: 0.5,
      personal_care: 1.5,
      miscellaneous: 7.0,
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Get the benchmark percentage for a category key and life stage.
 *
 * Falls back to national average if no life-stage adjustment exists.
 *
 * @param categoryKey - BLS category key.
 * @param lifeStage - User's life stage.
 * @returns Benchmark percentage (0–100).
 */
export function getBenchmarkPercent(categoryKey: string, lifeStage: LifeStage): number {
  const stageDef = LIFE_STAGES.find((s) => s.stage === lifeStage);
  if (stageDef && categoryKey in stageDef.adjustments) {
    return stageDef.adjustments[categoryKey];
  }
  const cat = BLS_CATEGORIES.find((c) => c.key === categoryKey);
  return cat?.nationalAveragePercent ?? 0;
}

/**
 * Get a life stage definition by key.
 *
 * @param lifeStage - Life stage key.
 * @returns LifeStageDefinition or undefined.
 */
export function getLifeStageDefinition(lifeStage: LifeStage): LifeStageDefinition | undefined {
  return LIFE_STAGES.find((s) => s.stage === lifeStage);
}

// ---------------------------------------------------------------------------
// Percentile estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the user's spending percentile for a category.
 *
 * Uses a simple normal distribution approximation:
 * z = (userPercent - benchmarkPercent) / estimatedStdDev
 *
 * Assumes stdDev is roughly 30% of the benchmark value (a simplification).
 * Returns a percentile from 1 to 99 (clamped).
 *
 * @param userPercent - User's spending percentage.
 * @param benchmarkPercent - Benchmark percentage.
 * @returns Estimated percentile (1–99).
 */
export function estimatePercentile(userPercent: number, benchmarkPercent: number): number {
  if (benchmarkPercent <= 0) return 50;

  const stdDev = benchmarkPercent * 0.3;
  if (stdDev <= 0) return 50;

  const z = (userPercent - benchmarkPercent) / stdDev;
  // Approximate CDF using logistic function: Φ(z) ≈ 1 / (1 + e^(-1.7 * z))
  const cdf = 1 / (1 + Math.exp(-1.7 * z));
  const percentile = Math.round(cdf * 100);
  return Math.max(1, Math.min(99, percentile));
}

// ---------------------------------------------------------------------------
// User spending aggregation
// ---------------------------------------------------------------------------

/** A user spending record for benchmark comparison. */
export interface UserSpending {
  /** Category identifier from the user's system. */
  readonly categoryId: string;
  /** Amount spent in cents. */
  readonly amountCents: number;
}

/**
 * Aggregate user spending by benchmark category using a mapping.
 *
 * @param spending - User's category spending.
 * @param mappings - Maps user category IDs to benchmark keys.
 * @returns Map from benchmark key to total cents.
 */
export function aggregateByBenchmarkCategory(
  spending: readonly UserSpending[],
  mappings: readonly CategoryMapping[],
): Map<string, number> {
  const mappingLookup = new Map<string, string>();
  for (const m of mappings) {
    mappingLookup.set(m.categoryId, m.benchmarkKey);
  }

  const result = new Map<string, number>();
  for (const s of spending) {
    const key = mappingLookup.get(s.categoryId) ?? 'miscellaneous';
    result.set(key, (result.get(key) ?? 0) + s.amountCents);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main comparison
// ---------------------------------------------------------------------------

/**
 * Generate a full peer benchmark comparison report.
 *
 * @param spending - User's category spending.
 * @param mappings - Maps user category IDs to benchmark keys.
 * @param lifeStage - User's life stage for adjusted benchmarks.
 * @param overThresholdPercent - Percentage points above benchmark to flag as over-spending (default 5).
 * @param underThresholdPercent - Percentage points below benchmark to flag as under-spending (default 5).
 * @returns PeerBenchmarkReport.
 */
export function generateBenchmarkReport(
  spending: readonly UserSpending[],
  mappings: readonly CategoryMapping[],
  lifeStage: LifeStage,
  overThresholdPercent: number = 5,
  underThresholdPercent: number = 5,
): PeerBenchmarkReport {
  const aggregated = aggregateByBenchmarkCategory(spending, mappings);

  let totalCents = 0;
  for (const cents of aggregated.values()) {
    totalCents += cents;
  }

  const comparisons: PeerComparison[] = BLS_CATEGORIES.map((cat) => {
    const userCents = aggregated.get(cat.key) ?? 0;
    const userPercent = totalCents > 0 ? (userCents / totalCents) * 100 : 0;
    const benchPercent = getBenchmarkPercent(cat.key, lifeStage);
    const diff = Math.round((userPercent - benchPercent) * 100) / 100;
    const benchmarkAmountCents =
      totalCents > 0 ? bankersRound((benchPercent / 100) * totalCents) : 0;

    return {
      categoryKey: cat.key,
      categoryLabel: cat.label,
      benchmarkPercent: benchPercent,
      actualPercent: Math.round(userPercent * 100) / 100,
      differencePercent: diff,
      estimatedPercentile: estimatePercentile(userPercent, benchPercent),
      userAmountCents: userCents,
      benchmarkAmountCents,
    };
  });

  const overSpending = comparisons.filter((c) => c.differencePercent > overThresholdPercent);
  const underSpending = comparisons.filter((c) => c.differencePercent < -underThresholdPercent);

  return {
    lifeStage,
    comparisons,
    totalSpendingCents: totalCents,
    overSpending: overSpending.sort((a, b) => b.differencePercent - a.differencePercent),
    underSpending: underSpending.sort((a, b) => a.differencePercent - b.differencePercent),
  };
}
