// SPDX-License-Identifier: BUSL-1.1

import type { LocalDate, Transaction } from '../../kmp/bridge';
import { escapeCsvField } from '../export/simple-export';

export const DEFAULT_CLIENT_TAG_PREFIXES = ['client:', 'project:'] as const;

export interface ClientProfitabilityOptions {
  startDate?: LocalDate;
  endDate?: LocalDate;
  tagPrefixes?: readonly string[];
}

export interface ClientProfitabilityRow {
  client: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  profitMargin: number | null;
  transactionCount: number;
  revenueTransactionCount: number;
  expenseTransactionCount: number;
}

export interface ClientProfitabilitySummary {
  rows: ClientProfitabilityRow[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number | null;
  mostProfitable: ClientProfitabilityRow | null;
  leastProfitable: ClientProfitabilityRow | null;
  clientCount: number;
}

interface MutableClientProfitabilityRow extends ClientProfitabilityRow {
  transactionIds: Set<string>;
  revenueTransactionIds: Set<string>;
  expenseTransactionIds: Set<string>;
}

function normalizeTagPrefix(prefix: string): string {
  return prefix.trim().toLowerCase();
}

function profitMargin(revenue: number, netProfit: number): number | null {
  if (revenue <= 0) {
    return null;
  }

  return (netProfit / revenue) * 100;
}

function isInDateRange(
  transaction: Transaction,
  startDate?: LocalDate,
  endDate?: LocalDate,
): boolean {
  if (startDate !== undefined && transaction.date < startDate) {
    return false;
  }

  if (endDate !== undefined && transaction.date > endDate) {
    return false;
  }

  return true;
}

function createEmptyRow(client: string): MutableClientProfitabilityRow {
  return {
    client,
    revenue: 0,
    expenses: 0,
    netProfit: 0,
    profitMargin: null,
    transactionCount: 0,
    revenueTransactionCount: 0,
    expenseTransactionCount: 0,
    transactionIds: new Set<string>(),
    revenueTransactionIds: new Set<string>(),
    expenseTransactionIds: new Set<string>(),
  };
}

/**
 * Extract client/project labels from transaction tags.
 *
 * Supported tags use the existing free-form tagging system with prefixes such
 * as `client:Acme` or `project:Website redesign`.
 */
export function extractClientProjectLabels(
  tags: readonly string[],
  tagPrefixes: readonly string[] = DEFAULT_CLIENT_TAG_PREFIXES,
): string[] {
  const normalizedPrefixes = tagPrefixes.map(normalizeTagPrefix).filter((prefix) => prefix !== '');
  const labels = new Set<string>();

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    const lowerTag = tag.toLowerCase();
    const prefix = normalizedPrefixes.find((candidate) => lowerTag.startsWith(candidate));

    if (!prefix) {
      continue;
    }

    const label = tag.slice(prefix.length).trim();
    if (label !== '') {
      labels.add(label);
    }
  }

  return [...labels];
}

/**
 * Build a per-client/project profit-and-loss report from real transactions.
 *
 * Income transactions contribute revenue; expense transactions contribute cost.
 * Transfers and untagged transactions are ignored. If a transaction has multiple
 * client/project tags, its amount is split evenly so summary totals do not
 * double count that real transaction.
 */
export function buildClientProfitabilityReport(
  transactions: readonly Transaction[],
  options: ClientProfitabilityOptions = {},
): ClientProfitabilitySummary {
  const rowsByClient = new Map<string, MutableClientProfitabilityRow>();

  for (const transaction of transactions) {
    if (!isInDateRange(transaction, options.startDate, options.endDate)) {
      continue;
    }

    if (transaction.type !== 'INCOME' && transaction.type !== 'EXPENSE') {
      continue;
    }

    const labels = extractClientProjectLabels(transaction.tags, options.tagPrefixes);
    if (labels.length === 0) {
      continue;
    }

    const amount = Math.abs(transaction.amount.amount);
    const baseAllocation = Math.floor(amount / labels.length);
    const remainder = amount % labels.length;

    labels.forEach((label, index) => {
      const allocatedAmount = baseAllocation + (index < remainder ? 1 : 0);
      const row = rowsByClient.get(label) ?? createEmptyRow(label);

      if (transaction.type === 'INCOME') {
        row.revenue += allocatedAmount;
        row.revenueTransactionIds.add(transaction.id);
      } else {
        row.expenses += allocatedAmount;
        row.expenseTransactionIds.add(transaction.id);
      }

      row.transactionIds.add(transaction.id);
      rowsByClient.set(label, row);
    });
  }

  const rows = [...rowsByClient.values()].map<ClientProfitabilityRow>((row) => {
    const netProfit = row.revenue - row.expenses;
    return {
      client: row.client,
      revenue: row.revenue,
      expenses: row.expenses,
      netProfit,
      profitMargin: profitMargin(row.revenue, netProfit),
      transactionCount: row.transactionIds.size,
      revenueTransactionCount: row.revenueTransactionIds.size,
      expenseTransactionCount: row.expenseTransactionIds.size,
    };
  });

  rows.sort((a, b) => {
    const profitDelta = b.netProfit - a.netProfit;
    if (profitDelta !== 0) return profitDelta;

    const marginA = a.profitMargin ?? Number.NEGATIVE_INFINITY;
    const marginB = b.profitMargin ?? Number.NEGATIVE_INFINITY;
    const marginDelta = marginB - marginA;
    if (marginDelta !== 0) return marginDelta;

    return a.client.localeCompare(b.client);
  });

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalExpenses = rows.reduce((sum, row) => sum + row.expenses, 0);
  const netProfit = totalRevenue - totalExpenses;

  return {
    rows,
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin: profitMargin(totalRevenue, netProfit),
    mostProfitable: rows[0] ?? null,
    leastProfitable: rows.length > 0 ? rows[rows.length - 1] : null,
    clientCount: rows.length,
  };
}

function formatCsvAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatCsvMargin(margin: number | null): string {
  return margin === null || !Number.isFinite(margin) ? '' : margin.toFixed(1);
}

/**
 * Serialize a client/project profitability report as CSV for download.
 *
 * Amounts are emitted in major currency units with two decimals to match the
 * app's other CSV exports (e.g. cash flow). Client/project labels are escaped so
 * that a comma or quote in a client name cannot break the row structure. A
 * trailing "All clients" row carries the report totals; its transaction column
 * is intentionally left blank because a single transaction can be split across
 * multiple clients and must not be double counted.
 */
export function exportClientProfitabilityCsv(report: ClientProfitabilitySummary): string {
  const header = 'Client / project,Revenue,Cost,Net profit,Margin %,Transactions';

  const rows = report.rows.map((row) =>
    [
      escapeCsvField(row.client),
      formatCsvAmount(row.revenue),
      formatCsvAmount(row.expenses),
      formatCsvAmount(row.netProfit),
      formatCsvMargin(row.profitMargin),
      String(row.transactionCount),
    ].join(','),
  );

  const totals = [
    escapeCsvField('All clients'),
    formatCsvAmount(report.totalRevenue),
    formatCsvAmount(report.totalExpenses),
    formatCsvAmount(report.netProfit),
    formatCsvMargin(report.profitMargin),
    '',
  ].join(',');

  return [header, ...rows, totals].join('\n');
}
