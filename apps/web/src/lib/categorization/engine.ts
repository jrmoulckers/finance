// SPDX-License-Identifier: BUSL-1.1

import type { Category } from '../../kmp/bridge';
import { getConfidence, getConfidenceLevel } from './confidence';
import { loadLearnedRules } from './learner';
import {
  findBuiltinRuleMatch,
  findLearnedRuleMatch,
  getAmountHint,
  normaliseDescription,
} from './matcher';
import { CATEGORY_ALIASES } from './rules';
import type {
  CategorizationSource,
  CategoryResolution,
  CategorySuggestion,
  MatchKind,
  RuleCategoryKey,
  TransactionLike,
} from './types';

function resolveCategoryByKey(
  categoryKey: RuleCategoryKey,
  categories: readonly Category[],
): CategoryResolution | null {
  const aliases = CATEGORY_ALIASES[categoryKey];
  const indexedCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    normalisedName: normaliseDescription(category.name),
  }));

  for (const alias of aliases) {
    const normalisedAlias = normaliseDescription(alias);
    const exactCategory = indexedCategories.find(
      (category) => category.normalisedName === normalisedAlias,
    );
    if (exactCategory) {
      return { categoryId: exactCategory.id, categoryName: exactCategory.name };
    }
  }

  for (const alias of aliases) {
    const normalisedAlias = normaliseDescription(alias);
    const fuzzyCategory = indexedCategories.find(
      (category) =>
        category.normalisedName.includes(normalisedAlias) ||
        normalisedAlias.includes(category.normalisedName),
    );
    if (fuzzyCategory) {
      return { categoryId: fuzzyCategory.id, categoryName: fuzzyCategory.name };
    }
  }

  return null;
}

function buildSuggestion(input: {
  category: CategoryResolution;
  source: CategorizationSource;
  matchKind: MatchKind;
  merchant: string;
  ruleId: string | null;
  reason: string;
}): CategorySuggestion {
  const confidence = getConfidence(input.matchKind);

  return {
    categoryId: input.category.categoryId,
    categoryName: input.category.categoryName,
    confidence,
    confidenceLevel: getConfidenceLevel(confidence),
    source: input.source,
    matchKind: input.matchKind,
    merchant: input.merchant,
    ruleId: input.ruleId,
    reason: input.reason,
  };
}

export function suggestCategory(
  description: string,
  categories: readonly Category[],
  amountCents?: number,
): CategorySuggestion | null {
  if (!description.trim() || categories.length === 0) {
    return null;
  }

  const learnedMatch = findLearnedRuleMatch(description, amountCents, loadLearnedRules());
  if (learnedMatch) {
    const matchingCategory = categories.find(
      (category) => category.id === learnedMatch.rule.categoryId,
    );
    if (matchingCategory) {
      return buildSuggestion({
        category: { categoryId: matchingCategory.id, categoryName: matchingCategory.name },
        source: 'user',
        matchKind: learnedMatch.matchKind,
        merchant: learnedMatch.rule.merchant,
        ruleId: learnedMatch.rule.id,
        reason:
          learnedMatch.matchKind === 'exact'
            ? 'Matched a merchant you previously corrected.'
            : 'Matched a merchant pattern you previously corrected.',
      });
    }
  }

  const builtinMatch = findBuiltinRuleMatch(description);
  if (builtinMatch) {
    const matchingCategory = resolveCategoryByKey(builtinMatch.rule.categoryKey, categories);
    if (matchingCategory) {
      return buildSuggestion({
        category: matchingCategory,
        source: 'builtin',
        matchKind: builtinMatch.matchKind,
        merchant: builtinMatch.rule.merchants[0] ?? description,
        ruleId: builtinMatch.rule.id,
        reason:
          builtinMatch.matchKind === 'exact'
            ? 'Matched a known merchant exactly.'
            : 'Matched a known merchant pattern.',
      });
    }
  }

  if (amountCents !== undefined) {
    const amountHint = getAmountHint(amountCents);
    if (amountHint) {
      const matchingCategory = resolveCategoryByKey(amountHint.categoryKey, categories);
      if (matchingCategory) {
        return buildSuggestion({
          category: matchingCategory,
          source: 'pattern',
          matchKind: 'amount-range',
          merchant: normaliseDescription(description),
          ruleId: null,
          reason: amountHint.label,
        });
      }
    }
  }

  return null;
}

export function suggestTransactionCategory(
  transaction: TransactionLike,
  categories: readonly Category[],
): CategorySuggestion | null {
  const description =
    transaction.payee?.trim() ||
    transaction.note?.trim() ||
    transaction.counterpartyName?.trim() ||
    '';
  const amountCents = transaction.amount ? Math.abs(transaction.amount.amount) : undefined;

  return suggestCategory(description, categories, amountCents);
}

export const categorizeTransaction = suggestCategory;
