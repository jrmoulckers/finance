// SPDX-License-Identifier: BUSL-1.1

export { categorizeTransaction, suggestCategory, suggestTransactionCategory } from './engine';
export { getConfidence, getConfidenceLevel, meetsConfidenceThreshold } from './confidence';
export {
  AUTO_CATEGORIZATION_CHANGED_EVENT,
  AUTO_CATEGORIZATION_RULES_STORAGE_KEY,
  AUTO_CATEGORIZATION_SETTINGS_STORAGE_KEY,
  clearLearnedRules,
  deleteLearnedRule,
  findLearnedRule,
  loadAutoCategorizationSettings,
  loadLearnedRules,
  saveAutoCategorizationSettings,
  saveLearnedRule,
  saveLearnedRules,
  updateAutoCategorizationSettings,
  updateLearnedRule,
} from './learner';
export {
  AMOUNT_HINTS,
  buildAmountRange,
  extractMerchantKey,
  findBuiltinRuleMatch,
  findLearnedRuleMatch,
  getAmountHint,
  normaliseDescription,
} from './matcher';
export { BUILTIN_RULES, CATEGORY_ALIASES } from './rules';
export {
  clearLearnedRules as clearUserRules,
  findUserRule,
  learnFromCorrection,
  loadUserRules,
  saveUserRules,
} from './user-rules';
export type { UserRule } from './user-rules';
export type {
  AmountHint,
  AmountRange,
  AutoCategorizationSettings,
  BuiltinMerchantRule,
  CategorizationSource,
  CategorySuggestion,
  ConfidenceLevel,
  LearnedCategorizationRule,
  LearnedRuleUpdate,
  LearningEntry,
  MatchKind,
  RuleCategoryKey,
  TransactionLike,
} from './types';
