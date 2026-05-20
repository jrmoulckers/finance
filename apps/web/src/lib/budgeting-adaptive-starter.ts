// SPDX-License-Identifier: BUSL-1.1

/**
 * Adaptive starter budget engine.
 *
 * Analyses historical per-category spending and produces budget suggestions
 * based on averages. Users can override individual categories; the
 * `acceptAllSuggestions` helper resets overrides back to the computed values.
 *
 * All operations are pure and immutable — inputs are never mutated.
 *
 * References: issue #1567
 */

import type {
  CategorySuggestion,
  MonthlyCategorySpending,
  SpendingAnalysisResult,
} from './budgeting-types';
import { bankersRound } from './budgeting-zero-based';

// ---------------------------------------------------------------------------
// Spending history analysis
// ---------------------------------------------------------------------------

/**
 * Analyse spending history and produce per-category budget suggestions.
 *
 * Only the most recent `windowMonths` months of data are considered.
 * Categories are sorted by `suggestedCents` descending.
 *
 * @param spending     - Raw per-category monthly spending data.
 * @param windowMonths - Number of most-recent months to consider (≥ 1).
 * @returns A {@link SpendingAnalysisResult} with suggestions and totals.
 */
export function analyseSpendingHistory(
  spending: readonly MonthlyCategorySpending[],
  windowMonths: number,
): SpendingAnalysisResult {
  const empty: SpendingAnalysisResult = {
    suggestions: [],
    totalSuggestedCents: 0,
    totalAdjustedCents: 0,
    monthsAnalysed: 0,
  };

  if (spending.length === 0 || windowMonths <= 0) return empty;

  // Determine the most recent N months
  const allMonths = [...new Set(spending.map((s) => s.month))].sort();
  const recentMonths = new Set(allMonths.slice(-windowMonths));
  const filtered = spending.filter((s) => recentMonths.has(s.month));

  if (filtered.length === 0) return empty;

  // Group by category
  const categoryMap = new Map<string, { name: string; amounts: number[]; months: Set<string> }>();

  for (const entry of filtered) {
    let cat = categoryMap.get(entry.categoryId);
    if (!cat) {
      cat = { name: entry.name, amounts: [], months: new Set() };
      categoryMap.set(entry.categoryId, cat);
    }
    cat.amounts.push(entry.amountCents);
    cat.months.add(entry.month);
  }

  // Build suggestions
  const suggestions: CategorySuggestion[] = [];

  for (const [categoryId, data] of categoryMap) {
    const sum = data.amounts.reduce((s, v) => s + v, 0);
    const suggestedCents = bankersRound(sum / data.amounts.length);
    const minCents = Math.min(...data.amounts);
    const maxCents = Math.max(...data.amounts);

    suggestions.push({
      categoryId,
      name: data.name,
      suggestedCents,
      adjustedCents: suggestedCents,
      minCents,
      maxCents,
      monthsWithData: data.months.size,
    });
  }

  // Sort by suggested descending
  suggestions.sort((a, b) => b.suggestedCents - a.suggestedCents);

  const totalSuggestedCents = suggestions.reduce((s, c) => s + c.suggestedCents, 0);

  return {
    suggestions,
    totalSuggestedCents,
    totalAdjustedCents: totalSuggestedCents,
    monthsAnalysed: recentMonths.size,
  };
}

// ---------------------------------------------------------------------------
// Adjustment helpers
// ---------------------------------------------------------------------------

/**
 * Apply user overrides to category suggestions.
 *
 * Returns a new result object — the original is not mutated.
 *
 * @param result      - The original analysis result.
 * @param adjustments - Map of categoryId → new adjusted amount in cents.
 * @returns A new {@link SpendingAnalysisResult} with updated adjustments.
 */
export function applyAdjustments(
  result: SpendingAnalysisResult,
  adjustments: ReadonlyMap<string, number>,
): SpendingAnalysisResult {
  const suggestions = result.suggestions.map((s) => {
    const override = adjustments.get(s.categoryId);
    return override !== undefined ? { ...s, adjustedCents: override } : s;
  });

  const totalAdjustedCents = suggestions.reduce((sum, s) => sum + s.adjustedCents, 0);

  return {
    ...result,
    suggestions,
    totalAdjustedCents,
  };
}

/**
 * Reset all adjusted amounts back to the computed suggestions.
 *
 * @param result - The analysis result (possibly with user adjustments).
 * @returns A new {@link SpendingAnalysisResult} with adjustedCents === suggestedCents.
 */
export function acceptAllSuggestions(result: SpendingAnalysisResult): SpendingAnalysisResult {
  const suggestions = result.suggestions.map((s) => ({
    ...s,
    adjustedCents: s.suggestedCents,
  }));

  return {
    ...result,
    suggestions,
    totalAdjustedCents: result.totalSuggestedCents,
  };
}
