// SPDX-License-Identifier: BUSL-1.1

import type { Category, Transaction } from '../../kmp/bridge';
import { getMonthToDateWindows, normalizeExpense } from '../insights/helpers';
import { ALIGNMENT_PRIORITY_LIMIT, ALIGNMENT_VALUES, getTopPriorityPreferences } from './values';
import type {
  AlignmentScoreResult,
  AlignmentSpendingCategory,
  AlignmentSpendingSnapshot,
  AlignmentValueAllocation,
  AlignmentValueId,
  UserValuePreference,
  ValueAlignmentBreakdown,
} from './types';

interface CategoryRule {
  readonly keywords: readonly string[];
  readonly allocations: readonly AlignmentValueAllocation[];
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    keywords: ['savings', 'save', 'emergency fund', 'reserve', 'rainy day'],
    allocations: [
      { valueId: 'security', weight: 0.6 },
      { valueId: 'freedom', weight: 0.25 },
      { valueId: 'growth', weight: 0.15 },
    ],
  },
  {
    keywords: ['invest', 'investment', 'brokerage', 'retirement', '401k', 'ira', 'pension'],
    allocations: [
      { valueId: 'growth', weight: 0.45 },
      { valueId: 'security', weight: 0.35 },
      { valueId: 'freedom', weight: 0.2 },
    ],
  },
  {
    keywords: ['debt', 'loan payment', 'credit card payment', 'payoff'],
    allocations: [
      { valueId: 'security', weight: 0.5 },
      { valueId: 'freedom', weight: 0.5 },
    ],
  },
  {
    keywords: ['insurance', 'coverage'],
    allocations: [{ valueId: 'security', weight: 1 }],
  },
  {
    keywords: ['mortgage', 'rent', 'utilities', 'housing', 'bill'],
    allocations: [
      { valueId: 'family', weight: 0.55 },
      { valueId: 'security', weight: 0.45 },
    ],
  },
  {
    keywords: ['childcare', 'daycare', 'kid', 'kids', 'children', 'baby'],
    allocations: [
      { valueId: 'family', weight: 0.7 },
      { valueId: 'education', weight: 0.3 },
    ],
  },
  {
    keywords: ['grocery', 'groceries', 'market', 'food'],
    allocations: [
      { valueId: 'health', weight: 0.55 },
      { valueId: 'family', weight: 0.45 },
    ],
  },
  {
    keywords: ['doctor', 'medical', 'dentist', 'pharmacy', 'therapy', 'wellness', 'health'],
    allocations: [{ valueId: 'health', weight: 1 }],
  },
  {
    keywords: ['gym', 'fitness', 'sport', 'sports', 'workout'],
    allocations: [{ valueId: 'health', weight: 1 }],
  },
  {
    keywords: ['travel', 'vacation', 'holiday', 'hotel', 'flight', 'airline'],
    allocations: [
      { valueId: 'experiences', weight: 0.7 },
      { valueId: 'freedom', weight: 0.3 },
    ],
  },
  {
    keywords: ['restaurant', 'restaurants', 'dining', 'coffee', 'cafe', 'entertainment'],
    allocations: [
      { valueId: 'experiences', weight: 0.8 },
      { valueId: 'family', weight: 0.2 },
    ],
  },
  {
    keywords: ['concert', 'movie', 'fun', 'hobby', 'leisure'],
    allocations: [{ valueId: 'experiences', weight: 1 }],
  },
  {
    keywords: ['education', 'tuition', 'course', 'class', 'book', 'books', 'training'],
    allocations: [
      { valueId: 'education', weight: 0.65 },
      { valueId: 'growth', weight: 0.35 },
    ],
  },
  {
    keywords: ['charity', 'donation', 'donations', 'tithe', 'giving', 'nonprofit'],
    allocations: [{ valueId: 'generosity', weight: 1 }],
  },
  {
    keywords: ['gift', 'gifts', 'giving'],
    allocations: [
      { valueId: 'generosity', weight: 0.6 },
      { valueId: 'family', weight: 0.4 },
    ],
  },
  {
    keywords: ['family', 'home improvement', 'furniture', 'household'],
    allocations: [
      { valueId: 'family', weight: 0.7 },
      { valueId: 'security', weight: 0.3 },
    ],
  },
  {
    keywords: ['commute', 'transport', 'transit', 'mobility', 'car', 'fuel'],
    allocations: [
      { valueId: 'freedom', weight: 0.65 },
      { valueId: 'security', weight: 0.35 },
    ],
  },
  {
    keywords: ['business', 'startup', 'software', 'professional', 'networking', 'career'],
    allocations: [
      { valueId: 'growth', weight: 0.6 },
      { valueId: 'freedom', weight: 0.4 },
    ],
  },
];

function normalizeCategoryName(categoryName: string): string {
  return categoryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeAllocations(
  allocations: ReadonlyMap<AlignmentValueId, number>,
): readonly AlignmentValueAllocation[] {
  return Array.from(allocations.entries(), ([valueId, weight]) => ({ valueId, weight }))
    .filter((allocation) => allocation.weight > 0)
    .sort((left, right) => right.weight - left.weight);
}

function getScoreLabel(score: number): AlignmentScoreResult['label'] {
  if (score >= 85) {
    return 'Highly aligned';
  }

  if (score >= 70) {
    return 'Mostly aligned';
  }

  if (score >= 50) {
    return 'Mixed alignment';
  }

  return 'Needs attention';
}

function getEffectivePreferenceWeight(preference: UserValuePreference, index: number): number {
  return preference.weight + Math.max(ALIGNMENT_PRIORITY_LIMIT - index, 0);
}

export function mapCategoryToValueAllocations(
  categoryName: string,
): readonly AlignmentValueAllocation[] {
  const normalizedCategoryName = normalizeCategoryName(categoryName);
  if (!normalizedCategoryName) {
    return [];
  }

  const weights = new Map<AlignmentValueId, number>();

  for (const rule of CATEGORY_RULES) {
    const matchCount = rule.keywords.reduce((count, keyword) => {
      return count + (normalizedCategoryName.includes(keyword) ? 1 : 0);
    }, 0);

    if (matchCount === 0) {
      continue;
    }

    for (const allocation of rule.allocations) {
      weights.set(
        allocation.valueId,
        (weights.get(allocation.valueId) ?? 0) + allocation.weight * matchCount,
      );
    }
  }

  return normalizeAllocations(weights);
}

export function buildAlignmentSpendingSnapshot(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  currentSavings: number,
  now: Date = new Date(),
): AlignmentSpendingSnapshot {
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const totals = new Map<
    string,
    { categoryId: string | null; categoryName: string; amount: number }
  >();
  const { current } = getMonthToDateWindows(now);

  for (const transaction of transactions) {
    if (
      transaction.type !== 'EXPENSE' ||
      transaction.date < current.startDate ||
      transaction.date > current.endDate
    ) {
      continue;
    }

    const key = transaction.categoryId ?? '__uncategorized__';
    const existing = totals.get(key) ?? {
      categoryId: transaction.categoryId,
      categoryName:
        transaction.categoryId === null
          ? 'Uncategorized'
          : (categoriesById.get(transaction.categoryId) ?? 'Unknown'),
      amount: 0,
    };

    existing.amount += normalizeExpense(transaction.amount.amount);
    totals.set(key, existing);
  }

  const snapshotCategories: AlignmentSpendingCategory[] = Array.from(totals.values())
    .filter((category) => category.amount > 0)
    .map((category) => ({
      ...category,
      source: 'expense' as const,
      allocations: mapCategoryToValueAllocations(category.categoryName),
    }));

  if (currentSavings > 0) {
    snapshotCategories.push({
      categoryId: null,
      categoryName: 'Savings & investing',
      amount: currentSavings,
      source: 'savings',
      allocations: mapCategoryToValueAllocations('savings investing'),
    });
  }

  snapshotCategories.sort((left, right) => right.amount - left.amount);

  const totalInputAmount = snapshotCategories.reduce((sum, category) => sum + category.amount, 0);
  const totalMappedAmount = snapshotCategories.reduce((sum, category) => {
    return sum + (category.allocations.length > 0 ? category.amount : 0);
  }, 0);

  return {
    categories: snapshotCategories,
    totalInputAmount,
    totalMappedAmount,
    unmappedAmount: Math.max(totalInputAmount - totalMappedAmount, 0),
  };
}

export function calculateAlignmentScore(
  snapshot: AlignmentSpendingSnapshot,
  preferences: readonly UserValuePreference[],
): AlignmentScoreResult {
  const topPreferences = getTopPriorityPreferences(preferences);
  const rankedPreferenceLookup = new Map(
    topPreferences.map((preference, index) => [preference.valueId, { preference, index }]),
  );
  const actualAmounts = new Map<AlignmentValueId, number>(
    ALIGNMENT_VALUES.map((value) => [value.id, 0]),
  );

  for (const category of snapshot.categories) {
    if (category.allocations.length === 0 || category.amount <= 0) {
      continue;
    }

    const totalAllocationWeight = category.allocations.reduce(
      (sum, allocation) => sum + allocation.weight,
      0,
    );
    if (totalAllocationWeight <= 0) {
      continue;
    }

    for (const allocation of category.allocations) {
      actualAmounts.set(
        allocation.valueId,
        (actualAmounts.get(allocation.valueId) ?? 0) +
          category.amount * (allocation.weight / totalAllocationWeight),
      );
    }
  }

  const totalTargetWeight = topPreferences.reduce((sum, preference, index) => {
    return sum + getEffectivePreferenceWeight(preference, index);
  }, 0);
  const totalConsideredAmount = snapshot.totalMappedAmount;

  const breakdown: ValueAlignmentBreakdown[] = ALIGNMENT_VALUES.map((value) => {
    const rankedPreference = rankedPreferenceLookup.get(value.id);
    const preferenceWeight = rankedPreference
      ? getEffectivePreferenceWeight(rankedPreference.preference, rankedPreference.index)
      : 0;
    const actualAmount = actualAmounts.get(value.id) ?? 0;
    const targetShare = totalTargetWeight > 0 ? preferenceWeight / totalTargetWeight : 0;
    const actualShare = totalConsideredAmount > 0 ? actualAmount / totalConsideredAmount : 0;

    return {
      valueId: value.id,
      label: value.label,
      priorityRank: rankedPreference ? rankedPreference.index + 1 : null,
      preferenceWeight,
      targetShare,
      actualShare,
      actualAmount,
      targetAmount: totalConsideredAmount * targetShare,
      gapShare: actualShare - targetShare,
    };
  }).sort((left, right) => {
    if (left.priorityRank !== null && right.priorityRank !== null) {
      return left.priorityRank - right.priorityRank;
    }

    if (left.priorityRank !== null) {
      return -1;
    }

    if (right.priorityRank !== null) {
      return 1;
    }

    return right.actualAmount - left.actualAmount;
  });

  const totalVariationDistance = breakdown.reduce((sum, value) => {
    return sum + Math.abs(value.actualShare - value.targetShare);
  }, 0);
  const score =
    totalConsideredAmount > 0 && totalTargetWeight > 0
      ? Math.max(0, Math.round((1 - totalVariationDistance / 2) * 100))
      : 0;

  return {
    score,
    label: getScoreLabel(score),
    mappedCoverage:
      snapshot.totalInputAmount > 0 ? snapshot.totalMappedAmount / snapshot.totalInputAmount : 0,
    totalConsideredAmount,
    breakdown,
  };
}
