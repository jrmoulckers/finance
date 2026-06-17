// SPDX-License-Identifier: BUSL-1.1

export type QueryIntent =
  | 'spending_summary'
  | 'income_summary'
  | 'category_breakdown'
  | 'transaction_search'
  | 'goal_progress'
  | 'budget_status'
  | 'trend_analysis';

export type TimeRangePreset =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'year-to-date'
  | 'rolling-days'
  | 'rolling-months'
  | 'all-time';

export interface TimeRangeEntity {
  readonly preset: TimeRangePreset;
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
}

export interface AmountThresholdEntity {
  readonly operator: 'gte' | 'lte';
  readonly amountCents: number;
  readonly label: string;
}

export interface QueryEntities {
  readonly timeRange?: TimeRangeEntity;
  readonly category?: string;
  readonly account?: string;
  readonly merchant?: string;
  readonly amountThreshold?: AmountThresholdEntity;
  readonly budgetName?: string;
  readonly goalName?: string;
  readonly limit?: number;
  readonly analysisMode?: 'average' | 'trend';
  readonly metric?: 'spending' | 'income';
}

export interface ParseFinancialQueryOptions {
  readonly now?: Date;
  readonly knownCategories?: readonly string[];
  readonly knownAccounts?: readonly string[];
  readonly knownBudgets?: readonly string[];
  readonly knownGoals?: readonly string[];
}

export interface ParsedFinancialQuery {
  readonly rawQuery: string;
  readonly normalizedQuery: string;
  readonly intent: QueryIntent;
  readonly entities: QueryEntities;
  readonly confidence: number;
  readonly matchedPhrases: readonly string[];
}

export interface QuerySuggestionGroup {
  readonly intent: QueryIntent;
  readonly label: string;
  readonly examples: readonly string[];
}

export const QUERY_SUGGESTION_GROUPS: readonly QuerySuggestionGroup[] = [
  {
    intent: 'spending_summary',
    label: 'Spending summaries',
    examples: [
      'How much did I spend last month?',
      'How much did I spend on groceries last month?',
      'What did I spend from checking this month?',
      "How much have I spent at Trader Joe's this year?",
    ],
  },
  {
    intent: 'income_summary',
    label: 'Income summaries',
    examples: [
      'How much income did I make this month?',
      'What did I earn last month?',
      'Show my income this year',
      'How much salary did I receive this month?',
    ],
  },
  {
    intent: 'category_breakdown',
    label: 'Category breakdowns',
    examples: [
      'Break down my spending by category this month',
      'Which categories did I spend the most on last month?',
      'Show category spending this year',
      'What are my top spending categories?',
    ],
  },
  {
    intent: 'transaction_search',
    label: 'Transaction searches',
    examples: [
      'Show me my largest transactions this year',
      'Find transactions over $100 last month',
      "Show transactions at Trader Joe's",
      'List my top 5 expenses from checking',
    ],
  },
  {
    intent: 'goal_progress',
    label: 'Goal progress',
    examples: [
      'Am I on track with my savings goal?',
      'How is my emergency fund goal doing?',
      'Show progress on my vacation goal',
      'How much do I still need for my car fund?',
    ],
  },
  {
    intent: 'budget_status',
    label: 'Budget status',
    examples: [
      'How is my grocery budget this month?',
      'Am I over budget this month?',
      'Which budgets are closest to the limit?',
      'How much budget do I have left for groceries?',
    ],
  },
  {
    intent: 'trend_analysis',
    label: 'Trend analysis',
    examples: [
      "What's my average monthly spending?",
      'How has my spending changed over the last 6 months?',
      'Show my spending trend this year',
      'Is my income trending up?',
    ],
  },
] as const;

export const QUICK_QUERY_CHIPS = QUERY_SUGGESTION_GROUPS.flatMap((group) => group.examples).slice(
  0,
  6,
);

export interface QueryPlan {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly description: string;
}

export interface SummaryResult {
  readonly totalCents: number;
  readonly averageCents: number;
  readonly transactionCount: number;
  readonly currency: string;
  readonly timeRangeLabel: string;
  readonly category?: string;
  readonly account?: string;
  readonly merchant?: string;
}

export interface CategoryBreakdownRow {
  readonly categoryName: string;
  readonly totalCents: number;
  readonly transactionCount: number;
  readonly currency: string;
  readonly sharePercent: number;
}

export interface TransactionSearchRow {
  readonly id: string;
  readonly date: string;
  readonly description: string;
  readonly categoryName: string;
  readonly accountName: string;
  readonly amountCents: number;
  readonly absoluteAmountCents: number;
  readonly currency: string;
  readonly type: string;
}

export interface GoalProgressRow {
  readonly id: string;
  readonly goalName: string;
  readonly accountName: string | null;
  readonly currentAmountCents: number;
  readonly targetAmountCents: number;
  readonly remainingAmountCents: number;
  readonly percentComplete: number;
  readonly currency: string;
  readonly status: string;
  readonly targetDate: string | null;
  readonly onTrack: boolean | null;
  readonly expectedProgressPercent: number | null;
}

export interface BudgetStatusRow {
  readonly id: string;
  readonly budgetName: string;
  readonly categoryName: string;
  readonly budgetAmountCents: number;
  readonly spentAmountCents: number;
  readonly remainingAmountCents: number;
  readonly percentUsed: number;
  readonly currency: string;
  readonly status: 'on_track' | 'warning' | 'over_budget';
}

export interface TrendPoint {
  readonly period: string;
  readonly totalCents: number;
  readonly currency: string;
}

export type FinancialQueryExecutionResult =
  | {
      readonly intent: 'spending_summary';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: SummaryResult;
    }
  | {
      readonly intent: 'income_summary';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: SummaryResult;
    }
  | {
      readonly intent: 'category_breakdown';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: {
        readonly rows: readonly CategoryBreakdownRow[];
        readonly totalCents: number;
        readonly currency: string;
        readonly timeRangeLabel: string;
      };
    }
  | {
      readonly intent: 'transaction_search';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: {
        readonly rows: readonly TransactionSearchRow[];
        readonly totalMatches: number;
        readonly limit: number;
        readonly timeRangeLabel: string;
      };
    }
  | {
      readonly intent: 'goal_progress';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: {
        readonly rows: readonly GoalProgressRow[];
      };
    }
  | {
      readonly intent: 'budget_status';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: {
        readonly rows: readonly BudgetStatusRow[];
        readonly timeRangeLabel: string;
      };
    }
  | {
      readonly intent: 'trend_analysis';
      readonly plan: QueryPlan;
      readonly parsedQuery: ParsedFinancialQuery;
      readonly data: {
        readonly metric: 'spending' | 'income';
        readonly mode: 'average' | 'trend';
        readonly points: readonly TrendPoint[];
        readonly averageMonthlyCents: number;
        readonly currency: string;
        readonly changePercent: number | null;
        readonly trendDirection: 'up' | 'down' | 'flat' | null;
        readonly timeRangeLabel: string;
      };
    };

export interface FormattedFinancialResponse {
  readonly title: string;
  readonly summary: string;
  readonly highlights: readonly { label: string; value: string }[];
  readonly details: readonly string[];
  readonly emptyState?: string;
  readonly tone?: 'neutral' | 'positive' | 'warning';
}
