// SPDX-License-Identifier: BUSL-1.1

export type SearchTransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';
export type SearchAggregate = 'list' | 'sum' | 'count' | 'average';

export interface SearchTransaction {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly payee: string;
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly accountId?: string;
  readonly accountName?: string;
  readonly type?: SearchTransactionType;
}

export interface SearchCategoryOption {
  readonly id: string;
  readonly name: string;
  readonly synonyms?: readonly string[];
}

export interface DateRangeFilter {
  readonly start: string;
  readonly end: string;
}

export interface AmountRangeFilter {
  readonly minCents?: number;
  readonly maxCents?: number;
}

export interface TransactionSearchFilters {
  readonly dateRange?: DateRangeFilter;
  readonly categoryId?: string;
  readonly categoryName?: string;
  readonly merchant?: string;
  readonly account?: string;
  readonly amountRange?: AmountRangeFilter;
  readonly type?: SearchTransactionType;
}

export interface ParsedTransactionSearchQuery {
  readonly rawQuery: string;
  readonly aggregate: SearchAggregate;
  readonly filters: TransactionSearchFilters;
  readonly interpretedSummary: string;
  readonly ambiguousCategoryNames: readonly string[];
}

export interface TransactionSearchResult {
  readonly parsed: ParsedTransactionSearchQuery;
  readonly matches: readonly SearchTransaction[];
  readonly aggregateValueCents: number | null;
  readonly noMatch: boolean;
  readonly ambiguousCategory: boolean;
}

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

export function parseTransactionSearchQuery(
  query: string,
  categories: readonly SearchCategoryOption[] = [],
  baseDate: Date = new Date(),
): ParsedTransactionSearchQuery {
  const rawQuery = query.trim();
  const lower = rawQuery.toLowerCase();
  const aggregate = inferAggregate(lower);
  const dateRange = inferDateRange(lower, stripTime(baseDate));
  const amountRange = inferAmountRange(lower);
  const type = inferType(lower);
  const categoryMatch = inferCategory(lower, categories);
  const merchant = inferMerchant(lower, categoryMatch.names);
  const account = inferAccount(lower);
  const filters: TransactionSearchFilters = {
    dateRange,
    amountRange,
    type,
    categoryId: categoryMatch.category?.id,
    categoryName: categoryMatch.category?.name,
    merchant,
    account,
  };

  return {
    rawQuery,
    aggregate,
    filters,
    interpretedSummary: summarize(filters, aggregate),
    ambiguousCategoryNames: categoryMatch.ambiguous,
  };
}

export function executeTransactionSearch(
  query: string,
  transactions: readonly SearchTransaction[],
  categories: readonly SearchCategoryOption[] = [],
  baseDate: Date = new Date(),
): TransactionSearchResult {
  const parsed = parseTransactionSearchQuery(query, categories, baseDate);
  const matches = transactions.filter((transaction) => matchesFilters(transaction, parsed.filters));
  return {
    parsed,
    matches,
    aggregateValueCents: aggregateMatches(matches, parsed.aggregate),
    noMatch: matches.length === 0,
    ambiguousCategory: parsed.ambiguousCategoryNames.length > 1,
  };
}

function inferAggregate(lower: string): SearchAggregate {
  if (/\b(count|how many|number of)\b/.test(lower)) return 'count';
  if (/\b(avg|average|mean)\b/.test(lower)) return 'average';
  if (/\b(how much|total|sum|spend|spent|income)\b/.test(lower)) return 'sum';
  return 'list';
}

function inferDateRange(lower: string, baseDate: Date): DateRangeFilter | undefined {
  if (/\blast month\b/.test(lower)) {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
    const end = new Date(baseDate.getFullYear(), baseDate.getMonth(), 0);
    return range(start, end);
  }
  if (/\bthis week\b/.test(lower)) {
    const day = baseDate.getDay() || 7;
    return range(addDays(baseDate, 1 - day), addDays(baseDate, 7 - day));
  }
  if (/\byear to date\b|\bytd\b/.test(lower)) {
    return range(new Date(baseDate.getFullYear(), 0, 1), baseDate);
  }
  const monthName = Object.keys(MONTHS).find((month) => new RegExp(`\\b${month}\\b`).test(lower));
  if (monthName) {
    const month = MONTHS[monthName];
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : baseDate.getFullYear();
    return range(new Date(year, month, 1), new Date(year, month + 1, 0));
  }
  return undefined;
}

function inferAmountRange(lower: string): AmountRangeFilter | undefined {
  const between = lower.match(/\bbetween\s+\$?(\d+(?:\.\d{1,2})?)\s+(?:and|to)\s+\$?(\d+(?:\.\d{1,2})?)/);
  if (between) return { minCents: dollarsToCents(between[1]), maxCents: dollarsToCents(between[2]) };
  const over = lower.match(/\b(?:over|above|more than|greater than)\s+\$?(\d+(?:\.\d{1,2})?)/);
  if (over) return { minCents: dollarsToCents(over[1]) };
  const under = lower.match(/\b(?:under|below|less than)\s+\$?(\d+(?:\.\d{1,2})?)/);
  if (under) return { maxCents: dollarsToCents(under[1]) };
  return undefined;
}

function inferType(lower: string): SearchTransactionType | undefined {
  if (/\b(transfer|moved money)\b/.test(lower)) return 'TRANSFER';
  if (/\b(income|paycheck|salary|deposit)\b/.test(lower)) return 'INCOME';
  if (/\b(spend|spent|expense|bought|paid)\b/.test(lower)) return 'EXPENSE';
  return undefined;
}

function inferCategory(
  lower: string,
  categories: readonly SearchCategoryOption[],
): { readonly category?: SearchCategoryOption; readonly ambiguous: readonly string[]; readonly names: readonly string[] } {
  const matches = categories.filter((category) => {
    const names = [category.name, ...(category.synonyms ?? [])].map((name) => name.toLowerCase());
    return names.some((name) => new RegExp(`\\b${escapeRegex(name)}\\b`).test(lower));
  });
  return { category: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.map((item) => item.name), names: matches.map((item) => item.name.toLowerCase()) };
}

function inferMerchant(lower: string, categoryNames: readonly string[]): string | undefined {
  const explicit = lower.match(/\b(?:at|from|merchant|payee)\s+([a-z0-9 '&.-]+?)(?=\s+(?:over|under|above|below|last|this|year|in|on|for|count|average|$))/);
  if (explicit) return cleanTerm(explicit[1]);
  const show = lower.match(/\bshow\s+([a-z0-9 '&.-]+?)(?=\s+(?:over|under|above|below|last|this|year|in|on|for|$))/);
  const candidate = cleanTerm(show?.[1] ?? '');
  if (!candidate || categoryNames.includes(candidate)) return undefined;
  return candidate;
}

function inferAccount(lower: string): string | undefined {
  const match = lower.match(/\b(?:account|from account|in account)\s+([a-z0-9 -]+?)(?=\s+(?:over|under|last|this|year|in|on|for|$))/);
  return match ? cleanTerm(match[1]) : undefined;
}

function matchesFilters(transaction: SearchTransaction, filters: TransactionSearchFilters): boolean {
  if (filters.dateRange && (transaction.date < filters.dateRange.start || transaction.date > filters.dateRange.end)) return false;
  if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
  if (filters.categoryName && transaction.categoryName?.toLowerCase() !== filters.categoryName.toLowerCase()) return false;
  if (filters.merchant && !`${transaction.payee}`.toLowerCase().includes(filters.merchant)) return false;
  if (filters.account) {
    const accountText = `${transaction.accountName ?? ''} ${transaction.accountId ?? ''}`.toLowerCase();
    if (!accountText.includes(filters.account)) return false;
  }
  if (filters.type && transaction.type !== filters.type) return false;
  if (filters.amountRange) {
    const amount = Math.abs(transaction.amountCents);
    if (filters.amountRange.minCents !== undefined && amount <= filters.amountRange.minCents) return false;
    if (filters.amountRange.maxCents !== undefined && amount >= filters.amountRange.maxCents) return false;
  }
  return true;
}

function aggregateMatches(matches: readonly SearchTransaction[], aggregate: SearchAggregate): number | null {
  if (aggregate === 'list') return null;
  if (aggregate === 'count') return matches.length;
  const sum = matches.reduce((total, transaction) => total + Math.abs(transaction.amountCents), 0);
  return aggregate === 'average' ? Math.round(sum / Math.max(1, matches.length)) : sum;
}

function summarize(filters: TransactionSearchFilters, aggregate: SearchAggregate): string {
  const parts = [`${aggregate} transactions`];
  if (filters.categoryName) parts.push(`category ${filters.categoryName}`);
  if (filters.merchant) parts.push(`merchant containing ${filters.merchant}`);
  if (filters.dateRange) parts.push(`${filters.dateRange.start} to ${filters.dateRange.end}`);
  if (filters.amountRange?.minCents !== undefined) parts.push('above requested amount');
  if (filters.amountRange?.maxCents !== undefined) parts.push('below requested amount');
  return parts.join('; ');
}

function range(start: Date, end: Date): DateRangeFilter {
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

function dollarsToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function cleanTerm(value: string): string {
  return value.replace(/\b(transactions|spending|expenses|income|payments|for|on|in)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
