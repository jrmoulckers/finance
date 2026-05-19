// SPDX-License-Identifier: BUSL-1.1

/**
 * Rule engine for evaluating tagging rules against transactions.
 *
 * Evaluates user-defined rules in priority order (highest first) and
 * returns the union of all matching actions. Rules use AND logic between
 * conditions — all conditions must match for a rule to fire.
 *
 * @module lib/tagging/rule-engine
 * References: issue #1473
 */

import type { Transaction } from '../../kmp/bridge';
import type { TagAction, TagCondition, TaggingRule } from './tagging-types';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const RULES_STORAGE_KEY = 'finance-tagging-rules';

/** Load all tagging rules from localStorage. Returns an empty array on error. */
export function loadRules(): TaggingRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRule);
  } catch {
    return [];
  }
}

/** Persist the full list of tagging rules to localStorage. */
export function saveRules(rules: TaggingRule[]): void {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Type guard for runtime validation of rule shape from localStorage. */
function isValidRule(value: unknown): value is TaggingRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.name === 'string' &&
    typeof rule.enabled === 'boolean' &&
    Array.isArray(rule.conditions) &&
    Array.isArray(rule.actions) &&
    typeof rule.priority === 'number' &&
    typeof rule.createdAt === 'string' &&
    typeof rule.matchCount === 'number'
  );
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/**
 * Extract the string value from a transaction field for condition matching.
 *
 * Returns the raw field value as a string, or `null` if the field is
 * not present or not applicable.
 */
function getFieldValue(transaction: Transaction, field: TagCondition['field']): string | null {
  switch (field) {
    case 'counterpartyName':
      return transaction.payee ?? null;
    case 'description':
      return transaction.note ?? null;
    case 'amount':
      return String(transaction.amount.amount);
    case 'type':
      return transaction.type;
    case 'category':
      return transaction.categoryId ?? null;
    case 'account':
      return transaction.accountId;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Condition matching
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against a transaction.
 *
 * String comparisons are case-insensitive. Numeric comparisons (greaterThan,
 * lessThan, between) parse the field value and condition value as numbers.
 * The `matches` operator creates a RegExp from the condition value.
 */
export function matchCondition(transaction: Transaction, condition: TagCondition): boolean {
  const rawValue = getFieldValue(transaction, condition.field);

  // If the field is absent, only 'equals' with an empty value could match
  if (rawValue === null) {
    return condition.operator === 'equals' && condition.value === '';
  }

  const fieldLower = rawValue.toLowerCase();
  const conditionLower = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return fieldLower.includes(conditionLower);

    case 'equals':
      return fieldLower === conditionLower;

    case 'startsWith':
      return fieldLower.startsWith(conditionLower);

    case 'endsWith':
      return fieldLower.endsWith(conditionLower);

    case 'greaterThan': {
      const num = parseFloat(rawValue);
      const threshold = parseFloat(condition.value);
      return !isNaN(num) && !isNaN(threshold) && num > threshold;
    }

    case 'lessThan': {
      const num = parseFloat(rawValue);
      const threshold = parseFloat(condition.value);
      return !isNaN(num) && !isNaN(threshold) && num < threshold;
    }

    case 'between': {
      const num = parseFloat(rawValue);
      const lower = parseFloat(condition.value);
      const upper = parseFloat(condition.value2 ?? condition.value);
      return !isNaN(num) && !isNaN(lower) && !isNaN(upper) && num >= lower && num <= upper;
    }

    case 'matches': {
      try {
        const regex = new RegExp(condition.value, 'i');
        return regex.test(rawValue);
      } catch {
        // Invalid regex — treat as non-match
        return false;
      }
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate all enabled rules against a transaction and return matched actions.
 *
 * Rules are sorted by priority (highest first). All matching rules contribute
 * their actions (union). Duplicate addTag actions are deduplicated by tag name.
 * Only the first setCategory action is kept.
 *
 * @returns Array of deduplicated actions from all matching rules
 */
export function evaluateRules(transaction: Transaction, rules: TaggingRule[]): TagAction[] {
  // Sort by priority descending (higher = evaluated first)
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

  const matchedActions: TagAction[] = [];
  const matchedRuleIds: string[] = [];

  for (const rule of sorted) {
    // AND logic: all conditions must match
    const allMatch =
      rule.conditions.length > 0 && rule.conditions.every((c) => matchCondition(transaction, c));

    if (allMatch) {
      matchedActions.push(...rule.actions);
      matchedRuleIds.push(rule.id);
    }
  }

  // Deduplicate: keep unique addTag values, only first setCategory
  return deduplicateActions(matchedActions);
}

/**
 * Evaluate rules and return both matched actions and matched rule IDs.
 *
 * Used by the rule management UI to increment match counts.
 */
export function evaluateRulesWithIds(
  transaction: Transaction,
  rules: TaggingRule[],
): { actions: TagAction[]; matchedRuleIds: string[] } {
  const sorted = [...rules].filter((r) => r.enabled).sort((a, b) => b.priority - a.priority);

  const matchedActions: TagAction[] = [];
  const matchedRuleIds: string[] = [];

  for (const rule of sorted) {
    const allMatch =
      rule.conditions.length > 0 && rule.conditions.every((c) => matchCondition(transaction, c));

    if (allMatch) {
      matchedActions.push(...rule.actions);
      matchedRuleIds.push(rule.id);
    }
  }

  return {
    actions: deduplicateActions(matchedActions),
    matchedRuleIds,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deduplicate actions: unique addTag names, first setCategory wins. */
function deduplicateActions(actions: TagAction[]): TagAction[] {
  const seenTags = new Set<string>();
  let hasCategory = false;
  const result: TagAction[] = [];

  for (const action of actions) {
    if (action.type === 'addTag') {
      const lower = action.value.toLowerCase();
      if (!seenTags.has(lower)) {
        seenTags.add(lower);
        result.push(action);
      }
    } else if (action.type === 'setCategory') {
      if (!hasCategory) {
        hasCategory = true;
        result.push(action);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// CRUD helpers for rules
// ---------------------------------------------------------------------------

/** Create a new tagging rule and persist it. Returns the created rule. */
export function createRule(
  input: Omit<TaggingRule, 'id' | 'createdAt' | 'matchCount'>,
): TaggingRule {
  const rule: TaggingRule = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    matchCount: 0,
  };
  const rules = loadRules();
  rules.push(rule);
  saveRules(rules);
  return rule;
}

/** Update an existing rule by ID. Returns the updated rule or null. */
export function updateRule(
  id: string,
  updates: Partial<Omit<TaggingRule, 'id' | 'createdAt'>>,
): TaggingRule | null {
  const rules = loadRules();
  const index = rules.findIndex((r) => r.id === id);
  if (index < 0) return null;

  const updated: TaggingRule = { ...rules[index], ...updates };
  rules[index] = updated;
  saveRules(rules);
  return updated;
}

/** Delete a rule by ID. Returns true if the rule was found and removed. */
export function deleteRule(id: string): boolean {
  const rules = loadRules();
  const filtered = rules.filter((r) => r.id !== id);
  if (filtered.length === rules.length) return false;
  saveRules(filtered);
  return true;
}

/** Increment the match count for the given rule IDs. */
export function incrementMatchCounts(ruleIds: string[]): void {
  if (ruleIds.length === 0) return;
  const rules = loadRules();
  const idSet = new Set(ruleIds);
  let changed = false;

  const updated = rules.map((r) => {
    if (idSet.has(r.id)) {
      changed = true;
      return { ...r, matchCount: r.matchCount + 1 };
    }
    return r;
  });

  if (changed) saveRules(updated);
}

/**
 * Create a rule pre-filled from a transaction's data.
 *
 * Generates conditions based on the payee (if present), type, and tags
 * to give users a head start when creating rules from transaction detail.
 */
export function createRuleFromTransaction(transaction: Transaction, ruleName: string): TaggingRule {
  const conditions: TagCondition[] = [];

  if (transaction.payee) {
    conditions.push({
      field: 'counterpartyName',
      operator: 'contains',
      value: transaction.payee,
    });
  }

  conditions.push({
    field: 'type',
    operator: 'equals',
    value: transaction.type,
  });

  const actions: TagAction[] = transaction.tags.map((tag) => ({
    type: 'addTag' as const,
    value: tag,
  }));

  return createRule({
    name: ruleName,
    enabled: true,
    conditions,
    actions,
    priority: 50,
  });
}
