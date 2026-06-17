// SPDX-License-Identifier: BUSL-1.1

import { buildAmountRange, extractMerchantKey, normaliseDescription } from './matcher';
import type {
  AutoCategorizationSettings,
  LearnedCategorizationRule,
  LearnedRuleUpdate,
  LearningEntry,
} from './types';

export const AUTO_CATEGORIZATION_RULES_STORAGE_KEY = 'finance-user-categorization-rules';
export const AUTO_CATEGORIZATION_SETTINGS_STORAGE_KEY = 'finance:auto-categorization-settings';
export const AUTO_CATEGORIZATION_CHANGED_EVENT = 'finance:auto-categorization-changed';

const DEFAULT_SETTINGS: AutoCategorizationSettings = {
  enabled: true,
  confidenceThreshold: 0.75,
};

function canUseStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined';
}

function emitChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTO_CATEGORIZATION_CHANGED_EVENT));
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampThreshold(value: number): number {
  return Math.max(0.5, Math.min(0.95, Number(value.toFixed(2))));
}

function isLearnedRule(value: unknown): value is LearnedCategorizationRule {
  return (
    isObjectRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.merchant === 'string' &&
    typeof value.categoryId === 'string' &&
    typeof value.learnedAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.usageCount === 'number' &&
    (value.categoryName === null || typeof value.categoryName === 'string') &&
    (value.lastMatchedAt === null || typeof value.lastMatchedAt === 'string') &&
    (value.amountRange === null ||
      (isObjectRecord(value.amountRange) &&
        typeof value.amountRange.minCents === 'number' &&
        typeof value.amountRange.maxCents === 'number'))
  );
}

export function loadLearnedRules(): LearnedCategorizationRule[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = localStorage.getItem(AUTO_CATEGORIZATION_RULES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isLearnedRule)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function saveLearnedRules(rules: readonly LearnedCategorizationRule[]): void {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(AUTO_CATEGORIZATION_RULES_STORAGE_KEY, JSON.stringify(rules));
  emitChange();
}

export function saveLearnedRule(entry: LearningEntry): LearnedCategorizationRule | null {
  const merchant = extractMerchantKey(entry.description) || normaliseDescription(entry.description);
  if (!merchant || !entry.categoryId) {
    return null;
  }

  const rules = loadLearnedRules();
  const now = new Date().toISOString();
  const amountRange =
    typeof entry.amountCents === 'number' ? buildAmountRange(entry.amountCents) : null;
  const existingIndex = rules.findIndex((rule) => rule.merchant === merchant);
  const existingRule = existingIndex >= 0 ? rules[existingIndex] : null;

  const nextRule: LearnedCategorizationRule = {
    id: existingRule?.id ?? `learned-${merchant.replace(/\s+/g, '-')}`,
    merchant,
    categoryId: entry.categoryId,
    categoryName: entry.categoryName ?? existingRule?.categoryName ?? null,
    amountRange: amountRange ?? existingRule?.amountRange ?? null,
    learnedAt: existingRule?.learnedAt ?? now,
    updatedAt: now,
    usageCount: (existingRule?.usageCount ?? 0) + 1,
    lastMatchedAt: existingRule?.lastMatchedAt ?? null,
  };

  if (existingIndex >= 0) {
    rules.splice(existingIndex, 1, nextRule);
  } else {
    rules.unshift(nextRule);
  }

  saveLearnedRules(rules);
  return nextRule;
}

export function updateLearnedRule(
  ruleId: string,
  updates: LearnedRuleUpdate,
): LearnedCategorizationRule | null {
  const rules = loadLearnedRules();
  const ruleIndex = rules.findIndex((rule) => rule.id === ruleId);
  if (ruleIndex < 0) {
    return null;
  }

  const existingRule = rules[ruleIndex];
  const nextMerchant =
    updates.merchant !== undefined
      ? extractMerchantKey(updates.merchant) || normaliseDescription(updates.merchant)
      : existingRule.merchant;

  if (!nextMerchant) {
    return null;
  }

  const nextRule: LearnedCategorizationRule = {
    ...existingRule,
    merchant: nextMerchant,
    categoryId: updates.categoryId ?? existingRule.categoryId,
    categoryName:
      updates.categoryName !== undefined ? updates.categoryName : existingRule.categoryName,
    amountRange: updates.amountRange !== undefined ? updates.amountRange : existingRule.amountRange,
    updatedAt: new Date().toISOString(),
  };

  rules.splice(ruleIndex, 1, nextRule);
  saveLearnedRules(rules);
  return nextRule;
}

export function deleteLearnedRule(ruleId: string): void {
  const nextRules = loadLearnedRules().filter((rule) => rule.id !== ruleId);
  saveLearnedRules(nextRules);
}

export function clearLearnedRules(): void {
  if (!canUseStorage()) {
    return;
  }

  localStorage.removeItem(AUTO_CATEGORIZATION_RULES_STORAGE_KEY);
  emitChange();
}

export function findLearnedRule(description: string): LearnedCategorizationRule | null {
  const merchant = extractMerchantKey(description) || normaliseDescription(description);
  if (!merchant) {
    return null;
  }

  const rules = loadLearnedRules();
  return (
    rules.find((rule) => merchant === rule.merchant || merchant.includes(rule.merchant)) ?? null
  );
}

export function loadAutoCategorizationSettings(): AutoCategorizationSettings {
  if (!canUseStorage()) {
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(AUTO_CATEGORIZATION_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) {
      return DEFAULT_SETTINGS;
    }

    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
      confidenceThreshold:
        typeof parsed.confidenceThreshold === 'number'
          ? clampThreshold(parsed.confidenceThreshold)
          : DEFAULT_SETTINGS.confidenceThreshold,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAutoCategorizationSettings(settings: AutoCategorizationSettings): void {
  if (!canUseStorage()) {
    return;
  }

  const nextSettings: AutoCategorizationSettings = {
    enabled: settings.enabled,
    confidenceThreshold: clampThreshold(settings.confidenceThreshold),
  };

  localStorage.setItem(AUTO_CATEGORIZATION_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  emitChange();
}

export function updateAutoCategorizationSettings(
  partialSettings: Partial<AutoCategorizationSettings>,
): AutoCategorizationSettings {
  const nextSettings = {
    ...loadAutoCategorizationSettings(),
    ...partialSettings,
  } satisfies AutoCategorizationSettings;

  saveAutoCategorizationSettings(nextSettings);
  return nextSettings;
}
