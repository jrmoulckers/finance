// SPDX-License-Identifier: BUSL-1.1

import type { Category } from '../../kmp/bridge';

export type RuleCategoryKey =
  | 'groceries'
  | 'dining'
  | 'transportation'
  | 'entertainment'
  | 'utilities'
  | 'shopping'
  | 'healthcare';

export type CategorizationSource = 'builtin' | 'user' | 'pattern';

export type MatchKind = 'exact' | 'substring' | 'amount-range';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface AmountRange {
  readonly minCents: number;
  readonly maxCents: number;
}

export interface AmountHint {
  readonly categoryKey: RuleCategoryKey;
  readonly minCents: number;
  readonly maxCents: number;
  readonly label: string;
}

export interface BuiltinMerchantRule {
  readonly id: string;
  readonly categoryKey: RuleCategoryKey;
  readonly merchants: readonly string[];
}

export interface LearnedCategorizationRule {
  readonly id: string;
  readonly merchant: string;
  readonly categoryId: string;
  readonly categoryName: string | null;
  readonly amountRange: AmountRange | null;
  readonly learnedAt: string;
  readonly updatedAt: string;
  readonly usageCount: number;
  readonly lastMatchedAt: string | null;
}

export interface LearningEntry {
  readonly description: string;
  readonly amountCents?: number;
  readonly categoryId: string;
  readonly categoryName?: string | null;
}

export interface LearnedRuleUpdate {
  readonly merchant?: string;
  readonly categoryId?: string;
  readonly categoryName?: string | null;
  readonly amountRange?: AmountRange | null;
}

export interface CategorySuggestion {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly source: CategorizationSource;
  readonly matchKind: MatchKind;
  readonly merchant: string;
  readonly ruleId: string | null;
  readonly reason: string;
}

export interface AutoCategorizationSettings {
  readonly enabled: boolean;
  readonly confidenceThreshold: number;
}

export interface TransactionLike {
  readonly payee?: string | null;
  readonly note?: string | null;
  readonly counterpartyName?: string | null;
  readonly amount?: { readonly amount: number } | null;
  readonly categoryId?: string | null;
}

export interface CategoryResolution {
  readonly categoryId: string;
  readonly categoryName: string;
}

export interface RuleMatch<T> {
  readonly rule: T;
  readonly matchKind: Exclude<MatchKind, 'amount-range'>;
}

export interface CategorizationContext {
  readonly description: string;
  readonly amountCents?: number;
  readonly categories: readonly Category[];
}
