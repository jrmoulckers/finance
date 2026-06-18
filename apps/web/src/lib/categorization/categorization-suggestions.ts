// SPDX-License-Identifier: BUSL-1.1

export interface CategoryRule {
  readonly categoryId: string;
  readonly keywords: readonly string[];
}

export interface CategoryCorrection {
  readonly normalizedMerchant: string;
  readonly categoryId: string;
}

export interface CategorizationSuggestionInput {
  readonly merchant: string;
  readonly description: string;
  readonly amountCents: number;
  readonly rules: readonly CategoryRule[];
  readonly corrections: readonly CategoryCorrection[];
}

export interface CategorizationSuggestion {
  readonly categoryId: string | null;
  readonly confidence: number;
  readonly strategy: 'correction' | 'keyword' | 'amount-fallback' | 'unknown';
  readonly matchedOn: string | null;
  readonly needsReview: boolean;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ');
}

export function learnCategoryCorrection(merchant: string, categoryId: string): CategoryCorrection {
  return { normalizedMerchant: normalize(merchant), categoryId };
}

export function suggestCategory(input: CategorizationSuggestionInput): CategorizationSuggestion {
  const merchant = normalize(input.merchant);
  const searchable = normalize(`${input.merchant} ${input.description}`);
  const correction = input.corrections.find((item) => item.normalizedMerchant === merchant);
  if (correction) {
    return {
      categoryId: correction.categoryId,
      confidence: 0.95,
      strategy: 'correction',
      matchedOn: merchant,
      needsReview: false,
    };
  }

  for (const rule of input.rules) {
    const keyword = rule.keywords.find((candidate) => searchable.includes(normalize(candidate)));
    if (keyword) {
      return {
        categoryId: rule.categoryId,
        confidence: 0.72,
        strategy: 'keyword',
        matchedOn: normalize(keyword),
        needsReview: false,
      };
    }
  }

  if (input.amountCents > 0) {
    return {
      categoryId: 'uncategorized-expense',
      confidence: 0.25,
      strategy: 'amount-fallback',
      matchedOn: null,
      needsReview: true,
    };
  }

  return {
    categoryId: null,
    confidence: 0,
    strategy: 'unknown',
    matchedOn: null,
    needsReview: true,
  };
}
