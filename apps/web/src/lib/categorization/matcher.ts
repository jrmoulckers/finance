// SPDX-License-Identifier: BUSL-1.1

import { BUILTIN_RULES } from './rules';
import type {
  AmountHint,
  AmountRange,
  BuiltinMerchantRule,
  LearnedCategorizationRule,
  RuleMatch,
} from './types';

const MERCHANT_NOISE_WORDS =
  /\b(?:pos|debit|credit|purchase|checkcard|chkcard|card|visa|mastercard|mc|pending|payment|online|recurring|withdrawal|transfer|ach|ref|transaction|store|llc|inc|corp)\b/g;

export const AMOUNT_HINTS: readonly AmountHint[] = [
  { categoryKey: 'dining', minCents: 500, maxCents: 4500, label: 'Typical meal-sized charge' },
  {
    categoryKey: 'entertainment',
    minCents: 799,
    maxCents: 2499,
    label: 'Subscription-sized recurring charge',
  },
  {
    categoryKey: 'transportation',
    minCents: 1500,
    maxCents: 12000,
    label: 'Typical ride-share or fuel purchase',
  },
  {
    categoryKey: 'groceries',
    minCents: 5000,
    maxCents: 25000,
    label: 'Typical grocery basket total',
  },
  {
    categoryKey: 'utilities',
    minCents: 8000,
    maxCents: 40000,
    label: 'Typical monthly utility bill',
  },
] as const;

export function normaliseDescription(description: string): string {
  return description
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[/*#,:;()_.-]+/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(MERCHANT_NOISE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMerchantKey(description: string): string {
  const tokens = normaliseDescription(description)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.slice(0, 3).join(' ');
}

export function buildAmountRange(amountCents: number): AmountRange {
  const absoluteAmount = Math.abs(amountCents);
  const spread = Math.max(500, Math.round(absoluteAmount * 0.2));

  return {
    minCents: Math.max(0, absoluteAmount - spread),
    maxCents: absoluteAmount + spread,
  };
}

export function isAmountInRange(
  amountCents: number | undefined,
  range: AmountRange | null,
): boolean {
  if (amountCents === undefined || range === null) {
    return true;
  }

  const absoluteAmount = Math.abs(amountCents);
  return absoluteAmount >= range.minCents && absoluteAmount <= range.maxCents;
}

export function findBuiltinRuleMatch(description: string): RuleMatch<BuiltinMerchantRule> | null {
  const normalised = normaliseDescription(description);
  const merchantKey = extractMerchantKey(description);

  for (const rule of BUILTIN_RULES) {
    for (const merchant of rule.merchants) {
      const normalisedMerchant = normaliseDescription(merchant);
      if (normalised === normalisedMerchant || merchantKey === normalisedMerchant) {
        return { matchKind: 'exact', rule };
      }
    }
  }

  for (const rule of BUILTIN_RULES) {
    for (const merchant of rule.merchants) {
      const normalisedMerchant = normaliseDescription(merchant);
      if (
        normalised.includes(normalisedMerchant) ||
        merchantKey.includes(normalisedMerchant) ||
        normalisedMerchant.includes(merchantKey)
      ) {
        return { matchKind: 'substring', rule };
      }
    }
  }

  return null;
}

export function findLearnedRuleMatch(
  description: string,
  amountCents: number | undefined,
  rules: readonly LearnedCategorizationRule[],
): RuleMatch<LearnedCategorizationRule> | null {
  const normalised = normaliseDescription(description);
  const merchantKey = extractMerchantKey(description);

  const exactRule = rules.find(
    (rule) =>
      isAmountInRange(amountCents, rule.amountRange) &&
      (rule.merchant === normalised || rule.merchant === merchantKey),
  );
  if (exactRule) {
    return { matchKind: 'exact', rule: exactRule };
  }

  const substringRule = rules.find(
    (rule) =>
      isAmountInRange(amountCents, rule.amountRange) &&
      (normalised.includes(rule.merchant) || merchantKey.includes(rule.merchant)),
  );
  if (substringRule) {
    return { matchKind: 'substring', rule: substringRule };
  }

  return null;
}

export function getAmountHint(amountCents: number): AmountHint | null {
  const absoluteAmount = Math.abs(amountCents);
  return (
    AMOUNT_HINTS.find(
      (hint) => absoluteAmount >= hint.minCents && absoluteAmount <= hint.maxCents,
    ) ?? null
  );
}
