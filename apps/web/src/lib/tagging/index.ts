// SPDX-License-Identifier: BUSL-1.1

/**
 * Barrel exports for the auto-tagging system.
 *
 * @module lib/tagging
 * References: issue #1473
 */

export type {
  AutoTaggingSettings,
  TagAction,
  TagActionType,
  TagCondition,
  TagConditionField,
  TagConditionOperator,
  TagFrequency,
  TaggingPattern,
  TaggingRule,
  TagSuggestion,
} from './tagging-types';

export { DEFAULT_AUTO_TAGGING_SETTINGS } from './tagging-types';

export {
  createRule,
  createRuleFromTransaction,
  deleteRule,
  evaluateRules,
  evaluateRulesWithIds,
  incrementMatchCounts,
  loadRules,
  matchCondition,
  saveRules,
  updateRule,
} from './rule-engine';

export {
  clearPatterns,
  getPatternForCounterparty,
  getSuggestedTags,
  loadPatterns,
  normaliseCounterparty,
  recordTagging,
  savePatterns,
} from './pattern-tracker';
