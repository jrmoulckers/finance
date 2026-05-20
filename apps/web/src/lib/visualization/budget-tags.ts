// SPDX-License-Identifier: BUSL-1.1

/**
 * Values-based budget tagging and spending alignment engine.
 *
 * Assigns value tags (needs/wants/savings or custom sentiment tags)
 * to transactions, computes alignment scores against stated values,
 * and detects misalignment trends.
 *
 * All monetary values are integer cents. All functions are pure.
 *
 * References: issue #1564
 */

import type {
  BudgetTag,
  TaggedTransaction,
  TagBreakdown,
  ValueTarget,
  ValueAlignment,
  AlignmentScore,
  AlignmentTrendPoint,
  MisalignmentAlert,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even) for a number.
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  const decimal = value - floored;
  // If exactly 0.5, round to even
  if (Math.abs(decimal - 0.5) < 1e-9) {
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Safe percentage: (part / total) * 100 with divide-by-zero guard.
 * @param partCents - Numerator in cents.
 * @param totalCents - Denominator in cents.
 * @returns Percentage (0–100), or 0 if total is zero.
 */
export function safePercent(partCents: number, totalCents: number): number {
  if (totalCents === 0) return 0;
  return (partCents / totalCents) * 100;
}

// ---------------------------------------------------------------------------
// Tag assignment
// ---------------------------------------------------------------------------

/**
 * Assign a value tag to a transaction, producing a TaggedTransaction.
 *
 * @param transactionId - Transaction identifier.
 * @param tag - The value tag to assign.
 * @param amountCents - Transaction amount in cents (should be positive).
 * @param categoryId - Optional category identifier.
 * @param date - ISO date string (YYYY-MM-DD).
 * @returns A TaggedTransaction record.
 */
export function assignTag(
  transactionId: string,
  tag: BudgetTag,
  amountCents: number,
  categoryId: string | null,
  date: string,
): TaggedTransaction {
  return {
    transactionId,
    tag,
    amountCents: Math.abs(amountCents),
    categoryId,
    date,
  };
}

/**
 * Bulk-assign tags based on a category-to-tag mapping.
 *
 * Transactions whose categoryId appears in the mapping get that tag.
 * Others receive the `defaultTag`.
 *
 * @param transactions - Array of {transactionId, amountCents, categoryId, date}.
 * @param categoryTagMap - Map from category ID to tag.
 * @param defaultTag - Tag for unmapped categories.
 * @returns Array of TaggedTransactions.
 */
export function assignTagsByCategory(
  transactions: readonly {
    transactionId: string;
    amountCents: number;
    categoryId: string | null;
    date: string;
  }[],
  categoryTagMap: Readonly<Record<string, BudgetTag>>,
  defaultTag: BudgetTag,
): TaggedTransaction[] {
  return transactions.map((tx) => {
    const tag = tx.categoryId ? (categoryTagMap[tx.categoryId] ?? defaultTag) : defaultTag;
    return assignTag(tx.transactionId, tag, tx.amountCents, tx.categoryId, tx.date);
  });
}

// ---------------------------------------------------------------------------
// Breakdown
// ---------------------------------------------------------------------------

/**
 * Compute spending breakdown by tag.
 *
 * @param tagged - Tagged transactions.
 * @returns Array of TagBreakdown sorted by totalCents descending.
 */
export function computeTagBreakdown(tagged: readonly TaggedTransaction[]): TagBreakdown[] {
  if (tagged.length === 0) return [];

  const byTag = new Map<BudgetTag, { total: number; count: number }>();
  let grandTotal = 0;

  for (const tx of tagged) {
    const entry = byTag.get(tx.tag) ?? { total: 0, count: 0 };
    entry.total += tx.amountCents;
    entry.count += 1;
    byTag.set(tx.tag, entry);
    grandTotal += tx.amountCents;
  }

  const result: TagBreakdown[] = [];
  for (const [tag, { total, count }] of byTag) {
    result.push({
      tag,
      totalCents: total,
      percent: Math.round(safePercent(total, grandTotal) * 100) / 100,
      count,
    });
  }

  return result.sort((a, b) => b.totalCents - a.totalCents);
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

/**
 * Compute alignment between actual spending and stated value targets.
 *
 * @param tagged - Tagged transactions.
 * @param targets - User-stated value targets (should sum to ~100%).
 * @param misalignmentThreshold - Percentage deviation above which a tag is flagged as misaligned (default 10).
 * @returns AlignmentScore with per-tag details.
 */
export function computeAlignment(
  tagged: readonly TaggedTransaction[],
  targets: readonly ValueTarget[],
  misalignmentThreshold: number = 10,
): AlignmentScore {
  const breakdown = computeTagBreakdown(tagged);
  const breakdownMap = new Map(breakdown.map((b) => [b.tag, b.percent]));

  let grandTotal = 0;
  for (const tx of tagged) {
    grandTotal += tx.amountCents;
  }

  const alignments: ValueAlignment[] = targets.map((target) => {
    const actualPercent = breakdownMap.get(target.tag) ?? 0;
    const deviation = actualPercent - target.targetPercent;
    return {
      tag: target.tag,
      targetPercent: target.targetPercent,
      actualPercent,
      deviationPercent: Math.round(deviation * 100) / 100,
      isMisaligned: Math.abs(deviation) > misalignmentThreshold,
    };
  });

  // Score: 100 minus average absolute deviation, clamped to [0, 100]
  const totalDeviation = alignments.reduce((sum, a) => sum + Math.abs(a.deviationPercent), 0);
  const avgDeviation = alignments.length > 0 ? totalDeviation / alignments.length : 0;
  const score = Math.max(0, Math.min(100, Math.round((100 - avgDeviation) * 100) / 100));

  return {
    score,
    alignments,
    totalSpendingCents: grandTotal,
  };
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/**
 * Compute alignment score trend over multiple periods.
 *
 * Transactions are grouped by the month portion of their date (YYYY-MM).
 *
 * @param tagged - All tagged transactions across periods.
 * @param targets - User-stated value targets.
 * @param misalignmentThreshold - Threshold for misalignment detection.
 * @returns Array of AlignmentTrendPoints sorted chronologically.
 */
export function computeAlignmentTrend(
  tagged: readonly TaggedTransaction[],
  targets: readonly ValueTarget[],
  misalignmentThreshold: number = 10,
): AlignmentTrendPoint[] {
  if (tagged.length === 0) return [];

  const byPeriod = new Map<string, TaggedTransaction[]>();
  for (const tx of tagged) {
    const period = tx.date.slice(0, 7); // YYYY-MM
    const list = byPeriod.get(period) ?? [];
    list.push(tx);
    byPeriod.set(period, list);
  }

  const periods = [...byPeriod.keys()].sort();
  return periods.map((period) => {
    const alignment = computeAlignment(byPeriod.get(period)!, targets, misalignmentThreshold);
    return { period, score: alignment.score };
  });
}

// ---------------------------------------------------------------------------
// Misalignment alerts
// ---------------------------------------------------------------------------

/**
 * Generate misalignment alerts for tags that deviate beyond thresholds.
 *
 * @param alignment - Alignment score result.
 * @param warningThreshold - Percentage deviation for a warning (default 10).
 * @param criticalThreshold - Percentage deviation for critical (default 20).
 * @returns Array of MisalignmentAlerts sorted by severity then deviation.
 */
export function detectMisalignmentAlerts(
  alignment: AlignmentScore,
  warningThreshold: number = 10,
  criticalThreshold: number = 20,
): MisalignmentAlert[] {
  const alerts: MisalignmentAlert[] = [];

  for (const a of alignment.alignments) {
    const absDev = Math.abs(a.deviationPercent);
    if (absDev <= warningThreshold) continue;

    const direction = a.deviationPercent > 0 ? 'over' : 'under';
    const severity: MisalignmentAlert['severity'] =
      absDev > criticalThreshold ? 'critical' : 'warning';

    alerts.push({
      tag: a.tag,
      message: `${String(a.tag)} spending is ${absDev.toFixed(1)}% ${direction} your target`,
      severity,
      deviationPercent: absDev,
    });
  }

  // Sort: critical first, then by deviation descending
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => {
    const so = severityOrder[a.severity] - severityOrder[b.severity];
    if (so !== 0) return so;
    return b.deviationPercent - a.deviationPercent;
  });
}
