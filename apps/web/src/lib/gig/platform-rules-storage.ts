// SPDX-License-Identifier: BUSL-1.1

/**
 * localStorage persistence for gig-platform mapping rules and expected payouts.
 *
 * Follows the same pattern as the tagging rule engine: a single JSON array
 * under one key, with defensive parsing that never throws. Built-in default
 * rules seed the list on first load so platforms are recognised out of the box.
 *
 * References: issue #2133
 */

import { DEFAULT_GIG_PLATFORM_RULES } from './platform-earnings';
import type { GigMatchField, GigPlatformRule } from './platform-types';

const RULES_STORAGE_KEY = 'finance-gig-platform-rules';
const EXPECTED_STORAGE_KEY = 'finance-gig-expected-payouts';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const VALID_FIELDS: ReadonlySet<GigMatchField> = new Set<GigMatchField>([
  'payee',
  'description',
  'account',
  'any',
]);

function isValidRule(value: unknown): value is GigPlatformRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.platform === 'string' &&
    typeof rule.matchField === 'string' &&
    VALID_FIELDS.has(rule.matchField as GigMatchField) &&
    Array.isArray(rule.keywords) &&
    rule.keywords.every((k) => typeof k === 'string') &&
    typeof rule.enabled === 'boolean' &&
    typeof rule.isBuiltIn === 'boolean' &&
    typeof rule.createdAt === 'string'
  );
}

/**
 * Load all gig-platform rules. Returns the built-in defaults (a fresh copy)
 * when nothing has been persisted yet, and never throws.
 */
export function loadGigPlatformRules(): GigPlatformRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return DEFAULT_GIG_PLATFORM_RULES.map((r) => ({ ...r, keywords: [...r.keywords] }));
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_GIG_PLATFORM_RULES.map((r) => ({ ...r, keywords: [...r.keywords] }));
    }
    return parsed.filter(isValidRule);
  } catch {
    return DEFAULT_GIG_PLATFORM_RULES.map((r) => ({ ...r, keywords: [...r.keywords] }));
  }
}

/** Persist the full list of gig-platform rules. */
export function saveGigPlatformRules(rules: readonly GigPlatformRule[]): void {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

/** Input for creating a new custom rule. */
export interface CreateGigRuleInput {
  readonly platform: string;
  readonly matchField: GigMatchField;
  readonly keywords: readonly string[];
  readonly enabled?: boolean;
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `gig-${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `gig-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create and persist a new custom rule. User rules are prepended so they take
 * precedence over the built-in defaults during matching.
 */
export function createGigPlatformRule(input: CreateGigRuleInput): GigPlatformRule {
  const platform = input.platform.trim();
  if (!platform) throw new Error('Platform name is required.');
  const keywords = input.keywords.map((k) => k.trim()).filter((k) => k.length > 0);
  if (keywords.length === 0) throw new Error('At least one keyword is required.');

  const rule: GigPlatformRule = {
    id: makeId(),
    platform,
    matchField: input.matchField,
    keywords,
    enabled: input.enabled ?? true,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  };

  const rules = loadGigPlatformRules();
  saveGigPlatformRules([rule, ...rules]);
  return rule;
}

/** Toggle a rule's `enabled` flag. Returns the updated rule, or null. */
export function toggleGigPlatformRule(id: string): GigPlatformRule | null {
  const rules = loadGigPlatformRules();
  let updated: GigPlatformRule | null = null;
  const next = rules.map((rule) => {
    if (rule.id !== id) return rule;
    updated = { ...rule, enabled: !rule.enabled };
    return updated;
  });
  if (updated) saveGigPlatformRules(next);
  return updated;
}

/** Delete a rule by id. Returns true when a rule was removed. */
export function deleteGigPlatformRule(id: string): boolean {
  const rules = loadGigPlatformRules();
  const next = rules.filter((rule) => rule.id !== id);
  if (next.length === rules.length) return false;
  saveGigPlatformRules(next);
  return true;
}

// ---------------------------------------------------------------------------
// Expected payouts
// ---------------------------------------------------------------------------

/** Load the platform → expected-cents map. Never throws. */
export function loadExpectedPayouts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(EXPECTED_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        result[key] = Math.trunc(value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Persist the platform → expected-cents map. */
export function saveExpectedPayouts(map: Record<string, number>): void {
  localStorage.setItem(EXPECTED_STORAGE_KEY, JSON.stringify(map));
}

/**
 * Set (or clear) the expected payout for one platform. Passing 0 removes the
 * entry. Returns the updated map.
 */
export function setExpectedPayout(platform: string, cents: number): Record<string, number> {
  const map = loadExpectedPayouts();
  if (!Number.isFinite(cents) || cents <= 0) {
    delete map[platform];
  } else {
    map[platform] = Math.trunc(cents);
  }
  saveExpectedPayouts(map);
  return map;
}
