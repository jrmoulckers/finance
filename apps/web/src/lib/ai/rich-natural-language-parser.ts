// SPDX-License-Identifier: BUSL-1.1

export type ParsedTransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

export interface SplitCandidate {
  readonly label: string;
  readonly amount: number;
  readonly confidence: number;
}

export interface FieldConfidence {
  readonly amount: number;
  readonly date: number;
  readonly payee: number;
  readonly type: number;
  readonly splits: number;
}

export interface RichParsedTransaction {
  readonly rawInput: string;
  readonly amount: number | null;
  readonly payee: string;
  readonly date: string;
  readonly type: ParsedTransactionType;
  readonly categoryHints: readonly string[];
  readonly note: string | null;
  readonly accountHints: readonly string[];
  readonly splits: readonly SplitCandidate[];
  readonly confidence: number;
  readonly fieldConfidence: FieldConfidence;
}

export interface RichParserOptions {
  readonly baseDate?: Date;
  readonly locale?: string;
  readonly paydayDay?: number;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const CATEGORY_WORDS = new Set([
  'groceries',
  'grocery',
  'gas',
  'fuel',
  'dining',
  'coffee',
  'rent',
  'utilities',
  'shopping',
  'travel',
  'health',
  'payroll',
]);

const INCOME_WORDS = new Set([
  'salary',
  'paycheck',
  'payroll',
  'deposit',
  'bonus',
  'income',
  'interest',
]);
const TRANSFER_WORDS = new Set(['transfer', 'moved', 'move', 'sent', 'send', 'between']);

interface AmountMatch {
  readonly text: string;
  readonly amount: number;
  readonly index: number;
  readonly end: number;
}

export function parseRichNaturalLanguageTransaction(
  input: string,
  options: RichParserOptions = {},
): RichParsedTransaction {
  const rawInput = input.trim();
  const baseDate = stripTime(options.baseDate ?? new Date());
  if (!rawInput) return emptyResult(rawInput, baseDate);

  const note = extractNote(rawInput);
  const withoutNote =
    note === null ? rawInput : rawInput.replace(/\b(?:note|memo)\s*:\s*.+$/i, '').trim();
  const dateResult = resolveDate(withoutNote, baseDate, options);
  const amounts = extractAmounts(withoutNote);
  const amount = amounts[0]?.amount ?? null;
  const splits = amount === null ? [] : parseSplits(withoutNote, amounts, amount);
  const type = inferType(withoutNote, amount);
  const categoryHints = extractCategoryHints(withoutNote, splits);
  const accountHints = extractAccountHints(withoutNote);
  const payee = extractPayee(withoutNote, amounts, dateResult.matchedText, categoryHints, type);
  const fieldConfidence: FieldConfidence = {
    amount: amount === null ? 0 : 0.95,
    date: dateResult.explicit ? 0.9 : 0.55,
    payee: payee ? 0.82 : 0.15,
    type: type === 'EXPENSE' ? 0.65 : 0.88,
    splits: splits.length === 0 ? 0 : Math.min(0.95, 0.65 + splits.length * 0.1),
  };

  return {
    rawInput,
    amount,
    payee,
    date: formatLocalDate(dateResult.date),
    type,
    categoryHints,
    note,
    accountHints,
    splits,
    confidence: averageConfidence(fieldConfidence),
    fieldConfidence,
  };
}

function emptyResult(rawInput: string, baseDate: Date): RichParsedTransaction {
  return {
    rawInput,
    amount: null,
    payee: '',
    date: formatLocalDate(baseDate),
    type: 'EXPENSE',
    categoryHints: [],
    note: null,
    accountHints: [],
    splits: [],
    confidence: 0,
    fieldConfidence: { amount: 0, date: 0, payee: 0, type: 0, splits: 0 },
  };
}

function resolveDate(
  text: string,
  baseDate: Date,
  options: RichParserOptions,
): { readonly date: Date; readonly explicit: boolean; readonly matchedText: string | null } {
  const lower = text.toLowerCase();
  if (/\byesterday\b/.test(lower))
    return { date: addDays(baseDate, -1), explicit: true, matchedText: 'yesterday' };
  if (/\btoday\b/.test(lower)) return { date: baseDate, explicit: true, matchedText: 'today' };
  if (/\btomorrow\b/.test(lower))
    return { date: addDays(baseDate, 1), explicit: true, matchedText: 'tomorrow' };

  const lastWeekday = lower.match(
    /\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (lastWeekday) {
    const target = WEEKDAYS[lastWeekday[1]];
    const delta = (baseDate.getDay() - target + 7) % 7 || 7;
    return { date: addDays(baseDate, -delta), explicit: true, matchedText: lastWeekday[0] };
  }

  if (/\bnext\s+payday\b/.test(lower)) {
    const paydayDay = Math.max(1, Math.min(28, options.paydayDay ?? 15));
    const candidate = new Date(baseDate);
    if (candidate.getDate() >= paydayDay) candidate.setMonth(candidate.getMonth() + 1);
    candidate.setDate(paydayDay);
    return { date: candidate, explicit: true, matchedText: 'next payday' };
  }

  const slashDate = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const locale = options.locale ?? 'en-US';
    const dayFirst = !locale.toLowerCase().includes('us');
    const month = dayFirst ? second : first;
    const day = dayFirst ? first : second;
    let year = slashDate[3] ? Number(slashDate[3]) : baseDate.getFullYear();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: new Date(year, month - 1, day), explicit: true, matchedText: slashDate[0] };
    }
  }

  return { date: baseDate, explicit: false, matchedText: null };
}

function extractAmounts(text: string): AmountMatch[] {
  const matches: AmountMatch[] = [];
  const regex = /(?:[$€£]\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const previous = text[index - 1] ?? ' ';
    const next = text[index + match[0].length] ?? ' ';
    if (previous === '/' || next === '/') continue;
    const amount = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      matches.push({ text: match[0], amount, index, end: index + match[0].length });
    }
  }
  return matches;
}

function parseSplits(
  text: string,
  amounts: readonly AmountMatch[],
  total: number,
): SplitCandidate[] {
  if (amounts.length < 2) return [];
  const splits: SplitCandidate[] = [];
  for (let index = 1; index < amounts.length; index += 1) {
    const label = cleanLabel(text.slice(amounts[index - 1].end, amounts[index].index));
    if (label) splits.push({ label, amount: amounts[index].amount, confidence: 0.82 });
  }
  const assigned = splits.reduce((sum, split) => sum + split.amount, 0);
  const trailingLabel = cleanLabel(text.slice(amounts[amounts.length - 1].end));
  if (trailingLabel && assigned < total) {
    splits.push({
      label: trailingLabel,
      amount: Number((total - assigned).toFixed(2)),
      confidence: 0.7,
    });
  }
  return splits;
}

function inferType(text: string, amount: number | null): ParsedTransactionType {
  const words = text.toLowerCase().split(/\s+/);
  if (words.some((word) => TRANSFER_WORDS.has(word))) return 'TRANSFER';
  if (words.some((word) => INCOME_WORDS.has(word))) return 'INCOME';
  return amount !== null && /\bfrom\b/i.test(text) && /\bto\b/i.test(text) ? 'TRANSFER' : 'EXPENSE';
}

function extractCategoryHints(text: string, splits: readonly SplitCandidate[]): string[] {
  const hints = new Set<string>();
  for (const word of text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)) {
    if (CATEGORY_WORDS.has(word)) hints.add(word === 'grocery' ? 'groceries' : word);
  }
  for (const split of splits) hints.add(split.label.toLowerCase());
  return [...hints];
}

function extractAccountHints(text: string): string[] {
  const hints: string[] = [];
  for (const match of text.matchAll(
    /\b(?:from|to|into)\s+([a-z][a-z0-9 -]*?)(?=\s+(?:from|to|into|for|on|at|note|memo)|\s*[$\d]|$)/gi,
  )) {
    hints.push(titleCase(cleanLabel(match[1])));
  }
  return [...new Set(hints.filter(Boolean))];
}

function extractPayee(
  text: string,
  amounts: readonly AmountMatch[],
  matchedDate: string | null,
  categoryHints: readonly string[],
  type: ParsedTransactionType,
): string {
  if (type === 'TRANSFER') return '';
  const atMatch = text.match(
    /\bat\s+([^$]+?)(?=\s+(?:for|on|note|memo|yesterday|today|tomorrow|last|next|$))/i,
  );
  const fromMatch = text.match(/\bfrom\s+([^$]+?)(?=\s+(?:for|on|note|memo|$))/i);
  let candidate =
    atMatch?.[1] ?? fromMatch?.[1] ?? (amounts[0] ? text.slice(0, amounts[0].index) : text);
  if (matchedDate) candidate = candidate.replace(new RegExp(escapeRegex(matchedDate), 'i'), ' ');
  for (const hint of categoryHints)
    candidate = candidate.replace(new RegExp(`\\b${escapeRegex(hint)}\\b`, 'i'), ' ');
  candidate = candidate.replace(
    /\b(?:paid|spent|bought|buy|for|at|from|on|note|memo|yesterday|today|tomorrow)\b/gi,
    ' ',
  );
  return titleCase(cleanLabel(candidate));
}

function extractNote(text: string): string | null {
  const match = text.match(/\b(?:note|memo)\s*:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

function cleanLabel(value: string): string {
  return value
    .replace(/\b(?:and|for|split|category|as|at|from|to|on|with)\b/gi, ' ')
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function averageConfidence(confidence: FieldConfidence): number {
  const values = [confidence.amount, confidence.date, confidence.payee, confidence.type];
  if (confidence.splits > 0) values.push(confidence.splits);
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
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

function titleCase(value: string): string {
  return value.replace(/\b[a-z0-9]/gi, (letter) => letter.toUpperCase());
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
