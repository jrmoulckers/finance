// SPDX-License-Identifier: BUSL-1.1

export interface PayeeHistoryEntry {
  readonly payee: string;
  readonly date: string;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly correctedFrom?: string;
}

export interface PayeeAlias {
  readonly alias: string;
  readonly canonicalPayee: string;
}

export interface PayeeSuggestionContext {
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly limit?: number;
  readonly now?: Date;
  readonly privacyEnabled?: boolean;
}

export interface PayeeSuggestion {
  readonly payee: string;
  readonly confidence: number;
  readonly source: 'history' | 'alias' | 'seeded';
  readonly explanation: string;
  readonly ariaLabel: string;
  readonly completion: string;
}

const SEEDED_PAYEES = ['Amazon', 'Starbucks', 'Costco', 'Target', 'Walmart', 'Uber', 'Netflix'];

export function rankPayeeSuggestions(
  query: string,
  history: readonly PayeeHistoryEntry[],
  aliases: readonly PayeeAlias[] = [],
  context: PayeeSuggestionContext = {},
): PayeeSuggestion[] {
  if (context.privacyEnabled === false) return [];
  const normalizedQuery = normalize(query);
  const candidates = new Map<string, { score: number; reasons: string[]; source: PayeeSuggestion['source'] }>();

  for (const entry of history) {
    addScore(candidates, entry.payee, scoreHistoryEntry(normalizedQuery, entry, context), 'history');
    if (entry.correctedFrom) {
      const correctedScore = scoreText(normalizedQuery, entry.correctedFrom);
      if (correctedScore >= 0.45) {
        addScore(candidates, entry.payee, correctedScore + 0.08, 'alias', ['previous correction']);
      }
    }
  }
  for (const alias of aliases) {
    addScore(candidates, alias.canonicalPayee, scoreText(normalizedQuery, alias.alias) + 0.18, 'alias', [
      'normalized alias match',
    ]);
  }
  for (const seeded of SEEDED_PAYEES) {
    addScore(candidates, seeded, scoreText(normalizedQuery, seeded) * 0.72, 'seeded', ['seeded merchant']);
  }

  return [...candidates.entries()]
    .filter(([, candidate]) => candidate.score > 0.15 || normalizedQuery.length === 0)
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, context.limit ?? 8)
    .map(([payee, candidate]) => ({
      payee,
      confidence: clamp(candidate.score),
      source: candidate.source,
      explanation: candidate.reasons.join(', ') || 'local history match',
      ariaLabel: `Use payee ${payee}`,
      completion: payee,
    }));
}

function scoreHistoryEntry(
  normalizedQuery: string,
  entry: PayeeHistoryEntry,
  context: PayeeSuggestionContext,
): { readonly score: number; readonly reasons: readonly string[] } {
  let score = scoreText(normalizedQuery, entry.payee);
  const reasons: string[] = [];
  if (score >= 0.9) reasons.push('prefix match');
  else if (score >= 0.45) reasons.push('fuzzy match');

  const ageDays = Math.max(0, ((context.now ?? new Date()).getTime() - Date.parse(entry.date)) / 86_400_000);
  if (ageDays <= 30) {
    score += 0.18;
    reasons.push('recent');
  } else if (ageDays <= 180) {
    score += 0.09;
    reasons.push('seen before');
  }
  if (context.accountId && entry.accountId === context.accountId) {
    score += 0.1;
    reasons.push('same account');
  }
  if (context.categoryId && entry.categoryId === context.categoryId) {
    score += 0.1;
    reasons.push('same category');
  }
  return { score, reasons };
}

function addScore(
  candidates: Map<string, { score: number; reasons: string[]; source: PayeeSuggestion['source'] }>,
  payee: string,
  scoreOrResult: number | { readonly score: number; readonly reasons: readonly string[] },
  source: PayeeSuggestion['source'],
  extraReasons: readonly string[] = [],
): void {
  const score = typeof scoreOrResult === 'number' ? scoreOrResult : scoreOrResult.score;
  const reasons = typeof scoreOrResult === 'number' ? extraReasons : [...scoreOrResult.reasons, ...extraReasons];
  if (score <= 0) return;
  const existing = candidates.get(payee);
  if (!existing) {
    candidates.set(payee, { score, reasons: [...reasons], source });
    return;
  }
  existing.score += Math.min(0.18, score * 0.25);
  existing.reasons.push(...reasons.filter((reason) => !existing.reasons.includes(reason)));
  if (source === 'alias' && score >= existing.score) existing.source = 'alias';
}

function scoreText(normalizedQuery: string, text: string): number {
  const normalizedText = normalize(text);
  if (!normalizedQuery) return 0.25;
  if (normalizedText.startsWith(normalizedQuery)) return 1;
  if (normalizedText.includes(normalizedQuery)) return 0.72;
  const queryTokens = normalizedQuery.split(' ');
  const textTokens = normalizedText.split(' ');
  const prefixTokens = queryTokens.filter((queryToken) =>
    textTokens.some((textToken) => textToken.startsWith(queryToken)),
  ).length;
  if (prefixTokens > 0) return 0.45 + prefixTokens / Math.max(queryTokens.length, 1) * 0.2;
  return diceCoefficient(normalizedQuery, normalizedText) * 0.55;
}

function diceCoefficient(left: string, right: string): number {
  const leftPairs = pairs(left);
  const rightPairs = pairs(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;
  const rightBag = [...rightPairs];
  let intersection = 0;
  for (const pair of leftPairs) {
    const index = rightBag.indexOf(pair);
    if (index >= 0) {
      intersection += 1;
      rightBag.splice(index, 1);
    }
  }
  return (2 * intersection) / (leftPairs.length + rightPairs.length);
}

function pairs(value: string): string[] {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}
