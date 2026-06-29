// SPDX-License-Identifier: BUSL-1.1

/**
 * Rule validation for the financial automation engine.
 *
 * Detects:
 * - Empty condition sets
 * - Unreachable conditions (NOT with no children)
 * - Conflicting actions within a single rule (e.g. two different categorize
 *   actions, or both split and categorize)
 * - Circular dependency indicators across rules (two rules whose conditions
 *   reference each other's action outputs)
 *
 * Reference: issue #1614
 */

import type {
  CompoundCondition,
  Rule,
  RuleAction,
  RuleCondition,
  ValidationDiagnostic,
  ValidationResult,
} from './types';

// ---------------------------------------------------------------------------
// Condition analysis
// ---------------------------------------------------------------------------

/**
 * Count the total number of leaf conditions in a condition tree.
 *
 * @param condition - Root of the condition tree.
 * @returns The number of leaf nodes.
 */
export function countLeafConditions(condition: RuleCondition): number {
  if (isCompound(condition)) {
    return condition.children.reduce((sum, child) => sum + countLeafConditions(child), 0);
  }
  return 1;
}

/**
 * Check a condition tree for structural issues.
 *
 * @param condition - Root of the condition tree.
 * @param ruleId    - Owning rule identifier (for diagnostics).
 * @returns An array of diagnostics (may be empty).
 */
export function validateConditionTree(
  condition: RuleCondition,
  ruleId: string,
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  if (isCompound(condition)) {
    if (condition.children.length === 0) {
      diagnostics.push({
        severity: 'error',
        ruleId,
        message: `Compound '${condition.type}' condition has no children, so it will always ${condition.type === 'and' ? 'match (vacuous truth)' : 'fail'}.`,
        code: 'EMPTY_CONDITION_SET',
      });
    }

    if (condition.type === 'not' && condition.children.length === 0) {
      diagnostics.push({
        severity: 'error',
        ruleId,
        message: 'NOT condition has no children, so it will always match (vacuous NOT).',
        code: 'UNREACHABLE_CONDITION',
      });
    }

    if (condition.type === 'and' && condition.children.length === 1) {
      diagnostics.push({
        severity: 'info',
        ruleId,
        message: 'AND condition has only one child, so it could be simplified to the child itself.',
        code: 'SIMPLIFIABLE_CONDITION',
      });
    }

    if (condition.type === 'or' && condition.children.length === 1) {
      diagnostics.push({
        severity: 'info',
        ruleId,
        message: 'OR condition has only one child, so it could be simplified to the child itself.',
        code: 'SIMPLIFIABLE_CONDITION',
      });
    }

    // Recurse into children.
    for (const child of condition.children) {
      diagnostics.push(...validateConditionTree(child, ruleId));
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Action conflict detection
// ---------------------------------------------------------------------------

/**
 * Detect conflicting actions within a single rule.
 *
 * Conflicts include:
 * - Multiple `categorize` actions (ambiguous category assignment).
 * - Multiple `split_transaction` actions (cannot split twice).
 * - `split_transaction` combined with `categorize` (split children may
 *   have their own categories; a top-level categorize is contradictory).
 *
 * @param actions - The rule's action list.
 * @param ruleId  - Owning rule identifier (for diagnostics).
 * @returns An array of diagnostics (may be empty).
 */
export function detectConflictingActions(
  actions: readonly RuleAction[],
  ruleId: string,
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const typeCounts = new Map<string, number>();

  for (const action of actions) {
    typeCounts.set(action.type, (typeCounts.get(action.type) ?? 0) + 1);
  }

  const categorizeCount = typeCounts.get('categorize') ?? 0;
  const splitCount = typeCounts.get('split_transaction') ?? 0;

  if (categorizeCount > 1) {
    diagnostics.push({
      severity: 'error',
      ruleId,
      message: `Rule has ${categorizeCount} categorize actions, so only the last one will take effect.`,
      code: 'CONFLICTING_ACTIONS',
    });
  }

  if (splitCount > 1) {
    diagnostics.push({
      severity: 'error',
      ruleId,
      message: `Rule has ${splitCount} split actions, but a transaction can only be split once.`,
      code: 'CONFLICTING_ACTIONS',
    });
  }

  if (splitCount > 0 && categorizeCount > 0) {
    diagnostics.push({
      severity: 'warning',
      ruleId,
      message:
        'Rule has both split and categorize actions, so split children may override the top-level category.',
      code: 'CONFLICTING_ACTIONS',
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Circular dependency detection
// ---------------------------------------------------------------------------

/**
 * Extract the "output fingerprint" of a rule — the set of fields it
 * modifies (via its actions).
 */
function getOutputFields(rule: Rule): Set<string> {
  const fields = new Set<string>();
  for (const action of rule.actions) {
    switch (action.type) {
      case 'categorize':
        fields.add('category');
        break;
      case 'add_tag':
        fields.add('tag');
        break;
      case 'split_transaction':
        fields.add('split');
        break;
      case 'move_to_budget':
        fields.add('budget');
        break;
      case 'flag_for_review':
        fields.add('flag');
        break;
      case 'send_notification':
        fields.add('notification');
        break;
    }
  }
  return fields;
}

/**
 * Extract the "input fingerprint" of a rule — the set of fields its
 * conditions inspect.
 */
function getInputFields(condition: RuleCondition): Set<string> {
  const fields = new Set<string>();

  if (isCompound(condition)) {
    for (const child of condition.children) {
      for (const f of getInputFields(child)) {
        fields.add(f);
      }
    }
    return fields;
  }

  switch (condition.type) {
    case 'amount':
      fields.add('amount');
      break;
    case 'category':
      fields.add('category');
      break;
    case 'merchant':
      fields.add('merchant');
      break;
    case 'date_range':
      fields.add('date');
      break;
    case 'recurring':
      fields.add('recurring');
      break;
    case 'account':
      fields.add('account');
      break;
  }

  return fields;
}

/**
 * Detect potential circular dependencies across a set of rules.
 *
 * A circular dependency exists when Rule A's actions modify a field that
 * Rule B's conditions read, AND Rule B's actions modify a field that
 * Rule A's conditions read. In such a case the evaluation order changes
 * the outcome, which is a design smell.
 *
 * @param rules - The full rule set to analyse.
 * @returns An array of diagnostics (may be empty).
 */
export function detectCircularDependencies(rules: readonly Rule[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  const ruleFingerprints = rules.map((rule) => ({
    rule,
    inputs: getInputFields(rule.condition),
    outputs: getOutputFields(rule),
  }));

  for (let i = 0; i < ruleFingerprints.length; i++) {
    for (let j = i + 1; j < ruleFingerprints.length; j++) {
      const a = ruleFingerprints[i];
      const b = ruleFingerprints[j];

      // Does A's output overlap B's input?
      const aToB = [...a.outputs].some((f) => b.inputs.has(f));
      // Does B's output overlap A's input?
      const bToA = [...b.outputs].some((f) => a.inputs.has(f));

      if (aToB && bToA) {
        diagnostics.push({
          severity: 'warning',
          ruleId: a.rule.id,
          message: `Potential circular dependency between rule "${a.rule.name}" (${a.rule.id}) and rule "${b.rule.name}" (${b.rule.id}). Evaluation order affects the outcome.`,
          code: 'CIRCULAR_DEPENDENCY',
        });
      }
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Full validation
// ---------------------------------------------------------------------------

/**
 * Validate a single rule for structural correctness and action conflicts.
 *
 * @param rule - The rule to validate.
 * @returns A validation result.
 */
export function validateRule(rule: Rule): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  // Condition tree structure.
  diagnostics.push(...validateConditionTree(rule.condition, rule.id));

  // Action conflicts.
  diagnostics.push(...detectConflictingActions(rule.actions, rule.id));

  // Empty actions.
  if (rule.actions.length === 0) {
    diagnostics.push({
      severity: 'warning',
      ruleId: rule.id,
      message: 'Rule has no actions, so it will match but do nothing.',
      code: 'NO_ACTIONS',
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return { valid: !hasErrors, diagnostics };
}

/**
 * Validate an entire rule set: individual rules plus cross-rule analysis.
 *
 * @param rules - The complete rule set.
 * @returns A combined validation result.
 */
export function validateRuleSet(rules: readonly Rule[]): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const rule of rules) {
    const result = validateRule(rule);
    diagnostics.push(...result.diagnostics);
  }

  // Cross-rule circular dependency detection.
  diagnostics.push(...detectCircularDependencies(rules));

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return { valid: !hasErrors, diagnostics };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type guard for compound conditions. */
function isCompound(condition: RuleCondition): condition is CompoundCondition {
  return condition.type === 'and' || condition.type === 'or' || condition.type === 'not';
}
