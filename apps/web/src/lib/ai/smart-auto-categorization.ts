// SPDX-License-Identifier: BUSL-1.1

import { getAmountHint, normaliseDescription } from './categorization-patterns';
import { BUILTIN_RULES } from './categorization-rules';

export interface AiCategory {
  readonly id: string;
  readonly name: string;
}

export interface CategorizationInput {
  readonly description: string;
  readonly amountCents?: number;
  readonly memo?: string;
  readonly accountId?: string;
}

export interface LearnedCategoryCorrection {
  readonly merchant: string;
  readonly categoryId: string;
  readonly amountBand?: string;
  readonly memoTokens?: readonly string[];
  readonly accountId?: string;
  readonly correctionCount?: number;
  readonly learnedAt?: string;
}

export type CategoryCandidateSource = 'learned' | 'builtin' | 'amount' | 'fallback';

export interface CategoryCandidate {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly confidence: number;
  readonly source: CategoryCandidateSource;
  readonly explanation: string;
  readonly autoApply: boolean;
  readonly reviewRequired: boolean;
}

export interface CategorySuggestionOptions {
  readonly autoApplyThreshold?: number;
  readonly now?: Date;
}

interface CandidateDraft {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly confidence: number;
  readonly source: CategoryCandidateSource;
  readonly explanation: string;
}

const DEFAULT_AUTO_APPLY_THRESHOLD = 0.82;
const TOKEN_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'payment',
  'purchase',
  'pos',
]);

export function getCategorizationAmountBand(amountCents: number | undefined): string | undefined {
  if (amountCents === undefined) return undefined;
  const abs = Math.abs(amountCents);
  if (abs < 1_000) return 'micro';
  if (abs < 5_000) return 'small';
  if (abs < 20_000) return 'medium';
  if (abs < 100_000) return 'large';
  return 'major';
}

export function extractCategorizationMemoTokens(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !TOKEN_STOP_WORDS.has(token));
}

export function learnCategoryCorrection(
  input: CategorizationInput,
  categoryId: string,
  existing: readonly LearnedCategoryCorrection[] = [],
): LearnedCategoryCorrection[] {
  const merchant = normalizeMerchantKey(input.description);
  if (!merchant || !categoryId) return [...existing];

  const amountBand = getCategorizationAmountBand(input.amountCents);
  const memoTokens = extractCategorizationMemoTokens(input.memo ?? input.description).slice(0, 8);
  const index = existing.findIndex(
    (entry) =>
      entry.merchant === merchant &&
      entry.categoryId === categoryId &&
      entry.amountBand === amountBand &&
      entry.accountId === input.accountId,
  );
  const next: LearnedCategoryCorrection = {
    merchant,
    categoryId,
    amountBand,
    memoTokens,
    accountId: input.accountId,
    correctionCount: index >= 0 ? (existing[index].correctionCount ?? 1) + 1 : 1,
    learnedAt: new Date().toISOString(),
  };

  if (index < 0) return [...existing, next];
  return existing.map((entry, entryIndex) => (entryIndex === index ? next : entry));
}

export function suggestSmartCategoryCandidates(
  input: CategorizationInput,
  categories: readonly AiCategory[],
  learnedCorrections: readonly LearnedCategoryCorrection[] = [],
  options: CategorySuggestionOptions = {},
): CategoryCandidate[] {
  const threshold = options.autoApplyThreshold ?? DEFAULT_AUTO_APPLY_THRESHOLD;
  const description = normaliseDescription(input.description);
  if (!description || categories.length === 0) return [];

  const drafts: CandidateDraft[] = [
    ...scoreLearnedCorrections(input, categories, learnedCorrections, options.now ?? new Date()),
    ...scoreBuiltInRules(description, categories),
    ...scoreAmountHint(input.amountCents, categories),
  ];

  const ranked = mergeAndRankCandidates(drafts);
  const candidates = ranked.length > 0 ? ranked : [fallbackCandidate(categories[0])];
  const top = candidates[0];
  const runnerUp = candidates[1];
  const ambiguous = runnerUp !== undefined && top.confidence - runnerUp.confidence < 0.08;

  return candidates.map((candidate, index) => {
    const autoApply = index === 0 && candidate.confidence >= threshold && !ambiguous;
    return {
      ...candidate,
      explanation:
        ambiguous && index === 0
          ? `${candidate.explanation}; close alternative requires review`
          : candidate.explanation,
      autoApply,
      reviewRequired: !autoApply,
    };
  });
}

function scoreLearnedCorrections(
  input: CategorizationInput,
  categories: readonly AiCategory[],
  corrections: readonly LearnedCategoryCorrection[],
  now: Date,
): CandidateDraft[] {
  const merchant = normalizeMerchantKey(input.description);
  const band = getCategorizationAmountBand(input.amountCents);
  const tokens = new Set(
    extractCategorizationMemoTokens(`${input.description} ${input.memo ?? ''}`),
  );

  return corrections.flatMap((correction) => {
    const category = categories.find((item) => item.id === correction.categoryId);
    if (!category) return [];

    let score = 0;
    const reasons: string[] = [];
    if (merchant === correction.merchant) {
      score += 0.42;
      reasons.push('same normalized merchant');
    } else if (merchant.includes(correction.merchant) || correction.merchant.includes(merchant)) {
      score += 0.28;
      reasons.push('similar normalized merchant');
    }
    if (band !== undefined && correction.amountBand === band) {
      score += 0.18;
      reasons.push('same amount band');
    }
    const overlap = (correction.memoTokens ?? []).filter((token) => tokens.has(token)).length;
    if (overlap > 0) {
      score += Math.min(0.18, overlap * 0.06);
      reasons.push('memo tokens match');
    }
    if (input.accountId !== undefined && correction.accountId === input.accountId) {
      score += 0.08;
      reasons.push('same account');
    }
    score += Math.min(0.08, (correction.correctionCount ?? 1) * 0.02);
    score += recencyBoost(correction.learnedAt, now);

    if (score < 0.3) return [];
    return [
      {
        categoryId: category.id,
        categoryName: category.name,
        confidence: clamp(score),
        source: 'learned' as const,
        explanation: `learned from corrections: ${reasons.join(', ') || 'historical correction'}`,
      },
    ];
  });
}

function scoreBuiltInRules(
  description: string,
  categories: readonly AiCategory[],
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];
  for (const rule of BUILTIN_RULES) {
    const category = categories.find(
      (item) => item.name.toLowerCase() === rule.categoryName.toLowerCase(),
    );
    if (!category) continue;
    for (const keyword of rule.keywords) {
      if (description === keyword || description.includes(keyword)) {
        const exact = description === keyword;
        drafts.push({
          categoryId: category.id,
          categoryName: category.name,
          confidence: exact ? 0.88 : Math.min(0.82, 0.64 + keyword.length / 80),
          source: 'builtin',
          explanation: exact
            ? `built-in merchant keyword exactly matched "${keyword}"`
            : `built-in merchant keyword matched "${keyword}"`,
        });
      }
    }
  }
  return drafts;
}

function scoreAmountHint(
  amountCents: number | undefined,
  categories: readonly AiCategory[],
): CandidateDraft[] {
  if (amountCents === undefined) return [];
  const hint = getAmountHint(amountCents);
  if (!hint) return [];
  const category = categories.find(
    (item) => item.name.toLowerCase() === hint.categoryName.toLowerCase(),
  );
  if (!category) return [];
  return [
    {
      categoryId: category.id,
      categoryName: category.name,
      confidence: 0.34,
      source: 'amount',
      explanation: `amount falls in the typical ${hint.categoryName.toLowerCase()} range`,
    },
  ];
}

function mergeAndRankCandidates(drafts: readonly CandidateDraft[]): CandidateDraft[] {
  const bestByCategory = new Map<string, CandidateDraft>();
  for (const draft of drafts) {
    const current = bestByCategory.get(draft.categoryId);
    if (!current || draft.confidence > current.confidence) {
      bestByCategory.set(draft.categoryId, draft);
    }
  }
  return [...bestByCategory.values()].sort((a, b) => b.confidence - a.confidence);
}

function fallbackCandidate(category: AiCategory): CandidateDraft {
  return {
    categoryId: category.id,
    categoryName: category.name,
    confidence: 0.15,
    source: 'fallback',
    explanation: 'no strong merchant, learned, or amount signal; queued for review',
  };
}

function normalizeMerchantKey(description: string): string {
  return normaliseDescription(description)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\b(pos|debit|credit|card|purchase|payment)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

function recencyBoost(learnedAt: string | undefined, now: Date): number {
  if (!learnedAt) return 0;
  const learnedTime = Date.parse(learnedAt);
  if (Number.isNaN(learnedTime)) return 0;
  const ageDays = Math.max(0, (now.getTime() - learnedTime) / 86_400_000);
  if (ageDays <= 30) return 0.06;
  if (ageDays <= 120) return 0.03;
  return 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.98, Number(value.toFixed(2))));
}
