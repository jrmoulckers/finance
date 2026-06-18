// SPDX-License-Identifier: BUSL-1.1

export type AssistantIntent =
  | 'net_worth'
  | 'category_spending'
  | 'recent_merchant'
  | 'budget_pace'
  | 'goal_progress'
  | 'upcoming_bills'
  | 'unsupported';

export interface AssistantDateRange {
  readonly start: string;
  readonly end: string;
  readonly label: string;
}

export interface AssistantTransaction {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly type: 'expense' | 'income' | 'transfer';
  readonly merchant?: string;
  readonly category?: string;
}

export interface AssistantAccount {
  readonly id: string;
  readonly name: string;
  readonly balanceCents: number;
  readonly includeInNetWorth?: boolean;
}

export interface AssistantBudget {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly amountCents: number;
  readonly spentCents: number;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface AssistantGoal {
  readonly id: string;
  readonly name: string;
  readonly currentCents: number;
  readonly targetCents: number;
  readonly targetDate?: string;
}

export interface AssistantBill {
  readonly id: string;
  readonly merchant: string;
  readonly nextDueDate: string;
  readonly expectedAmountCents: number;
  readonly confidence: number;
}

export interface AssistantData {
  readonly transactions: readonly AssistantTransaction[];
  readonly accounts: readonly AssistantAccount[];
  readonly budgets: readonly AssistantBudget[];
  readonly goals: readonly AssistantGoal[];
  readonly bills: readonly AssistantBill[];
  readonly today?: string;
}

export interface ParsedAssistantQuestion {
  readonly intent: AssistantIntent;
  readonly range: AssistantDateRange;
  readonly entity?: string;
}

export interface AssistantAnswer {
  readonly intent: AssistantIntent;
  readonly answer: string;
  readonly sources: readonly string[];
  readonly examples?: readonly string[];
}

export const ASSISTANT_PRIVACY_COPY =
  'Core finance Q&A runs locally with deterministic calculations over your app data and does not require an external paid LLM API.';

const EXAMPLES = [
  'What is my net worth?',
  'How much did I spend on groceries this month?',
  'When did I last visit Target?',
  'How is my dining budget pacing?',
  'What bills are coming up?',
];

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIso(value: string): Date {
  const [year = '1970', month = '1', day = '1'] = value.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function addDays(value: string, days: number): string {
  const date = parseIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function startOfMonth(today: string): string {
  const date = parseIso(today);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function defaultRange(today: string): AssistantDateRange {
  return { start: startOfMonth(today), end: today, label: 'this month to date' };
}

export function extractAssistantDateRange(
  question: string,
  today = iso(new Date()),
): AssistantDateRange {
  const text = question.toLowerCase();
  if (text.includes('last month')) {
    const date = parseIso(today);
    const start = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
    const end = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)));
    return { start, end, label: 'last month' };
  }
  if (text.includes('last 30 days')) {
    return { start: addDays(today, -29), end: today, label: 'last 30 days' };
  }
  if (text.includes('this week') || text.includes('week')) {
    const date = parseIso(today);
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return { start: addDays(today, mondayOffset), end: today, label: 'this week' };
  }
  if (text.includes('this year') || text.includes('year to date')) {
    return { start: `${today.slice(0, 4)}-01-01`, end: today, label: 'year to date' };
  }
  return defaultRange(today);
}

export function parseAssistantQuestion(question: string, today?: string): ParsedAssistantQuestion {
  const text = question.toLowerCase();
  const range = extractAssistantDateRange(question, today);
  if (/(net worth|balance|balances|cash on hand)/u.test(text))
    return { intent: 'net_worth', range };
  if (/(budget|pace|pacing|left in)/u.test(text))
    return { intent: 'budget_pace', range, entity: extractAfter(text, ['budget', 'for', 'my']) };
  if (/(goal|progress|saved|saving)/u.test(text))
    return { intent: 'goal_progress', range, entity: extractAfter(text, ['goal', 'for', 'my']) };
  if (/(bill|due|upcoming|payment)/u.test(text)) return { intent: 'upcoming_bills', range };
  if (/(last|recent|latest|visit|merchant|payee)/u.test(text))
    return { intent: 'recent_merchant', range, entity: extractMerchant(question) };
  if (/(spend|spent|spending|category|how much)/u.test(text))
    return { intent: 'category_spending', range, entity: extractCategory(question) };
  return { intent: 'unsupported', range };
}

function extractAfter(text: string, stopWords: readonly string[]): string | undefined {
  const words = text
    .replace(/[^a-z0-9 ]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  const ignored = new Set([
    'how',
    'is',
    'are',
    'am',
    'i',
    'doing',
    'pacing',
    'progress',
    ...stopWords,
  ]);
  const entity = words
    .filter((word) => !ignored.has(word))
    .join(' ')
    .trim();
  return entity || undefined;
}

function extractCategory(question: string): string | undefined {
  const match = question.match(/(?:on|for|in)\s+([\p{L}\p{N} &-]+)/iu);
  return cleanEntity(match?.[1]);
}

function extractMerchant(question: string): string | undefined {
  const match = question.match(/(?:at|from|visit|merchant|payee)\s+([\p{L}\p{N} &'-]+)/iu);
  return cleanEntity(match?.[1]);
}

function cleanEntity(value: string | undefined): string | undefined {
  const cleaned = value
    ?.replace(/\b(?:this|last)\s+(?:month|week|year)\b/giu, '')
    .replace(/\blast 30 days\b/giu, '')
    .replace(/\byear to date\b/giu, '')
    .trim()
    .replace(/[?!.]$/u, '')
    .toLowerCase();
  return cleaned || undefined;
}

function inRange(date: string, range: AssistantDateRange): boolean {
  return date >= range.start && date <= range.end;
}

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}$${(absolute / 100).toFixed(2)}`;
}

function normalize(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function textIncludes(value: string | undefined, needle: string | undefined): boolean {
  if (!needle) return true;
  return normalize(value).includes(normalize(needle));
}

export function answerFinancialQuestion(question: string, data: AssistantData): AssistantAnswer {
  const parsed = parseAssistantQuestion(question, data.today);
  switch (parsed.intent) {
    case 'net_worth': {
      const netWorth = data.accounts
        .filter((account) => account.includeInNetWorth !== false)
        .reduce((sum, account) => sum + account.balanceCents, 0);
      return {
        intent: parsed.intent,
        answer: `Your net worth across ${data.accounts.length} accounts is ${money(netWorth)}.`,
        sources: ['accounts included in local balances'],
      };
    }
    case 'category_spending': {
      const expenses = data.transactions.filter(
        (transaction) => transaction.type === 'expense' && inRange(transaction.date, parsed.range),
      );
      const matching = expenses.filter((transaction) =>
        textIncludes(transaction.category, parsed.entity),
      );
      const spent = matching.reduce(
        (sum, transaction) => sum + Math.abs(transaction.amountCents),
        0,
      );
      const label = parsed.entity ?? 'all categories';
      return {
        intent: parsed.intent,
        answer: `You spent ${money(spent)} on ${label} during ${parsed.range.label}.`,
        sources: [
          `transactions from ${parsed.range.start} through ${parsed.range.end}`,
          `${matching.length} matching transactions`,
        ],
      };
    }
    case 'recent_merchant': {
      const matches = data.transactions
        .filter((transaction) => textIncludes(transaction.merchant, parsed.entity))
        .sort((left, right) => right.date.localeCompare(left.date));
      const latest = matches[0];
      return {
        intent: parsed.intent,
        answer: latest
          ? `Your most recent ${latest.merchant ?? 'merchant'} transaction was ${money(Math.abs(latest.amountCents))} on ${latest.date}.`
          : 'I could not find a recent local transaction for that merchant.',
        sources: ['local transaction history sorted by date'],
      };
    }
    case 'budget_pace': {
      const budget =
        data.budgets.find(
          (item) =>
            textIncludes(item.name, parsed.entity) || textIncludes(item.category, parsed.entity),
        ) ?? data.budgets[0];
      if (!budget) return unsupported(parsed.intent);
      const totalDays = Math.max(1, daysBetween(budget.periodStart, budget.periodEnd) + 1);
      const elapsedDays = Math.min(
        totalDays,
        Math.max(1, daysBetween(budget.periodStart, data.today ?? parsed.range.end) + 1),
      );
      const expected = Math.round((budget.amountCents * elapsedDays) / totalDays);
      const delta = budget.spentCents - expected;
      return {
        intent: parsed.intent,
        answer: `${budget.name} is ${delta > 0 ? money(delta) + ' ahead of' : money(Math.abs(delta)) + ' under'} expected pace with ${money(budget.spentCents)} spent of ${money(budget.amountCents)}.`,
        sources: [`budget period ${budget.periodStart} through ${budget.periodEnd}`],
      };
    }
    case 'goal_progress': {
      const goal =
        data.goals.find((item) => textIncludes(item.name, parsed.entity)) ?? data.goals[0];
      if (!goal) return unsupported(parsed.intent);
      const percent =
        goal.targetCents > 0 ? Math.round((goal.currentCents / goal.targetCents) * 100) : 0;
      return {
        intent: parsed.intent,
        answer: `${goal.name} is ${percent}% funded at ${money(goal.currentCents)} of ${money(goal.targetCents)}.`,
        sources: ['local goal balances'],
      };
    }
    case 'upcoming_bills': {
      const today = data.today ?? parsed.range.end;
      const end = addDays(today, 30);
      const bills = data.bills
        .filter((bill) => bill.nextDueDate >= today && bill.nextDueDate <= end)
        .sort((left, right) => left.nextDueDate.localeCompare(right.nextDueDate));
      const summary =
        bills.length > 0
          ? bills
              .map(
                (bill) =>
                  `${bill.merchant} on ${bill.nextDueDate} (${money(bill.expectedAmountCents)})`,
              )
              .join('; ')
          : 'No predicted bills are due in the next 30 days.';
      return {
        intent: parsed.intent,
        answer: summary,
        sources: [`predicted bills from ${today} through ${end}`],
      };
    }
    default:
      return unsupported(parsed.intent);
  }
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseIso(end).getTime() - parseIso(start).getTime()) / 86_400_000);
}

function unsupported(intent: AssistantIntent): AssistantAnswer {
  return {
    intent,
    answer:
      'I can only answer source-backed questions about local balances, spending, merchants, budgets, goals, and upcoming bills right now.',
    sources: [ASSISTANT_PRIVACY_COPY],
    examples: EXAMPLES,
  };
}
