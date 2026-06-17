// SPDX-License-Identifier: BUSL-1.1

import { addDays } from './reminders';
import type { ReturnWindowRule, ReturnWindowSuggestion } from './types';

export const DEFAULT_RETURN_WINDOW_DAYS = 30;

export const MERCHANT_RETURN_WINDOW_RULES: readonly ReturnWindowRule[] = [
  { label: 'Amazon', days: 30, matchTerms: ['amazon'] },
  { label: 'Costco', days: 90, matchTerms: ['costco'] },
  { label: 'Best Buy', days: 15, matchTerms: ['best buy'] },
  { label: 'Apple', days: 14, matchTerms: ['apple'] },
  { label: 'Target', days: 30, matchTerms: ['target'] },
  { label: 'Walmart', days: 30, matchTerms: ['walmart'] },
];

export const CATEGORY_RETURN_WINDOW_RULES: readonly ReturnWindowRule[] = [
  { label: 'Electronics', days: 15, matchTerms: ['electronics', 'electronic', 'tech'] },
  { label: 'Warehouse club', days: 90, matchTerms: ['warehouse', 'club'] },
  { label: 'Appliances', days: 30, matchTerms: ['appliance', 'home improvement'] },
  { label: 'Clothing', days: 30, matchTerms: ['apparel', 'clothing', 'fashion'] },
];

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function findMatchingRule(
  value: string | null | undefined,
  rules: readonly ReturnWindowRule[],
): { rule: ReturnWindowRule; matchedTerm: string } | null {
  const normalized = normalize(value);

  if (!normalized) {
    return null;
  }

  for (const rule of rules) {
    const matchedTerm = rule.matchTerms.find((term) => normalized.includes(term));
    if (matchedTerm) {
      return { rule, matchedTerm };
    }
  }

  return null;
}

export function suggestReturnWindow(
  merchantName: string | null | undefined,
  purchaseDate: string,
  categoryName?: string | null,
): ReturnWindowSuggestion {
  const merchantMatch = findMatchingRule(merchantName, MERCHANT_RETURN_WINDOW_RULES);
  if (merchantMatch) {
    return {
      label: `${merchantMatch.rule.label} standard return window`,
      days: merchantMatch.rule.days,
      source: 'merchant',
      matchedTerm: merchantMatch.matchedTerm,
      endDate: addDays(purchaseDate, merchantMatch.rule.days),
    };
  }

  const categoryMatch = findMatchingRule(categoryName, CATEGORY_RETURN_WINDOW_RULES);
  if (categoryMatch) {
    return {
      label: `${categoryMatch.rule.label} typical return window`,
      days: categoryMatch.rule.days,
      source: 'category',
      matchedTerm: categoryMatch.matchedTerm,
      endDate: addDays(purchaseDate, categoryMatch.rule.days),
    };
  }

  return {
    label: 'Standard retail return window',
    days: DEFAULT_RETURN_WINDOW_DAYS,
    source: 'default',
    matchedTerm: null,
    endDate: addDays(purchaseDate, DEFAULT_RETURN_WINDOW_DAYS),
  };
}
