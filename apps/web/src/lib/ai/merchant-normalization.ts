// SPDX-License-Identifier: BUSL-1.1

export interface MerchantAliasMapping {
  readonly rawAlias: string;
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly categoryHint?: string;
  readonly matchCount?: number;
}

export interface MerchantSeed {
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly patterns: readonly string[];
  readonly categoryHint?: string;
  readonly logoColor?: string;
}

export type MerchantNormalizationSource = 'learned-alias' | 'seeded-pattern' | 'noise-stripped';

export interface MerchantNormalizationResult {
  readonly canonicalName: string;
  readonly displayName: string;
  readonly confidence: number;
  readonly source: MerchantNormalizationSource;
  readonly explanation: string;
  readonly categoryHint?: string;
  readonly logoColor: string;
}

const COMMON_SEEDS: readonly MerchantSeed[] = [
  { canonicalName: 'Amazon', patterns: ['amazon', 'amzn mktp'], categoryHint: 'Shopping', logoColor: '#ff9900' },
  { canonicalName: 'Starbucks', patterns: ['starbucks', 'sbux'], categoryHint: 'Dining', logoColor: '#006241' },
  { canonicalName: 'Costco', patterns: ['costco'], categoryHint: 'Groceries', logoColor: '#005dab' },
  { canonicalName: 'Uber', patterns: ['uber trip', 'uber eats', 'uber'], categoryHint: 'Transportation', logoColor: '#111111' },
  { canonicalName: 'Walmart', patterns: ['walmart', 'wal-mart'], categoryHint: 'Groceries', logoColor: '#0071ce' },
  { canonicalName: 'Target', patterns: ['target'], categoryHint: 'Shopping', logoColor: '#cc0000' },
];

const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS',
  'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM',
  'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI',
  'WV', 'WY', 'DC',
]);

export function normalizeMerchantName(
  rawDescription: string,
  aliases: readonly MerchantAliasMapping[] = [],
  seeds: readonly MerchantSeed[] = COMMON_SEEDS,
): MerchantNormalizationResult | null {
  const cleaned = stripMerchantNoise(rawDescription);
  if (!cleaned) return null;

  const alias = aliases
    .map((mapping) => ({ mapping, score: aliasScore(cleaned, mapping.rawAlias) }))
    .filter((entry) => entry.score >= 0.82)
    .sort((a, b) => b.score - a.score || (b.mapping.matchCount ?? 0) - (a.mapping.matchCount ?? 0))[0];
  if (alias) {
    return {
      canonicalName: alias.mapping.canonicalName,
      displayName: alias.mapping.displayName ?? alias.mapping.canonicalName,
      confidence: Math.min(0.98, 0.86 + Math.min(0.08, (alias.mapping.matchCount ?? 1) * 0.01)),
      source: 'learned-alias',
      explanation: `learned alias matched "${alias.mapping.rawAlias}"`,
      categoryHint: alias.mapping.categoryHint,
      logoColor: colorForName(alias.mapping.canonicalName),
    };
  }

  const seed = seeds
    .flatMap((candidate) =>
      candidate.patterns.map((pattern) => ({ candidate, pattern, score: aliasScore(cleaned, pattern) })),
    )
    .filter((entry) => entry.score >= 0.74 || cleaned.includes(normalizeComparable(entry.pattern)))
    .sort((a, b) => b.score - a.score || b.pattern.length - a.pattern.length)[0];
  if (seed) {
    return {
      canonicalName: seed.candidate.canonicalName,
      displayName: seed.candidate.displayName ?? seed.candidate.canonicalName,
      confidence: Math.max(0.78, Math.min(0.95, 0.72 + seed.score * 0.2)),
      source: 'seeded-pattern',
      explanation: `seeded merchant pattern matched "${seed.pattern}" after bank noise cleanup`,
      categoryHint: seed.candidate.categoryHint,
      logoColor: seed.candidate.logoColor ?? colorForName(seed.candidate.canonicalName),
    };
  }

  const displayName = titleCase(cleaned);
  return {
    canonicalName: displayName,
    displayName,
    confidence: cleaned === normalizeComparable(rawDescription) ? 0.42 : 0.62,
    source: 'noise-stripped',
    explanation: 'removed processor prefixes, store numbers, and location suffixes',
    logoColor: colorForName(displayName),
  };
}

export function learnMerchantAlias(
  rawDescription: string,
  canonicalName: string,
  existing: readonly MerchantAliasMapping[] = [],
  metadata: Pick<MerchantAliasMapping, 'displayName' | 'categoryHint'> = {},
): MerchantAliasMapping[] {
  const rawAlias = stripMerchantNoise(rawDescription);
  if (!rawAlias || !canonicalName.trim()) return [...existing];
  const index = existing.findIndex(
    (mapping) => normalizeComparable(mapping.rawAlias) === rawAlias && mapping.canonicalName === canonicalName,
  );
  const next: MerchantAliasMapping = {
    rawAlias,
    canonicalName: canonicalName.trim(),
    displayName: metadata.displayName,
    categoryHint: metadata.categoryHint,
    matchCount: index >= 0 ? (existing[index].matchCount ?? 1) + 1 : 1,
  };
  if (index < 0) return [...existing, next];
  return existing.map((mapping, mappingIndex) => (mappingIndex === index ? next : mapping));
}

export function stripMerchantNoise(rawDescription: string): string {
  let value = rawDescription.toUpperCase().trim();
  if (!value) return '';
  value = value.replace(/\b(CARD|CHK|AUTH|PREAUTH|RECURRING)\b/g, ' ');
  value = value.replace(/^(POS|DEBIT|CREDIT|PURCHASE|ACH|CHECKCARD|VISA|MC|MASTERCARD)\s+/g, '');
  value = value.replace(/^(SQ|TST|PAYPAL|PP\*|SP|STRIPE|TOAST|IZ\*)\s*[*-]\s*/g, '');
  value = value.replace(/\b(WWW\.|\.COM|ONLINE|MOBILE|PAYMENT)\b/g, ' ');
  value = value.replace(/[#*]\s*\d{2,}/g, ' ');
  value = value.replace(/\b\d{4,}\b/g, ' ');
  value = value.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ');
  value = removeTrailingLocation(value);
  return normalizeComparable(value);
}

function removeTrailingLocation(value: string): string {
  const tokens = value.replace(/[^A-Z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && STATE_CODES.has(tokens[tokens.length - 1])) {
    tokens.pop();
    while (tokens.length > 1 && /^[A-Z]{3,}$/.test(tokens[tokens.length - 1])) {
      tokens.pop();
      if (tokens.length <= 2) break;
    }
  }
  return tokens.join(' ');
}

function aliasScore(left: string, right: string): number {
  const normalizedRight = normalizeComparable(right);
  if (!left || !normalizedRight) return 0;
  if (left === normalizedRight) return 1;
  if (left.includes(normalizedRight) || normalizedRight.includes(left)) return 0.9;
  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(normalizedRight.split(' '));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z0-9]/g, (letter) => letter.toUpperCase());
}

function colorForName(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 0xffffff;
  return `#${hash.toString(16).padStart(6, '0')}`;
}
