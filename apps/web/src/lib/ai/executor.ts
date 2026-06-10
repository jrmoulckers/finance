// SPDX-License-Identifier: BUSL-1.1

import { query, type Row, type SqliteDb } from '../../db/sqlite-wasm';
import type {
  BudgetStatusRow,
  FinancialQueryExecutionResult,
  GoalProgressRow,
  ParsedFinancialQuery,
  QueryIntent,
  QueryPlan,
  TimeRangeEntity,
  TrendPoint,
} from './types';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function createDefaultTimeRange(intent: QueryIntent, now: Date): TimeRangeEntity | undefined {
  if (intent === 'transaction_search' || intent === 'goal_progress') {
    return undefined;
  }

  if (intent === 'trend_analysis') {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return {
      preset: 'rolling-months',
      label: 'the last 6 months',
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(endOfDay(now)),
    };
  }

  const monthStart = startOfMonth(now);
  return {
    preset: 'this-month',
    label: 'this month',
    startDate: formatLocalDate(monthStart),
    endDate: formatLocalDate(endOfDay(now)),
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toContainsParam(value: string): string {
  return `%${value.trim().toLowerCase()}%`;
}

function buildTransactionFilters(
  parsedQuery: ParsedFinancialQuery,
  timeRange: TimeRangeEntity | undefined,
  typeFilter?: 'EXPENSE' | 'INCOME',
): { clauses: string[]; params: unknown[] } {
  const clauses = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (typeFilter) {
    clauses.push('t.type = ?');
    params.push(typeFilter);
  }

  if (timeRange) {
    clauses.push('t.date >= ?');
    clauses.push('t.date <= ?');
    params.push(timeRange.startDate, timeRange.endDate);
  }

  if (parsedQuery.entities.category) {
    clauses.push("LOWER(COALESCE(c.name, '')) LIKE ?");
    params.push(toContainsParam(parsedQuery.entities.category));
  }

  if (parsedQuery.entities.account) {
    clauses.push("LOWER(COALESCE(a.name, '')) LIKE ?");
    params.push(toContainsParam(parsedQuery.entities.account));
  }

  if (parsedQuery.entities.merchant) {
    clauses.push(`(
      LOWER(COALESCE(t.payee, '')) LIKE ? OR
      LOWER(COALESCE(t.note, '')) LIKE ? OR
      LOWER(COALESCE(t.counterparty_name, '')) LIKE ? OR
      LOWER(COALESCE(t.statement_description, '')) LIKE ?
    )`);
    const merchantParam = toContainsParam(parsedQuery.entities.merchant);
    params.push(merchantParam, merchantParam, merchantParam, merchantParam);
  }

  if (parsedQuery.entities.amountThreshold) {
    clauses.push(
      `ABS(t.amount) ${parsedQuery.entities.amountThreshold.operator === 'gte' ? '>=' : '<='} ?`,
    );
    params.push(parsedQuery.entities.amountThreshold.amountCents);
  }

  return { clauses, params };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeExpectedProgressPercent(
  createdAt: string,
  targetDate: string | null,
  now: Date,
): number | null {
  if (!targetDate) {
    return null;
  }

  const created = new Date(createdAt);
  const target = new Date(`${targetDate}T00:00:00`);

  if (Number.isNaN(created.valueOf()) || Number.isNaN(target.valueOf()) || target <= created) {
    return null;
  }

  const totalMs = target.getTime() - created.getTime();
  const elapsedMs = now.getTime() - created.getTime();
  return clamp((elapsedMs / totalMs) * 100, 0, 100);
}

export function executeFinancialQuery(
  db: SqliteDb,
  parsedQuery: ParsedFinancialQuery,
  options: { now?: Date } = {},
): FinancialQueryExecutionResult {
  const now = options.now ?? new Date();
  const timeRange =
    parsedQuery.entities.timeRange ?? createDefaultTimeRange(parsedQuery.intent, now);

  switch (parsedQuery.intent) {
    case 'spending_summary': {
      const { clauses, params } = buildTransactionFilters(parsedQuery, timeRange, 'EXPENSE');
      const plan: QueryPlan = {
        description: 'Summarize matching spending',
        sql: `SELECT
          COALESCE(SUM(ABS(t.amount)), 0) AS total_amount,
          COALESCE(AVG(ABS(t.amount)), 0) AS average_amount,
          COUNT(*) AS transaction_count,
          COALESCE(MIN(t.currency), 'USD') AS currency
        FROM "transaction" t
        LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at IS NULL
        LEFT JOIN account a ON a.id = t.account_id AND a.deleted_at IS NULL
        WHERE ${clauses.join(' AND ')}`,
        params,
      };
      const row = query<Row>(db, plan.sql, [...plan.params]).rows[0] ?? {};

      return {
        intent: 'spending_summary',
        plan,
        parsedQuery,
        data: {
          totalCents: toNumber(row.total_amount),
          averageCents: Math.round(toNumber(row.average_amount)),
          transactionCount: toNumber(row.transaction_count),
          currency: toStringValue(row.currency, 'USD'),
          timeRangeLabel: timeRange?.label ?? 'all time',
          category: parsedQuery.entities.category,
          account: parsedQuery.entities.account,
          merchant: parsedQuery.entities.merchant,
        },
      };
    }

    case 'income_summary': {
      const { clauses, params } = buildTransactionFilters(parsedQuery, timeRange, 'INCOME');
      const plan: QueryPlan = {
        description: 'Summarize matching income',
        sql: `SELECT
          COALESCE(SUM(t.amount), 0) AS total_amount,
          COALESCE(AVG(t.amount), 0) AS average_amount,
          COUNT(*) AS transaction_count,
          COALESCE(MIN(t.currency), 'USD') AS currency
        FROM "transaction" t
        LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at IS NULL
        LEFT JOIN account a ON a.id = t.account_id AND a.deleted_at IS NULL
        WHERE ${clauses.join(' AND ')}`,
        params,
      };
      const row = query<Row>(db, plan.sql, [...plan.params]).rows[0] ?? {};

      return {
        intent: 'income_summary',
        plan,
        parsedQuery,
        data: {
          totalCents: toNumber(row.total_amount),
          averageCents: Math.round(toNumber(row.average_amount)),
          transactionCount: toNumber(row.transaction_count),
          currency: toStringValue(row.currency, 'USD'),
          timeRangeLabel: timeRange?.label ?? 'all time',
          account: parsedQuery.entities.account,
          merchant: parsedQuery.entities.merchant,
        },
      };
    }

    case 'category_breakdown': {
      const { clauses, params } = buildTransactionFilters(parsedQuery, timeRange, 'EXPENSE');
      const plan: QueryPlan = {
        description: 'Break spending down by category',
        sql: `SELECT
          COALESCE(c.name, 'Uncategorized') AS category_name,
          COALESCE(SUM(ABS(t.amount)), 0) AS total_amount,
          COUNT(*) AS transaction_count,
          COALESCE(MIN(t.currency), 'USD') AS currency
        FROM "transaction" t
        LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at IS NULL
        LEFT JOIN account a ON a.id = t.account_id AND a.deleted_at IS NULL
        WHERE ${clauses.join(' AND ')}
        GROUP BY COALESCE(c.name, 'Uncategorized')
        ORDER BY total_amount DESC, category_name ASC
        LIMIT 8`,
        params,
      };
      const rows = query<Row>(db, plan.sql, [...plan.params]).rows;
      const totalCents = rows.reduce((sum, row) => sum + toNumber(row.total_amount), 0);

      return {
        intent: 'category_breakdown',
        plan,
        parsedQuery,
        data: {
          totalCents,
          currency: toStringValue(rows[0]?.currency, 'USD'),
          timeRangeLabel: timeRange?.label ?? 'all time',
          rows: rows.map((row) => {
            const rowTotal = toNumber(row.total_amount);
            return {
              categoryName: toStringValue(row.category_name, 'Uncategorized'),
              totalCents: rowTotal,
              transactionCount: toNumber(row.transaction_count),
              currency: toStringValue(row.currency, 'USD'),
              sharePercent: totalCents > 0 ? (rowTotal / totalCents) * 100 : 0,
            };
          }),
        },
      };
    }

    case 'transaction_search': {
      const { clauses, params } = buildTransactionFilters(parsedQuery, timeRange);
      const limit = parsedQuery.entities.limit ?? 5;
      const plan: QueryPlan = {
        description: 'Search matching transactions',
        sql: `SELECT
          t.id AS id,
          t.date AS date,
          COALESCE(t.payee, t.note, t.counterparty_name, t.statement_description, 'Transaction') AS description,
          COALESCE(c.name, 'Uncategorized') AS category_name,
          COALESCE(a.name, 'Unknown account') AS account_name,
          t.amount AS amount,
          ABS(t.amount) AS absolute_amount,
          t.currency AS currency,
          t.type AS type
        FROM "transaction" t
        LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at IS NULL
        LEFT JOIN account a ON a.id = t.account_id AND a.deleted_at IS NULL
        WHERE ${clauses.join(' AND ')}
        ORDER BY ABS(t.amount) DESC, t.date DESC
        LIMIT ?`,
        params: [...params, limit],
      };
      const rows = query<Row>(db, plan.sql, [...plan.params]).rows;

      return {
        intent: 'transaction_search',
        plan,
        parsedQuery,
        data: {
          rows: rows.map((row) => ({
            id: toStringValue(row.id),
            date: toStringValue(row.date),
            description: toStringValue(row.description, 'Transaction'),
            categoryName: toStringValue(row.category_name, 'Uncategorized'),
            accountName: toStringValue(row.account_name, 'Unknown account'),
            amountCents: toNumber(row.amount),
            absoluteAmountCents: toNumber(row.absolute_amount),
            currency: toStringValue(row.currency, 'USD'),
            type: toStringValue(row.type),
          })),
          totalMatches: rows.length,
          limit,
          timeRangeLabel: timeRange?.label ?? 'all time',
        },
      };
    }

    case 'goal_progress': {
      const clauses = ['g.deleted_at IS NULL', "g.status != 'CANCELLED'"];
      const params: unknown[] = [];
      if (parsedQuery.entities.goalName) {
        clauses.push('LOWER(g.name) LIKE ?');
        params.push(toContainsParam(parsedQuery.entities.goalName));
      }
      if (parsedQuery.entities.account) {
        clauses.push("LOWER(COALESCE(a.name, '')) LIKE ?");
        params.push(toContainsParam(parsedQuery.entities.account));
      }

      const plan: QueryPlan = {
        description: 'Assess goal progress',
        sql: `SELECT
          g.id AS id,
          g.name AS goal_name,
          g.current_amount AS current_amount,
          g.target_amount AS target_amount,
          g.currency AS currency,
          g.status AS status,
          g.target_date AS target_date,
          g.created_at AS created_at,
          a.name AS account_name
        FROM goal g
        LEFT JOIN account a ON a.id = g.account_id AND a.deleted_at IS NULL
        WHERE ${clauses.join(' AND ')}
        ORDER BY (g.target_date IS NULL) ASC, g.target_date ASC, g.name ASC
        LIMIT 5`,
        params,
      };
      const rows = query<Row>(db, plan.sql, [...plan.params]).rows;
      const mappedRows: GoalProgressRow[] = rows.map((row) => {
        const currentAmountCents = toNumber(row.current_amount);
        const targetAmountCents = Math.max(0, toNumber(row.target_amount));
        const percentComplete =
          targetAmountCents > 0 ? (currentAmountCents / targetAmountCents) * 100 : 0;
        const targetDate = typeof row.target_date === 'string' ? row.target_date : null;
        const expectedProgressPercent = computeExpectedProgressPercent(
          toStringValue(row.created_at, new Date(now).toISOString()),
          targetDate,
          now,
        );

        return {
          id: toStringValue(row.id),
          goalName: toStringValue(row.goal_name),
          accountName: typeof row.account_name === 'string' ? row.account_name : null,
          currentAmountCents,
          targetAmountCents,
          remainingAmountCents: Math.max(targetAmountCents - currentAmountCents, 0),
          percentComplete,
          currency: toStringValue(row.currency, 'USD'),
          status: toStringValue(row.status, 'ACTIVE'),
          targetDate,
          expectedProgressPercent,
          onTrack:
            expectedProgressPercent === null
              ? null
              : percentComplete + 5 >= expectedProgressPercent || percentComplete >= 100,
        };
      });

      return {
        intent: 'goal_progress',
        plan,
        parsedQuery,
        data: {
          rows: mappedRows,
        },
      };
    }

    case 'budget_status': {
      const budgetClauses = ['b.deleted_at IS NULL'];
      const params: unknown[] = [];
      if (timeRange) {
        budgetClauses.push('b.start_date <= ?');
        budgetClauses.push('(b.end_date IS NULL OR b.end_date >= ?)');
        params.push(timeRange.endDate, timeRange.startDate);
      }
      if (parsedQuery.entities.budgetName) {
        budgetClauses.push('LOWER(b.name) LIKE ?');
        params.push(toContainsParam(parsedQuery.entities.budgetName));
      }
      if (parsedQuery.entities.category) {
        budgetClauses.push("LOWER(COALESCE(c.name, '')) LIKE ?");
        params.push(toContainsParam(parsedQuery.entities.category));
      }

      const timeParams = timeRange
        ? [timeRange.startDate, timeRange.endDate]
        : [formatLocalDate(startOfMonth(now)), formatLocalDate(endOfDay(now))];
      const plan: QueryPlan = {
        description: 'Check budget performance',
        sql: `SELECT
          b.id AS id,
          b.name AS budget_name,
          COALESCE(c.name, 'Uncategorized') AS category_name,
          b.amount AS budget_amount,
          COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN ABS(t.amount) ELSE 0 END), 0) AS spent_amount,
          COALESCE(MIN(b.currency), 'USD') AS currency
        FROM budget b
        LEFT JOIN category c ON c.id = b.category_id AND c.deleted_at IS NULL
        LEFT JOIN "transaction" t
          ON t.category_id = b.category_id
         AND t.deleted_at IS NULL
         AND t.date >= ?
         AND t.date <= ?
         AND t.date >= b.start_date
         AND (b.end_date IS NULL OR t.date <= b.end_date)
        WHERE ${budgetClauses.join(' AND ')}
        GROUP BY b.id, b.name, category_name, b.amount
        ORDER BY (spent_amount * 1.0 / NULLIF(b.amount, 0)) DESC, b.name ASC
        LIMIT 5`,
        params: [...timeParams, ...params],
      };
      const rows = query<Row>(db, plan.sql, [...plan.params]).rows;
      const mappedRows: BudgetStatusRow[] = rows.map((row) => {
        const budgetAmountCents = Math.max(0, toNumber(row.budget_amount));
        const spentAmountCents = Math.max(0, toNumber(row.spent_amount));
        const percentUsed =
          budgetAmountCents > 0 ? (spentAmountCents / budgetAmountCents) * 100 : 0;
        return {
          id: toStringValue(row.id),
          budgetName: toStringValue(row.budget_name),
          categoryName: toStringValue(row.category_name, 'Uncategorized'),
          budgetAmountCents,
          spentAmountCents,
          remainingAmountCents: budgetAmountCents - spentAmountCents,
          percentUsed,
          currency: toStringValue(row.currency, 'USD'),
          status: percentUsed > 100 ? 'over_budget' : percentUsed > 85 ? 'warning' : 'on_track',
        };
      });

      return {
        intent: 'budget_status',
        plan,
        parsedQuery,
        data: {
          rows: mappedRows,
          timeRangeLabel: timeRange?.label ?? 'this month',
        },
      };
    }

    case 'trend_analysis': {
      const metric = parsedQuery.entities.metric ?? 'spending';
      const metricType = metric === 'income' ? 'INCOME' : 'EXPENSE';
      const { clauses, params } = buildTransactionFilters(parsedQuery, timeRange, metricType);
      const plan: QueryPlan = {
        description: 'Analyze monthly financial trends',
        sql: `SELECT
          SUBSTR(t.date, 1, 7) AS period,
          COALESCE(SUM(${metric === 'income' ? 't.amount' : 'ABS(t.amount)'}), 0) AS total_amount,
          COALESCE(MIN(t.currency), 'USD') AS currency
        FROM "transaction" t
        LEFT JOIN category c ON c.id = t.category_id AND c.deleted_at IS NULL
        LEFT JOIN account a ON a.id = t.account_id AND a.deleted_at IS NULL
        WHERE ${clauses.join(' AND ')}
        GROUP BY SUBSTR(t.date, 1, 7)
        ORDER BY period ASC`,
        params,
      };
      const rows = query<Row>(db, plan.sql, [...plan.params]).rows;
      const points: TrendPoint[] = rows.map((row) => ({
        period: toStringValue(row.period),
        totalCents: toNumber(row.total_amount),
        currency: toStringValue(row.currency, 'USD'),
      }));
      const totalCents = points.reduce((sum, point) => sum + point.totalCents, 0);
      const averageMonthlyCents = points.length > 0 ? Math.round(totalCents / points.length) : 0;
      const latest = points.at(-1) ?? null;
      const previous = points.length > 1 ? (points.at(-2) ?? null) : null;
      const changePercent =
        latest && previous && previous.totalCents !== 0
          ? ((latest.totalCents - previous.totalCents) / previous.totalCents) * 100
          : null;
      const trendDirection =
        changePercent === null
          ? null
          : changePercent > 1
            ? 'up'
            : changePercent < -1
              ? 'down'
              : 'flat';

      return {
        intent: 'trend_analysis',
        plan,
        parsedQuery,
        data: {
          metric,
          mode: parsedQuery.entities.analysisMode ?? 'trend',
          points,
          averageMonthlyCents,
          currency: latest?.currency ?? 'USD',
          changePercent,
          trendDirection,
          timeRangeLabel: timeRange?.label ?? 'the last 6 months',
        },
      };
    }
  }
}
