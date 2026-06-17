// SPDX-License-Identifier: BUSL-1.1

import { ALIGNMENT_VALUE_MAP, getTopPriorityPreferences } from './values';
import type {
  AlignmentScoreResult,
  AlignmentSpendingSnapshot,
  AlignmentValueId,
  MisalignmentAlert,
  UserValuePreference,
} from './types';

function formatExamples(examples: readonly string[]): string {
  if (examples.length <= 1) {
    return examples[0] ?? 'aligned spending';
  }

  if (examples.length === 2) {
    return `${examples[0]} or ${examples[1]}`;
  }

  return `${examples.slice(0, -1).join(', ')}, or ${examples.at(-1)}`;
}

function findDominantCategoryForValue(
  snapshot: AlignmentSpendingSnapshot,
  valueId: AlignmentValueId,
): string | null {
  const matches = snapshot.categories
    .map((category) => {
      const totalWeight = category.allocations.reduce(
        (sum, allocation) => sum + allocation.weight,
        0,
      );
      const matchingAllocation = category.allocations.find(
        (allocation) => allocation.valueId === valueId,
      );
      if (!matchingAllocation || totalWeight <= 0) {
        return null;
      }

      return {
        categoryName: category.categoryName,
        contribution: category.amount * (matchingAllocation.weight / totalWeight),
      };
    })
    .filter(
      (category): category is { categoryName: string; contribution: number } => category !== null,
    )
    .sort((left, right) => right.contribution - left.contribution);

  return matches[0]?.categoryName ?? null;
}

export function generateMisalignmentAlerts(
  snapshot: AlignmentSpendingSnapshot,
  preferences: readonly UserValuePreference[],
  result: AlignmentScoreResult,
): readonly MisalignmentAlert[] {
  const alerts: MisalignmentAlert[] = [];
  const topPreferences = getTopPriorityPreferences(preferences);

  if (snapshot.totalInputAmount > 0 && result.mappedCoverage < 0.65) {
    alerts.push({
      id: 'coverage',
      valueId: 'coverage',
      severity: 'gentle',
      title: 'Categorize a few more expenses for a sharper score',
      description: `${Math.round(result.mappedCoverage * 100)}% of this period's spending mapped to your values. Tagging the remaining categories will make the alignment score more trustworthy.`,
    });
  }

  for (const [index, preference] of topPreferences.entries()) {
    const breakdown = result.breakdown.find((value) => value.valueId === preference.valueId);
    const value = ALIGNMENT_VALUE_MAP.get(preference.valueId);
    if (!breakdown || !value) {
      continue;
    }

    const gap = breakdown.targetShare - breakdown.actualShare;
    if (breakdown.targetShare < 0.1) {
      continue;
    }

    if (breakdown.actualAmount <= 0) {
      alerts.push({
        id: `${preference.valueId}-missing`,
        valueId: preference.valueId,
        severity: index < 2 ? 'warning' : 'gentle',
        title: `${value.label} is not showing up in your spending yet`,
        description: `You ranked ${value.label.toLowerCase()} in your top ${topPreferences.length}, but ${formatExamples(value.exampleCategories)} spending was $0 this period.`,
        actualShare: breakdown.actualShare,
        targetShare: breakdown.targetShare,
      });
      continue;
    }

    if (gap >= 0.1) {
      const dominantCategory = findDominantCategoryForValue(snapshot, preference.valueId);
      alerts.push({
        id: `${preference.valueId}-gap`,
        valueId: preference.valueId,
        severity: gap >= 0.18 ? 'warning' : 'gentle',
        title: `${value.label} is trailing your stated priorities`,
        description: dominantCategory
          ? `${value.label} accounts for ${Math.round(breakdown.actualShare * 100)}% of your mapped spending versus a ${Math.round(breakdown.targetShare * 100)}% target. ${dominantCategory} is the main category carrying that value right now.`
          : `${value.label} accounts for ${Math.round(breakdown.actualShare * 100)}% of your mapped spending versus a ${Math.round(breakdown.targetShare * 100)}% target.`,
        actualShare: breakdown.actualShare,
        targetShare: breakdown.targetShare,
      });
    }
  }

  if (alerts.length < 4) {
    const nonPriorityLeader = result.breakdown.find(
      (value) => value.priorityRank === null && value.actualShare >= 0.22,
    );
    const topGap = result.breakdown.find(
      (value) => value.priorityRank !== null && value.targetShare - value.actualShare >= 0.15,
    );

    if (nonPriorityLeader && topGap) {
      alerts.push({
        id: 'crowding-out',
        valueId: nonPriorityLeader.valueId,
        severity: 'gentle',
        title: `${nonPriorityLeader.label} is taking more room than ${topGap.label}`,
        description: `${nonPriorityLeader.label} absorbed ${Math.round(nonPriorityLeader.actualShare * 100)}% of your mapped spending while ${topGap.label} landed at ${Math.round(topGap.actualShare * 100)}%. That may be a clue to rebalance next month.`,
        actualShare: nonPriorityLeader.actualShare,
        targetShare: topGap.targetShare,
      });
    }
  }

  const deduped = new Map<string, MisalignmentAlert>();
  for (const alert of alerts) {
    if (!deduped.has(alert.id)) {
      deduped.set(alert.id, alert);
    }
  }

  return Array.from(deduped.values()).slice(0, 4);
}
