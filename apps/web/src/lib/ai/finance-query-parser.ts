// SPDX-License-Identifier: BUSL-1.1

export type FinanceQueryIntent =
  | 'spend-by-category'
  | 'spend-by-merchant'
  | 'spend-by-account'
  | 'net-worth'
  | 'unknown';

export interface FinanceQueryParseResult {
  readonly intent: FinanceQueryIntent;
  readonly category: string | null;
  readonly merchant: string | null;
  readonly account: string | null;
  readonly dateRange: 'today' | 'this-month' | 'last-month' | 'this-year' | 'all-time';
  readonly confidence: number;
}

function extractAfter(text: string, markers: readonly string[]): string | null {
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index >= 0) {
      return (
        text
          .slice(index + marker.length)
          .trim()
          .split(/\s+(?:today|yesterday|this|last|from|in|on)\b/)[0]
          .trim() || null
      );
    }
  }
  return null;
}

export function parseFinanceQuery(rawQuery: string): FinanceQueryParseResult {
  const query = rawQuery.trim().toLowerCase();
  const dateRange = query.includes('today')
    ? 'today'
    : query.includes('last month')
      ? 'last-month'
      : query.includes('year')
        ? 'this-year'
        : query.includes('month')
          ? 'this-month'
          : 'all-time';

  if (query.includes('net worth')) {
    return {
      intent: 'net-worth',
      category: null,
      merchant: null,
      account: null,
      dateRange,
      confidence: 0.9,
    };
  }

  const merchant = extractAfter(query, [' at ', ' merchant ']);
  if (merchant) {
    return {
      intent: 'spend-by-merchant',
      category: null,
      merchant,
      account: null,
      dateRange,
      confidence: 0.82,
    };
  }

  const account = extractAfter(query, [' from ', ' account ']);
  if (account) {
    return {
      intent: 'spend-by-account',
      category: null,
      merchant: null,
      account,
      dateRange,
      confidence: 0.78,
    };
  }

  const category = extractAfter(query, [' on ', ' for ', ' category ']);
  if (category || query.includes('spend')) {
    return {
      intent: 'spend-by-category',
      category: category ?? 'all',
      merchant: null,
      account: null,
      dateRange,
      confidence: category ? 0.75 : 0.55,
    };
  }

  return {
    intent: 'unknown',
    category: null,
    merchant: null,
    account: null,
    dateRange,
    confidence: 0,
  };
}
