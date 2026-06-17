// SPDX-License-Identifier: BUSL-1.1

import type { AlignmentValueDefinition, AlignmentValueId, UserValuePreference } from './types';

export const ALIGNMENT_PRIORITY_LIMIT = 5;
export const DECISION_ALIGNMENT_STORAGE_KEY = 'finance:decision-alignment-values';

const DEFAULT_WEIGHT_BY_INDEX = [10, 9, 8, 7, 6, 5, 4, 3] as const;

export const ALIGNMENT_VALUES: readonly AlignmentValueDefinition[] = [
  {
    id: 'security',
    label: 'Security',
    description: 'Feeling prepared with savings, insurance, and a steady financial cushion.',
    iconName: 'shield',
    exampleCategories: ['savings', 'insurance', 'emergency fund'],
  },
  {
    id: 'freedom',
    label: 'Freedom',
    description: 'Creating optionality through flexibility, debt payoff, and room to choose.',
    iconName: 'sparkles',
    exampleCategories: ['debt payoff', 'transportation', 'travel freedom'],
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Supporting the people and home life you care about most.',
    iconName: 'home',
    exampleCategories: ['groceries', 'housing', 'childcare'],
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Investing in physical and mental wellbeing.',
    iconName: 'heart-pulse',
    exampleCategories: ['gym', 'medical', 'pharmacy'],
  },
  {
    id: 'growth',
    label: 'Growth',
    description: 'Building future capacity through investing, career, and self-improvement.',
    iconName: 'trending-up',
    exampleCategories: ['investing', 'software', 'career tools'],
  },
  {
    id: 'experiences',
    label: 'Experiences',
    description: 'Using money to create memories, fun, and meaningful moments.',
    iconName: 'plane',
    exampleCategories: ['travel', 'restaurants', 'entertainment'],
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Learning, training, and expanding your knowledge.',
    iconName: 'medal',
    exampleCategories: ['courses', 'tuition', 'books'],
  },
  {
    id: 'generosity',
    label: 'Generosity',
    description: 'Giving intentionally to people, causes, and community.',
    iconName: 'gift',
    exampleCategories: ['donations', 'charity', 'giving'],
  },
] as const;

export const ALIGNMENT_VALUE_MAP = new Map<AlignmentValueId, AlignmentValueDefinition>(
  ALIGNMENT_VALUES.map((value) => [value.id, value]),
);

function clampPreferenceWeight(weight: number): number {
  if (!Number.isFinite(weight)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.round(weight)));
}

export function createDefaultValuePreferences(): UserValuePreference[] {
  return ALIGNMENT_VALUES.map((value, index) => ({
    valueId: value.id,
    weight: DEFAULT_WEIGHT_BY_INDEX[index] ?? 5,
  }));
}

export function normalizeValuePreferences(input: unknown): UserValuePreference[] {
  const defaults = createDefaultValuePreferences();
  if (!Array.isArray(input)) {
    return defaults;
  }

  const byId = new Map(defaults.map((preference) => [preference.valueId, preference]));
  const seen = new Set<AlignmentValueId>();
  const normalized: UserValuePreference[] = [];

  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const valueId =
      'valueId' in candidate && typeof candidate.valueId === 'string'
        ? (candidate.valueId as AlignmentValueId)
        : null;

    if (valueId === null || !byId.has(valueId) || seen.has(valueId)) {
      continue;
    }

    const weight =
      'weight' in candidate && typeof candidate.weight === 'number' ? candidate.weight : 5;
    normalized.push({ valueId, weight: clampPreferenceWeight(weight) });
    seen.add(valueId);
  }

  for (const fallback of defaults) {
    if (!seen.has(fallback.valueId)) {
      normalized.push(fallback);
    }
  }

  return normalized;
}

export function getTopPriorityPreferences(
  preferences: readonly UserValuePreference[],
  limit: number = ALIGNMENT_PRIORITY_LIMIT,
): readonly UserValuePreference[] {
  return preferences.slice(0, limit);
}
