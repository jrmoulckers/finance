// SPDX-License-Identifier: BUSL-1.1

import {
  AUTO_CATEGORIZATION_RULES_STORAGE_KEY,
  clearLearnedRules,
  saveLearnedRule,
  saveLearnedRules,
} from './learner';
import { normaliseDescription } from './matcher';
import type { LearnedCategorizationRule } from './types';

export interface UserRule {
  readonly merchant: string;
  readonly categoryId: string;
  readonly learnedAt: string;
}

export function loadUserRules(): UserRule[] {
  try {
    const raw = globalThis.localStorage?.getItem(AUTO_CATEGORIZATION_RULES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is UserRule =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as UserRule).merchant === 'string' &&
        typeof (entry as UserRule).categoryId === 'string' &&
        typeof (entry as UserRule).learnedAt === 'string',
    );
  } catch {
    return [];
  }
}

export function saveUserRules(rules: UserRule[]): void {
  const now = new Date().toISOString();
  const normalizedRules: LearnedCategorizationRule[] = rules.map((rule, index) => ({
    id: `learned-${rule.merchant.replace(/\s+/g, '-')}-${index}`,
    merchant: rule.merchant,
    categoryId: rule.categoryId,
    categoryName: null,
    amountRange: null,
    learnedAt: rule.learnedAt,
    updatedAt: rule.learnedAt ?? now,
    usageCount: 1,
    lastMatchedAt: null,
  }));
  saveLearnedRules(normalizedRules);
}

export function findUserRule(description: string): UserRule | null {
  const merchant = normaliseDescription(description);
  const rules = loadUserRules();

  return (
    rules.find((rule) => merchant === rule.merchant || merchant.includes(rule.merchant)) ?? null
  );
}

export function learnFromCorrection(merchantName: string, categoryId: string): void {
  saveLearnedRule({
    description: merchantName,
    categoryId,
  });
}

export { clearLearnedRules };
