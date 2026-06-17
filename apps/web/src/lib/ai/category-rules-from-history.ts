// SPDX-License-Identifier: BUSL-1.1

export interface RuleMiningTransaction {
  readonly id: string;
  readonly date: string;
  readonly merchant: string;
  readonly amountCents: number;
  readonly categoryId: string;
  readonly tags?: readonly string[];
}

export interface ExistingCategoryRule {
  readonly id: string;
  readonly merchantContains?: string;
  readonly categoryId?: string;
  readonly minAmountCents?: number;
  readonly maxAmountCents?: number;
  readonly tags?: readonly string[];
  readonly enabled?: boolean;
}

export interface CategoryRuleCandidate {
  readonly id: string;
  readonly merchantContains: string;
  readonly categoryId: string;
  readonly amountBand?: string;
  readonly tags: readonly string[];
  readonly confidence: number;
  readonly coverageCount: number;
  readonly sampleTransactionIds: readonly string[];
  readonly conflictRuleIds: readonly string[];
  readonly requiresApproval: true;
  readonly explanation: string;
}

export interface ApprovedCategoryRule {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly conditions: readonly (
    | { readonly type: 'merchant'; readonly value: string }
    | { readonly type: 'amount_range'; readonly value: string }
  )[];
  readonly action: {
    readonly setCategoryId: string;
    readonly addTags?: readonly string[];
    readonly autoReview: boolean;
  };
}

export interface RuleMiningOptions {
  readonly minCoverage?: number;
  readonly minConfidence?: number;
  readonly sampleLimit?: number;
}

const DEFAULT_MIN_COVERAGE = 3;
const DEFAULT_MIN_CONFIDENCE = 0.72;

export function mineCategoryRulesFromHistory(
  transactions: readonly RuleMiningTransaction[],
  existingRules: readonly ExistingCategoryRule[] = [],
  options: RuleMiningOptions = {},
): CategoryRuleCandidate[] {
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const sampleLimit = options.sampleLimit ?? 5;
  const groups = new Map<string, RuleMiningTransaction[]>();

  for (const transaction of transactions) {
    const merchant = normalizeMerchant(transaction.merchant);
    if (!merchant || !transaction.categoryId) continue;
    const key = `${merchant}|${transaction.categoryId}|${amountBand(transaction.amountCents)}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  const candidates: CategoryRuleCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < minCoverage) continue;
    const [merchantContains, categoryId, band] = key.split('|');
    const sameCategoryForMerchant = transactions.filter(
      (transaction) => normalizeMerchant(transaction.merchant) === merchantContains,
    );
    const categoryStability = group.length / Math.max(1, sameCategoryForMerchant.length);
    const tagCounts = countTags(group);
    const stableTags = [...tagCounts.entries()]
      .filter(([, count]) => count / group.length >= 0.7)
      .map(([tag]) => tag)
      .sort();
    const confidence = clamp(0.38 + Math.min(0.25, group.length * 0.04) + categoryStability * 0.3 + stableTags.length * 0.03);
    if (confidence < minConfidence) continue;
    const conflictRuleIds = detectRuleConflicts(merchantContains, categoryId, band, existingRules);
    candidates.push({
      id: `candidate-${slug(merchantContains)}-${categoryId}-${band}`,
      merchantContains,
      categoryId,
      amountBand: band,
      tags: stableTags,
      confidence,
      coverageCount: group.length,
      sampleTransactionIds: group.slice(0, sampleLimit).map((transaction) => transaction.id),
      conflictRuleIds,
      requiresApproval: true,
      explanation: `${group.length} matching corrections for ${merchantContains} with ${Math.round(
        categoryStability * 100,
      )}% category stability`,
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence || b.coverageCount - a.coverageCount);
}

export function detectRuleConflicts(
  merchantContains: string,
  categoryId: string,
  band: string | undefined,
  existingRules: readonly ExistingCategoryRule[],
): string[] {
  return existingRules
    .filter((rule) => rule.enabled !== false)
    .filter((rule) => {
      const merchantOverlap =
        rule.merchantContains !== undefined &&
        (merchantContains.includes(normalizeMerchant(rule.merchantContains)) ||
          normalizeMerchant(rule.merchantContains).includes(merchantContains));
      const categoryConflict = rule.categoryId !== undefined && rule.categoryId !== categoryId;
      const amountOverlap = band === undefined || rangesOverlap(amountRangeForBand(band), rule);
      return merchantOverlap && categoryConflict && amountOverlap;
    })
    .map((rule) => rule.id);
}

export function approveCategoryRule(
  candidate: CategoryRuleCandidate,
  id: string = `rule-${candidate.id}`,
): ApprovedCategoryRule {
  return {
    id,
    name: `Categorize ${candidate.merchantContains} as ${candidate.categoryId}`,
    enabled: true,
    priority: 50,
    conditions: [
      { type: 'merchant', value: candidate.merchantContains },
      { type: 'amount_range', value: amountRangeValue(candidate.amountBand) },
    ],
    action: {
      setCategoryId: candidate.categoryId,
      addTags: candidate.tags.length > 0 ? candidate.tags : undefined,
      autoReview: false,
    },
  };
}

function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

function amountBand(amountCents: number): string {
  const abs = Math.abs(amountCents);
  if (abs < 2_000) return 'micro';
  if (abs < 10_000) return 'small';
  if (abs < 50_000) return 'medium';
  return 'large';
}

function amountRangeForBand(band: string): { readonly min: number; readonly max: number } {
  switch (band) {
    case 'micro':
      return { min: 0, max: 1_999 };
    case 'small':
      return { min: 2_000, max: 9_999 };
    case 'medium':
      return { min: 10_000, max: 49_999 };
    default:
      return { min: 50_000, max: Number.MAX_SAFE_INTEGER };
  }
}

function amountRangeValue(band: string | undefined): string {
  const range = amountRangeForBand(band ?? 'large');
  return `${range.min}:${range.max === Number.MAX_SAFE_INTEGER ? '' : range.max}`;
}

function rangesOverlap(range: { readonly min: number; readonly max: number }, rule: ExistingCategoryRule): boolean {
  const min = rule.minAmountCents ?? Number.MIN_SAFE_INTEGER;
  const max = rule.maxAmountCents ?? Number.MAX_SAFE_INTEGER;
  return range.min <= max && min <= range.max;
}

function countTags(transactions: readonly RuleMiningTransaction[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    for (const tag of transaction.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}
