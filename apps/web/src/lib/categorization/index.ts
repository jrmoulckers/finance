// SPDX-License-Identifier: BUSL-1.1

/**
 * On-device auto-categorisation for transactions.
 *
 * @module lib/categorization
 */

export { suggestCategory } from './categorization-engine';
export type { CategorySuggestion, SuggestionSource } from './categorization-engine';
export { normaliseDescription, extractMerchantKey, getAmountHint } from './patterns';
export type { AmountHint } from './patterns';
export { BUILTIN_RULES, findExactBuiltinMatch, findPartialBuiltinMatch } from './rules';
export type { BuiltinRule } from './rules';
export {
  clearLearnedRules,
  findUserRule,
  learnFromCorrection,
  loadUserRules,
  saveUserRules,
} from './user-rules';
export type { UserRule } from './user-rules';
