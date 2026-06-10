// SPDX-License-Identifier: BUSL-1.1

import type { FinancialQueryExecutionResult, FormattedFinancialResponse } from './types';

function formatCurrency(amountCents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatFinancialQueryResponse(
  result: FinancialQueryExecutionResult,
): FormattedFinancialResponse {
  switch (result.intent) {
    case 'spending_summary': {
      const { data } = result;
      return {
        title: 'Spending summary',
        summary:
          data.transactionCount === 0
            ? `I couldn't find any matching spending for ${data.timeRangeLabel}.`
            : `You spent ${formatCurrency(data.totalCents, data.currency)} across ${data.transactionCount} transaction${data.transactionCount === 1 ? '' : 's'} ${data.timeRangeLabel}.`,
        highlights: [
          { label: 'Total spent', value: formatCurrency(data.totalCents, data.currency) },
          { label: 'Average transaction', value: formatCurrency(data.averageCents, data.currency) },
          { label: 'Transactions', value: String(data.transactionCount) },
        ],
        details: [
          data.category ? `Category filter: ${data.category}` : 'Category filter: all categories',
          data.account ? `Account filter: ${data.account}` : 'Account filter: all accounts',
          data.merchant ? `Merchant filter: ${data.merchant}` : 'Merchant filter: any merchant',
        ],
        emptyState: 'Try a different category, account, merchant, or date range.',
      };
    }

    case 'income_summary': {
      const { data } = result;
      return {
        title: 'Income summary',
        summary:
          data.transactionCount === 0
            ? `I couldn't find any matching income for ${data.timeRangeLabel}.`
            : `You received ${formatCurrency(data.totalCents, data.currency)} in income across ${data.transactionCount} transaction${data.transactionCount === 1 ? '' : 's'} ${data.timeRangeLabel}.`,
        highlights: [
          { label: 'Total income', value: formatCurrency(data.totalCents, data.currency) },
          { label: 'Average deposit', value: formatCurrency(data.averageCents, data.currency) },
          { label: 'Transactions', value: String(data.transactionCount) },
        ],
        details: [
          data.account ? `Account filter: ${data.account}` : 'Account filter: all accounts',
        ],
        emptyState: 'Try a broader date range or different account filter.',
      };
    }

    case 'category_breakdown': {
      const { rows, totalCents, currency, timeRangeLabel } = result.data;
      return {
        title: 'Category breakdown',
        summary:
          rows.length === 0
            ? `I couldn't find any categorized spending for ${timeRangeLabel}.`
            : `Your top categories account for ${formatCurrency(totalCents, currency)} of spending ${timeRangeLabel}.`,
        highlights: rows.slice(0, 3).map((row) => ({
          label: row.categoryName,
          value: `${formatCurrency(row.totalCents, row.currency)} • ${formatPercent(row.sharePercent)}`,
        })),
        details: rows
          .slice(0, 5)
          .map(
            (row) =>
              `${row.categoryName}: ${formatCurrency(row.totalCents, row.currency)} across ${row.transactionCount} transaction${row.transactionCount === 1 ? '' : 's'}`,
          ),
        emptyState: 'Try asking for a different month or a broader date range.',
      };
    }

    case 'transaction_search': {
      const { rows, totalMatches, limit, timeRangeLabel } = result.data;
      return {
        title: 'Matching transactions',
        summary:
          rows.length === 0
            ? `I couldn't find any transactions matching that search ${timeRangeLabel}.`
            : `Here are the top ${Math.min(limit, rows.length)} matching transaction${rows.length === 1 ? '' : 's'} from ${timeRangeLabel}.`,
        highlights: [
          { label: 'Matches', value: String(totalMatches) },
          {
            label: 'Largest match',
            value: rows[0] ? formatCurrency(rows[0].absoluteAmountCents, rows[0].currency) : '—',
          },
        ],
        details: rows
          .slice(0, limit)
          .map(
            (row) =>
              `${row.date}: ${row.description} (${row.categoryName}, ${row.accountName}) — ${formatCurrency(row.amountCents, row.currency)}`,
          ),
        emptyState: 'Try lowering the threshold or removing one of the filters.',
      };
    }

    case 'goal_progress': {
      const { rows } = result.data;
      return {
        title: 'Goal progress',
        summary:
          rows.length === 0
            ? "I couldn't find a savings goal that matches that request."
            : `${rows[0].goalName} is ${formatPercent(rows[0].percentComplete)} funded with ${formatCurrency(rows[0].remainingAmountCents, rows[0].currency)} remaining.`,
        highlights: rows.slice(0, 3).map((row) => ({
          label: row.goalName,
          value: `${formatPercent(row.percentComplete)} • ${formatCurrency(row.currentAmountCents, row.currency)} saved`,
        })),
        details: rows.slice(0, 5).map((row) => {
          const trackText =
            row.onTrack === null
              ? 'No target date'
              : row.onTrack
                ? `On track vs ${formatPercent(row.expectedProgressPercent ?? 0)} expected pace`
                : `Behind pace vs ${formatPercent(row.expectedProgressPercent ?? 0)} expected pace`;
          return `${row.goalName}: ${formatCurrency(row.currentAmountCents, row.currency)} of ${formatCurrency(row.targetAmountCents, row.currency)} • ${trackText}`;
        }),
        emptyState: 'Try using the goal name exactly as it appears in your goals list.',
        tone: rows[0]?.onTrack === false ? 'warning' : 'positive',
      };
    }

    case 'budget_status': {
      const { rows, timeRangeLabel } = result.data;
      return {
        title: 'Budget status',
        summary:
          rows.length === 0
            ? `I couldn't find any matching budgets for ${timeRangeLabel}.`
            : `${rows[0].budgetName} is ${formatPercent(rows[0].percentUsed)} used ${timeRangeLabel}, leaving ${formatCurrency(rows[0].remainingAmountCents, rows[0].currency)} remaining.`,
        highlights: rows.slice(0, 3).map((row) => ({
          label: row.budgetName,
          value: `${formatPercent(row.percentUsed)} • ${formatCurrency(row.remainingAmountCents, row.currency)} left`,
        })),
        details: rows.slice(0, 5).map((row) => {
          const statusText =
            row.status === 'over_budget'
              ? 'Over budget'
              : row.status === 'warning'
                ? 'Close to limit'
                : 'On track';
          return `${row.budgetName}: ${formatCurrency(row.spentAmountCents, row.currency)} of ${formatCurrency(row.budgetAmountCents, row.currency)} • ${statusText}`;
        }),
        emptyState: 'Try a different budget, category, or month.',
        tone: rows[0]?.status === 'over_budget' ? 'warning' : 'neutral',
      };
    }

    case 'trend_analysis': {
      const {
        averageMonthlyCents,
        changePercent,
        trendDirection,
        metric,
        mode,
        points,
        currency,
        timeRangeLabel,
      } = result.data;
      const metricLabel = metric === 'income' ? 'income' : 'spending';
      return {
        title:
          mode === 'average'
            ? `Average monthly ${metricLabel}`
            : `${metricLabel[0].toUpperCase()}${metricLabel.slice(1)} trend`,
        summary:
          points.length === 0
            ? `I couldn't find enough ${metricLabel} data to analyze ${timeRangeLabel}.`
            : mode === 'average'
              ? `Your average monthly ${metricLabel} is ${formatCurrency(averageMonthlyCents, currency)} over ${points.length} month${points.length === 1 ? '' : 's'}.`
              : `Your ${metricLabel} trend is ${trendDirection ?? 'flat'} over ${timeRangeLabel}, with an average of ${formatCurrency(averageMonthlyCents, currency)} per month.`,
        highlights: [
          { label: 'Average per month', value: formatCurrency(averageMonthlyCents, currency) },
          { label: 'Trend', value: trendDirection === null ? '—' : trendDirection },
          { label: 'Change', value: changePercent === null ? '—' : formatPercent(changePercent) },
        ],
        details: points
          .slice(-6)
          .map((point) => `${point.period}: ${formatCurrency(point.totalCents, point.currency)}`),
        emptyState: 'Try a broader date range so I can compare multiple months.',
      };
    }
  }
}
