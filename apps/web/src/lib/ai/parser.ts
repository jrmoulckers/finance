// SPDX-License-Identifier: BUSL-1.1

import type {
  ParseFinancialQueryOptions,
  ParsedFinancialQuery,
  QueryIntent,
  QuerySuggestionGroup,
  TimeRangeEntity,
} from './types';
import { QUERY_SUGGESTION_GROUPS } from './types';

const DEFAULT_LOW_CONFIDENCE = 0.18;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[?!.;,]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const current = startOfDay(date);
  const day = current.getDay();
  const diff = (day + 6) % 7;
  current.setDate(current.getDate() - diff);
  return current;
}

function endOfWeek(date: Date): Date {
  const current = startOfWeek(date);
  current.setDate(current.getDate() + 6);
  return current;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31);
}

function createRange(
  label: string,
  startDate: Date,
  endDate: Date,
  preset: TimeRangeEntity['preset'],
): TimeRangeEntity {
  return {
    label,
    preset,
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

function detectTimeRange(text: string, now: Date): TimeRangeEntity | undefined {
  if (/(all time|overall|ever)/.test(text)) {
    return createRange('all time', new Date(2000, 0, 1), endOfDay(now), 'all-time');
  }

  if (/(year to date|ytd)/.test(text)) {
    return createRange('year to date', startOfYear(now), endOfDay(now), 'year-to-date');
  }

  if (/(today)/.test(text)) {
    return createRange('today', startOfDay(now), endOfDay(now), 'today');
  }

  if (/(yesterday)/.test(text)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return createRange('yesterday', startOfDay(yesterday), endOfDay(yesterday), 'yesterday');
  }

  if (/(this week|current week)/.test(text)) {
    return createRange('this week', startOfWeek(now), endOfDay(now), 'this-week');
  }

  if (/(last week|previous week)/.test(text)) {
    const previousWeek = new Date(startOfWeek(now));
    previousWeek.setDate(previousWeek.getDate() - 7);
    return createRange(
      'last week',
      startOfWeek(previousWeek),
      endOfWeek(previousWeek),
      'last-week',
    );
  }

  if (/(this month|current month)/.test(text)) {
    return createRange('this month', startOfMonth(now), endOfDay(now), 'this-month');
  }

  if (/(last month|previous month)/.test(text)) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return createRange(
      'last month',
      startOfMonth(previousMonth),
      endOfMonth(previousMonth),
      'last-month',
    );
  }

  if (/(this year|current year)/.test(text)) {
    return createRange('this year', startOfYear(now), endOfDay(now), 'this-year');
  }

  if (/(last year|previous year)/.test(text)) {
    const previousYear = new Date(now.getFullYear() - 1, 0, 1);
    return createRange(
      'last year',
      startOfYear(previousYear),
      endOfYear(previousYear),
      'last-year',
    );
  }

  const rollingDays = text.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (rollingDays) {
    const days = Math.max(1, Number.parseInt(rollingDays[1], 10));
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    return createRange(`last ${days} days`, startOfDay(start), endOfDay(now), 'rolling-days');
  }

  const rollingMonths = text.match(/(?:last|past)\s+(\d+)\s+months?/);
  if (rollingMonths) {
    const months = Math.max(1, Number.parseInt(rollingMonths[1], 10));
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    return createRange(
      `last ${months} months`,
      startOfMonth(start),
      endOfDay(now),
      'rolling-months',
    );
  }

  return undefined;
}

function matchKnownEntity(text: string, values: readonly string[] | undefined): string | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  return [...values]
    .sort((left, right) => right.length - left.length)
    .find((value) => text.includes(normalizeText(value)));
}

function detectAmountThreshold(text: string) {
  const match = text.match(
    /\b(over|above|more than|greater than|under|below|less than)\s+\$?(\d+(?:\.\d{1,2})?)/,
  );
  if (!match) {
    return undefined;
  }

  const operator = /under|below|less than/.test(match[1]) ? 'lte' : 'gte';
  const amountCents = Math.round(Number.parseFloat(match[2]) * 100);

  return {
    operator,
    amountCents,
    label: `${operator === 'gte' ? 'over' : 'under'} $${Number.parseFloat(match[2]).toFixed(2)}`,
  } as const;
}

function detectLimit(text: string): number | undefined {
  const explicitTop = text.match(/\b(?:top|largest|biggest)\s+(\d+)\b/);
  if (explicitTop) {
    return Math.max(1, Number.parseInt(explicitTop[1], 10));
  }

  if (/\b(largest|biggest|top|highest)\b/.test(text)) {
    return 5;
  }

  return undefined;
}

function detectMerchant(text: string, reservedValues: readonly string[]): string | undefined {
  const match = text.match(
    /\b(?:at|from|with)\s+([a-z0-9][a-z0-9 '&.-]+?)(?=\s+(?:this|last|past|over|under|above|below|in|on|for|by|goal|budget)\b|$)/i,
  );
  if (!match) {
    return undefined;
  }

  const merchant = match[1].trim();
  const normalizedMerchant = normalizeText(merchant);
  if (reservedValues.some((value) => normalizedMerchant.includes(normalizeText(value)))) {
    return undefined;
  }
  return merchant;
}

function scoreIntent(text: string): {
  intent: QueryIntent;
  score: number;
  matchedPhrases: string[];
} {
  const scoringRules: Array<{ intent: QueryIntent; patterns: RegExp[] }> = [
    {
      intent: 'goal_progress',
      patterns: [/\bon track\b/, /\bgoal\b/, /\btarget\b/, /\bprogress\b/, /savings goal/],
    },
    {
      intent: 'budget_status',
      patterns: [/\bbudget\b/, /over budget/, /under budget/, /budget left/, /budget remaining/],
    },
    {
      intent: 'trend_analysis',
      patterns: [/average monthly/, /\bon average\b/, /\btrend\b/, /trending/, /changed over/],
    },
    {
      intent: 'category_breakdown',
      patterns: [
        /by category/,
        /\bcategories\b/,
        /category breakdown/,
        /top spending categories/,
        /break down/,
      ],
    },
    {
      intent: 'transaction_search',
      patterns: [
        /largest(?:\s+\d+)?\s+transactions?/,
        /biggest(?:\s+\d+)?\s+transactions?/,
        /transactions over/,
        /find transactions?/,
        /show(?: me)?(?: my)?(?:\s+largest)?\s+transactions?/,
        /top\s+\d+\s+transactions?/,
      ],
    },
    {
      intent: 'income_summary',
      patterns: [/\bincome\b/, /\bearn(?:ed)?\b/, /salary/, /paycheck/, /\bmade\b/],
    },
    {
      intent: 'spending_summary',
      patterns: [/\bspent\b/, /\bspend\b/, /\bspending\b/, /expenses?/, /how much did i spend/],
    },
  ];

  const fallback = {
    intent: 'spending_summary' as QueryIntent,
    score: 0,
    matchedPhrases: [] as string[],
  };

  return scoringRules.reduce((best, rule) => {
    const matchedPhrases = rule.patterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source.replace(/\\b/g, ''));
    const score = matchedPhrases.length;

    if (score > best.score) {
      return { intent: rule.intent, score, matchedPhrases };
    }

    return best;
  }, fallback);
}

function inferMetric(text: string): 'spending' | 'income' {
  return /\bincome\b|\bearn(?:ed)?\b|salary|paycheck|made/i.test(text) ? 'income' : 'spending';
}

function inferAnalysisMode(text: string): 'average' | 'trend' {
  return /average monthly|on average|average spending|average income/.test(text)
    ? 'average'
    : 'trend';
}

function buildConfidence(score: number, matchedEntityCount: number): number {
  if (score === 0) {
    return DEFAULT_LOW_CONFIDENCE;
  }

  return Math.min(0.96, 0.34 + score * 0.12 + matchedEntityCount * 0.05);
}

export function parseFinancialQuery(
  input: string,
  options: ParseFinancialQueryOptions = {},
): ParsedFinancialQuery {
  const rawQuery = input.trim();
  const normalizedQuery = normalizeText(rawQuery);
  const now = options.now ?? new Date();

  const intentMatch = scoreIntent(normalizedQuery);
  const category = matchKnownEntity(normalizedQuery, options.knownCategories);
  const account = matchKnownEntity(normalizedQuery, options.knownAccounts);
  const budgetName = matchKnownEntity(normalizedQuery, options.knownBudgets);
  const goalName = matchKnownEntity(normalizedQuery, options.knownGoals);
  const timeRange = detectTimeRange(normalizedQuery, now);
  const amountThreshold = detectAmountThreshold(normalizedQuery);
  const limit = detectLimit(normalizedQuery);
  const merchant = detectMerchant(
    normalizedQuery,
    [category, account, budgetName, goalName].filter(Boolean) as string[],
  );

  const matchedEntityCount = [
    category,
    account,
    budgetName,
    goalName,
    timeRange,
    amountThreshold,
    limit,
    merchant,
  ].filter((value) => value !== undefined).length;

  return {
    rawQuery,
    normalizedQuery,
    intent: intentMatch.intent,
    confidence: buildConfidence(intentMatch.score, matchedEntityCount),
    matchedPhrases: intentMatch.matchedPhrases,
    entities: {
      timeRange,
      category,
      account,
      merchant,
      amountThreshold,
      budgetName,
      goalName,
      limit,
      analysisMode:
        intentMatch.intent === 'trend_analysis' ? inferAnalysisMode(normalizedQuery) : undefined,
      metric:
        intentMatch.intent === 'trend_analysis' || intentMatch.intent === 'income_summary'
          ? inferMetric(normalizedQuery)
          : undefined,
    },
  };
}

export function getQuerySuggestionGroups(): readonly QuerySuggestionGroup[] {
  return QUERY_SUGGESTION_GROUPS;
}
