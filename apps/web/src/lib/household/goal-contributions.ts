// SPDX-License-Identifier: BUSL-1.1

/**
 * Per-member goal contribution tracking engine.
 *
 * Tracks individual member contributions to shared household goals,
 * calculates contribution percentages, and provides a fair-share
 * calculator that determines whether members are contributing evenly.
 *
 * All monetary values are in integer cents. All functions are pure.
 * Percentages use Banker's rounding to the nearest integer.
 *
 * References: issue #1787
 */

import type { SyncId } from '../../kmp/bridge';
import type { FairShareResult, GoalContributionEntry, MemberContribution } from './types';

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/**
 * Round to the nearest integer using Banker's rounding (round half to even).
 *
 * @param value - The value to round
 * @returns Banker's-rounded integer
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;

  const floored = Math.floor(value);
  const decimal = value - floored;

  // Not at the 0.5 boundary — use normal rounding
  if (Math.abs(decimal - 0.5) > 1e-9) {
    return Math.round(value);
  }

  // At 0.5 — round to even
  return floored % 2 === 0 ? floored : floored + 1;
}

// ---------------------------------------------------------------------------
// Contribution calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the total contributions to a specific goal.
 *
 * @param entries - All contribution entries
 * @param goalId - The goal to sum for
 * @returns Total contributions in cents
 */
export function totalGoalContributions(
  entries: readonly GoalContributionEntry[],
  goalId: SyncId,
): number {
  return entries.filter((e) => e.goalId === goalId).reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * Build per-member contribution summaries for a goal.
 *
 * Calculates each member's total contribution and their percentage of
 * the overall contributions. Uses Banker's rounding for percentages.
 *
 * @param entries - All contribution entries
 * @param goalId - The goal to summarize
 * @param memberNames - Map of member ID to display name
 * @returns Per-member contribution summaries, sorted by total descending
 */
export function buildMemberContributions(
  entries: readonly GoalContributionEntry[],
  goalId: SyncId,
  memberNames: ReadonlyMap<SyncId, string | null>,
): MemberContribution[] {
  const goalEntries = entries.filter((e) => e.goalId === goalId);
  const total = goalEntries.reduce((sum, e) => sum + e.amountCents, 0);

  // Group by member
  const memberTotals = new Map<SyncId, number>();
  for (const entry of goalEntries) {
    memberTotals.set(entry.memberId, (memberTotals.get(entry.memberId) ?? 0) + entry.amountCents);
  }

  const contributions: MemberContribution[] = [];
  for (const [memberId, memberTotal] of memberTotals) {
    contributions.push({
      memberId,
      memberName: memberNames.get(memberId) ?? null,
      totalCents: memberTotal,
      percentageOfTotal: total > 0 ? bankersRound((memberTotal / total) * 100) : 0,
    });
  }

  // Sort by total descending
  contributions.sort((a, b) => b.totalCents - a.totalCents);

  return contributions;
}

/**
 * Calculate fair-share amounts for each contributing member.
 *
 * Fair share divides the target amount evenly among the specified members.
 * Any remainder cents are distributed one-at-a-time to members in order
 * to ensure the total matches exactly (no rounding drift).
 *
 * @param targetAmountCents - The goal's target amount in cents
 * @param entries - All contribution entries
 * @param goalId - The goal to calculate fair shares for
 * @param memberIds - Members who should contribute equally
 * @returns Per-member fair-share results
 */
export function calculateFairShares(
  targetAmountCents: number,
  entries: readonly GoalContributionEntry[],
  goalId: SyncId,
  memberIds: readonly SyncId[],
): FairShareResult[] {
  if (memberIds.length === 0) return [];

  const baseShare = Math.floor(targetAmountCents / memberIds.length);
  const remainder = targetAmountCents - baseShare * memberIds.length;

  // Build actual contributions per member
  const goalEntries = entries.filter((e) => e.goalId === goalId);
  const actualMap = new Map<SyncId, number>();
  for (const entry of goalEntries) {
    if (memberIds.includes(entry.memberId)) {
      actualMap.set(entry.memberId, (actualMap.get(entry.memberId) ?? 0) + entry.amountCents);
    }
  }

  return memberIds.map((memberId, index) => {
    // First `remainder` members get +1 cent
    const expectedCents = baseShare + (index < remainder ? 1 : 0);
    const actualCents = actualMap.get(memberId) ?? 0;

    return {
      memberId,
      expectedCents,
      actualCents,
      differenceCents: actualCents - expectedCents,
    };
  });
}

/**
 * Get the contribution history for a specific member on a specific goal.
 *
 * @param entries - All contribution entries
 * @param goalId - Goal to filter for
 * @param memberId - Member to filter for
 * @returns Contribution entries sorted by date ascending
 */
export function getMemberContributionHistory(
  entries: readonly GoalContributionEntry[],
  goalId: SyncId,
  memberId: SyncId,
): GoalContributionEntry[] {
  return entries
    .filter((e) => e.goalId === goalId && e.memberId === memberId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate the contribution percentage for a single member.
 *
 * @param entries - All contribution entries
 * @param goalId - Goal to calculate for
 * @param memberId - Member to calculate for
 * @returns Percentage (0–100) using Banker's rounding, or 0 if no contributions
 */
export function memberContributionPercentage(
  entries: readonly GoalContributionEntry[],
  goalId: SyncId,
  memberId: SyncId,
): number {
  const total = totalGoalContributions(entries, goalId);
  if (total === 0) return 0;

  const memberTotal = entries
    .filter((e) => e.goalId === goalId && e.memberId === memberId)
    .reduce((sum, e) => sum + e.amountCents, 0);

  return bankersRound((memberTotal / total) * 100);
}
