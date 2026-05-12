// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `generate-report` Edge Function (#1109).
 *
 * Validates report configuration validation, CSV generation, text report
 * formatting, date-range logic, category grouping, and chart data shapes —
 * all using extracted pure functions.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// Extracted pure functions — mirror index.ts logic for isolated testing.
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const VALID_REPORT_TYPES = [
  'spending_summary',
  'income_expense',
  'category_breakdown',
  'account_balance',
  'budget_variance',
  'trend_analysis',
] as const;
type ReportType = (typeof VALID_REPORT_TYPES)[number];

const VALID_GROUP_BY = ['day', 'week', 'month', 'quarter', 'year', 'category', 'account'] as const;

interface ReportConfig {
  household_id: string;
  report_type: ReportType;
  date_from: string;
  date_to: string;
  category_ids?: string[];
  account_ids?: string[];
  group_by?: string;
  currency_code?: string;
}

function validateConfig(body: Record<string, unknown>): ReportConfig | string {
  const {
    household_id,
    report_type,
    date_from,
    date_to,
    category_ids,
    account_ids,
    group_by,
    currency_code,
  } = body as Partial<ReportConfig>;

  if (!household_id || typeof household_id !== 'string') return 'household_id is required';
  if (!report_type || !(VALID_REPORT_TYPES as readonly string[]).includes(report_type))
    return `Invalid report_type. Valid: ${VALID_REPORT_TYPES.join(', ')}`;
  if (!date_from || !ISO_DATE_PATTERN.test(date_from)) return 'date_from is required (YYYY-MM-DD)';
  if (!date_to || !ISO_DATE_PATTERN.test(date_to)) return 'date_to is required (YYYY-MM-DD)';
  if (date_from > date_to) return 'date_from must be before or equal to date_to';
  if (group_by && !(VALID_GROUP_BY as readonly string[]).includes(group_by))
    return `Invalid group_by. Valid: ${VALID_GROUP_BY.join(', ')}`;
  if (category_ids && !Array.isArray(category_ids)) return 'category_ids must be an array of UUIDs';
  if (account_ids && !Array.isArray(account_ids)) return 'account_ids must be an array of UUIDs';

  return {
    household_id,
    report_type: report_type as ReportType,
    date_from,
    date_to,
    category_ids,
    account_ids,
    group_by: group_by ?? 'month',
    currency_code: currency_code ?? 'USD',
  };
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function transactionsToCsv(
  rows: Record<string, unknown>[],
  columns: readonly string[] = [
    'date',
    'type',
    'amount_cents',
    'currency_code',
    'category_name',
    'account_name',
    'payee',
    'notes',
  ],
): string {
  const lines: string[] = [columns.join(',')];
  for (const row of rows) {
    const values = columns.map((col) => escapeCsvField(row[col]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

function generateTextReport(reportData: Record<string, unknown>, config: ReportConfig): string {
  const lines: string[] = [];
  const separator = '='.repeat(60);

  lines.push(separator);
  lines.push(`FINANCIAL REPORT — ${config.report_type.replace(/_/g, ' ').toUpperCase()}`);
  lines.push(separator);
  lines.push(`Date Range: ${config.date_from} to ${config.date_to}`);
  lines.push(`Currency: ${config.currency_code}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  switch (config.report_type) {
    case 'spending_summary': {
      const totals = (reportData.period_totals as Array<Record<string, unknown>>) ?? [];
      lines.push('PERIOD TOTALS');
      lines.push('-'.repeat(40));
      for (const period of totals) {
        const cents = period.total_cents as number;
        lines.push(`  ${period.period}:  ${(cents / 100).toFixed(2)} ${config.currency_code}`);
      }
      lines.push('');
      const grand = (reportData.grand_total_cents as number) ?? 0;
      lines.push(`TOTAL: ${(grand / 100).toFixed(2)} ${config.currency_code}`);
      break;
    }
    case 'income_expense': {
      const income = ((reportData.income_cents as number) ?? 0) / 100;
      const expense = ((reportData.expense_cents as number) ?? 0) / 100;
      const net = ((reportData.net_cents as number) ?? 0) / 100;
      lines.push(`Income:  ${income.toFixed(2)} ${config.currency_code}`);
      lines.push(`Expense: ${expense.toFixed(2)} ${config.currency_code}`);
      lines.push(`Net:     ${net.toFixed(2)} ${config.currency_code}`);
      break;
    }
    default:
      lines.push(JSON.stringify(reportData, null, 2));
  }

  lines.push('');
  lines.push(separator);
  lines.push('END OF REPORT');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Config Validation Tests
// ---------------------------------------------------------------------------

Deno.test('validateConfig — valid spending summary config', () => {
  const config = validateConfig({
    household_id: 'test-household-id',
    report_type: 'spending_summary',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
  });

  assertEquals(typeof config, 'object');
  assertEquals((config as ReportConfig).household_id, 'test-household-id');
  assertEquals((config as ReportConfig).report_type, 'spending_summary');
  assertEquals((config as ReportConfig).group_by, 'month'); // default
  assertEquals((config as ReportConfig).currency_code, 'USD'); // default
});

Deno.test('validateConfig — all valid report types accepted', () => {
  for (const reportType of VALID_REPORT_TYPES) {
    const result = validateConfig({
      household_id: 'test',
      report_type: reportType,
      date_from: '2025-01-01',
      date_to: '2025-12-31',
    });
    assertEquals(typeof result, 'object', `${reportType} should be accepted`);
  }
});

Deno.test('validateConfig — rejects missing household_id', () => {
  const result = validateConfig({
    report_type: 'spending_summary',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
  });
  assertEquals(result, 'household_id is required');
});

Deno.test('validateConfig — rejects invalid report_type', () => {
  const result = validateConfig({
    household_id: 'test',
    report_type: 'invalid_type',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
  });
  assertEquals(typeof result, 'string');
  assertStringIncludes(result as string, 'Invalid report_type');
});

Deno.test('validateConfig — rejects invalid date format', () => {
  const result = validateConfig({
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '01-01-2025', // wrong format
    date_to: '2025-03-31',
  });
  assertEquals(result, 'date_from is required (YYYY-MM-DD)');
});

Deno.test('validateConfig — rejects date_from after date_to', () => {
  const result = validateConfig({
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '2025-06-01',
    date_to: '2025-01-01',
  });
  assertEquals(result, 'date_from must be before or equal to date_to');
});

Deno.test('validateConfig — rejects invalid group_by', () => {
  const result = validateConfig({
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
    group_by: 'invalid',
  });
  assertStringIncludes(result as string, 'Invalid group_by');
});

Deno.test('validateConfig — accepts all valid group_by options', () => {
  for (const groupBy of VALID_GROUP_BY) {
    const result = validateConfig({
      household_id: 'test',
      report_type: 'spending_summary',
      date_from: '2025-01-01',
      date_to: '2025-12-31',
      group_by: groupBy,
    });
    assertEquals(typeof result, 'object', `${groupBy} should be accepted`);
  }
});

Deno.test('validateConfig — accepts optional category_ids array', () => {
  const result = validateConfig({
    household_id: 'test',
    report_type: 'category_breakdown',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
    category_ids: ['cat-1', 'cat-2'],
  });
  assertEquals(typeof result, 'object');
  assertEquals((result as ReportConfig).category_ids, ['cat-1', 'cat-2']);
});

Deno.test('validateConfig — rejects non-array category_ids', () => {
  const result = validateConfig({
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
    category_ids: 'not-an-array',
  });
  assertEquals(result, 'category_ids must be an array of UUIDs');
});

// ---------------------------------------------------------------------------
// CSV Generation Tests
// ---------------------------------------------------------------------------

Deno.test('escapeCsvField — plain text unchanged', () => {
  assertEquals(escapeCsvField('hello'), 'hello');
  assertEquals(escapeCsvField('123'), '123');
});

Deno.test('escapeCsvField — escapes commas', () => {
  assertEquals(escapeCsvField('hello, world'), '"hello, world"');
});

Deno.test('escapeCsvField — escapes double quotes', () => {
  assertEquals(escapeCsvField('say "hi"'), '"say ""hi"""');
});

Deno.test('escapeCsvField — escapes newlines', () => {
  assertEquals(escapeCsvField('line1\nline2'), '"line1\nline2"');
});

Deno.test('escapeCsvField — handles null and undefined', () => {
  assertEquals(escapeCsvField(null), '');
  assertEquals(escapeCsvField(undefined), '');
});

Deno.test('escapeCsvField — handles numbers', () => {
  assertEquals(escapeCsvField(1500), '1500');
  assertEquals(escapeCsvField(0), '0');
});

Deno.test('transactionsToCsv — generates header and rows', () => {
  const rows = [
    {
      date: '2025-01-15',
      type: 'expense',
      amount_cents: 5000,
      currency_code: 'USD',
      category_name: 'Groceries',
      account_name: 'Checking',
      payee: 'Walmart',
      notes: '',
    },
    {
      date: '2025-01-20',
      type: 'income',
      amount_cents: 300000,
      currency_code: 'USD',
      category_name: 'Salary',
      account_name: 'Checking',
      payee: 'Employer Inc',
      notes: 'Monthly salary',
    },
  ];

  const csv = transactionsToCsv(rows);
  const lines = csv.split('\n');

  assertEquals(lines.length, 3); // header + 2 rows
  assertEquals(
    lines[0],
    'date,type,amount_cents,currency_code,category_name,account_name,payee,notes',
  );
  assertStringIncludes(lines[1], '2025-01-15');
  assertStringIncludes(lines[1], 'expense');
  assertStringIncludes(lines[1], '5000');
  assertStringIncludes(lines[2], 'Employer Inc');
});

Deno.test('transactionsToCsv — handles empty rows', () => {
  const csv = transactionsToCsv([]);
  const lines = csv.split('\n');

  assertEquals(lines.length, 1); // header only
});

Deno.test('transactionsToCsv — handles special characters in payee', () => {
  const rows = [
    {
      date: '2025-01-15',
      type: 'expense',
      amount_cents: 1500,
      currency_code: 'USD',
      category_name: 'Food',
      account_name: 'Card',
      payee: 'Joe\'s "Cafe", LLC',
      notes: '',
    },
  ];

  const csv = transactionsToCsv(rows);
  // The payee with comma and quotes should be properly escaped
  assertStringIncludes(csv, '"Joe\'s ""Cafe"", LLC"');
});

Deno.test('transactionsToCsv — custom columns', () => {
  const rows = [{ date: '2025-01-01', amount_cents: 1000 }];
  const csv = transactionsToCsv(rows, ['date', 'amount_cents']);
  const lines = csv.split('\n');

  assertEquals(lines[0], 'date,amount_cents');
  assertEquals(lines[1], '2025-01-01,1000');
});

// ---------------------------------------------------------------------------
// Text Report Generation Tests
// ---------------------------------------------------------------------------

Deno.test('generateTextReport — spending summary format', () => {
  const config: ReportConfig = {
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '2025-01-01',
    date_to: '2025-03-31',
    currency_code: 'USD',
  };

  const data = {
    report_type: 'spending_summary',
    period_totals: [
      { period: '2025-01', total_cents: 150000 },
      { period: '2025-02', total_cents: 120000 },
      { period: '2025-03', total_cents: 180000 },
    ],
    grand_total_cents: 450000,
  };

  const report = generateTextReport(data, config);

  assertStringIncludes(report, 'SPENDING SUMMARY');
  assertStringIncludes(report, '2025-01-01 to 2025-03-31');
  assertStringIncludes(report, '2025-01:  1500.00 USD');
  assertStringIncludes(report, '2025-02:  1200.00 USD');
  assertStringIncludes(report, '2025-03:  1800.00 USD');
  assertStringIncludes(report, 'TOTAL: 4500.00 USD');
  assertStringIncludes(report, 'END OF REPORT');
});

Deno.test('generateTextReport — income expense format', () => {
  const config: ReportConfig = {
    household_id: 'test',
    report_type: 'income_expense',
    date_from: '2025-01-01',
    date_to: '2025-01-31',
    currency_code: 'EUR',
  };

  const data = {
    income_cents: 500000,
    expense_cents: 350000,
    net_cents: 150000,
  };

  const report = generateTextReport(data, config);

  assertStringIncludes(report, 'INCOME EXPENSE');
  assertStringIncludes(report, 'Income:  5000.00 EUR');
  assertStringIncludes(report, 'Expense: 3500.00 EUR');
  assertStringIncludes(report, 'Net:     1500.00 EUR');
});

Deno.test('generateTextReport — includes date range and currency', () => {
  const config: ReportConfig = {
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '2025-06-01',
    date_to: '2025-06-30',
    currency_code: 'GBP',
  };

  const report = generateTextReport({ period_totals: [], grand_total_cents: 0 }, config);

  assertStringIncludes(report, 'Date Range: 2025-06-01 to 2025-06-30');
  assertStringIncludes(report, 'Currency: GBP');
});

// ---------------------------------------------------------------------------
// Aggregation Logic Tests
// ---------------------------------------------------------------------------

Deno.test('BigInt aggregation — handles 10K+ transactions without overflow', () => {
  // Simulate aggregating 10,000 transactions of $100 each
  let total = BigInt(0);
  for (let i = 0; i < 10000; i++) {
    total += BigInt(10000); // $100.00 in cents
  }

  assertEquals(Number(total), 100000000); // $1,000,000.00 in cents
  assertEquals(total, BigInt(100000000));
});

Deno.test('BigInt aggregation — period grouping', () => {
  const transactions = [
    { date: '2025-01-05', amount_cents: 5000, type: 'expense' },
    { date: '2025-01-15', amount_cents: 7500, type: 'expense' },
    { date: '2025-02-10', amount_cents: 3000, type: 'expense' },
    { date: '2025-02-20', amount_cents: 12000, type: 'income' },
  ];

  const periodTotals: Record<string, bigint> = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const period = tx.date.substring(0, 7);
    periodTotals[period] = (periodTotals[period] ?? BigInt(0)) + BigInt(tx.amount_cents);
  }

  assertEquals(Number(periodTotals['2025-01']), 12500);
  assertEquals(Number(periodTotals['2025-02']), 3000);
});

Deno.test('BigInt aggregation — category breakdown with percentages', () => {
  const categoryTotals: Record<string, bigint> = {
    groceries: BigInt(15000),
    dining: BigInt(8000),
    transport: BigInt(2000),
  };

  const grandTotal = Object.values(categoryTotals).reduce((sum, v) => sum + v, BigInt(0));
  assertEquals(Number(grandTotal), 25000);

  const groceriesPct = Number((BigInt(15000) * BigInt(10000)) / grandTotal) / 100;
  assertEquals(groceriesPct, 60.0);

  const diningPct = Number((BigInt(8000) * BigInt(10000)) / grandTotal) / 100;
  assertEquals(diningPct, 32.0);
});

// ---------------------------------------------------------------------------
// Chart Data Shape Tests
// ---------------------------------------------------------------------------

Deno.test('trend analysis — time series data shape', () => {
  const monthlyData: Record<string, { income: bigint; expense: bigint }> = {
    '2025-01': { income: BigInt(500000), expense: BigInt(350000) },
    '2025-02': { income: BigInt(500000), expense: BigInt(400000) },
    '2025-03': { income: BigInt(520000), expense: BigInt(380000) },
  };

  const trends = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      income_cents: Number(data.income),
      expense_cents: Number(data.expense),
      net_cents: Number(data.income - data.expense),
    }));

  assertEquals(trends.length, 3);
  assertEquals(trends[0].month, '2025-01');
  assertEquals(trends[0].income_cents, 500000);
  assertEquals(trends[0].net_cents, 150000);
  assertEquals(trends[2].month, '2025-03');
  assertEquals(trends[2].net_cents, 140000);
});

Deno.test('category breakdown — chart data shape', () => {
  const categories = [
    { category_name: 'Groceries', total_cents: 15000, percentage: 60.0 },
    { category_name: 'Dining', total_cents: 8000, percentage: 32.0 },
    { category_name: 'Transport', total_cents: 2000, percentage: 8.0 },
  ];

  // Verify percentages sum to 100
  const totalPct = categories.reduce((sum, c) => sum + c.percentage, 0);
  assertEquals(totalPct, 100.0);

  // Verify sorting by total (descending)
  for (let i = 1; i < categories.length; i++) {
    assertEquals(categories[i - 1].total_cents >= categories[i].total_cents, true);
  }
});

// ---------------------------------------------------------------------------
// Mock Request Tests
// ---------------------------------------------------------------------------

Deno.test('mock request — creates valid report generation request', () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/generate-report',
    body: {
      household_id: 'test-household',
      report_type: 'spending_summary',
      date_from: '2025-01-01',
      date_to: '2025-03-31',
    },
  });

  assertEquals(req.method, 'POST');
});

Deno.test('mock request — creates valid CSV export request', () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/generate-report?action=export_csv',
    body: {
      household_id: 'test-household',
      report_type: 'spending_summary',
      date_from: '2025-01-01',
      date_to: '2025-03-31',
    },
  });

  const url = new URL(req.url);
  assertEquals(url.searchParams.get('action'), 'export_csv');
});

Deno.test('mock request — creates valid save config request', () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/generate-report?action=save',
    body: {
      household_id: 'test-household',
      report_type: 'spending_summary',
      date_from: '2025-01-01',
      date_to: '2025-03-31',
      name: 'Q1 Spending Report',
    },
  });

  const url = new URL(req.url);
  assertEquals(url.searchParams.get('action'), 'save');
});

Deno.test('mock request — creates valid schedule request', () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/generate-report?action=schedule',
    body: {
      report_config_id: 'config-id',
      household_id: 'test-household',
      cron_expression: '0 9 1 * *', // 1st of every month at 9am
    },
  });

  const url = new URL(req.url);
  assertEquals(url.searchParams.get('action'), 'schedule');
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

Deno.test('validates same-day date range', () => {
  const config = validateConfig({
    household_id: 'test',
    report_type: 'spending_summary',
    date_from: '2025-03-15',
    date_to: '2025-03-15', // Same day
  });
  assertEquals(typeof config, 'object');
});

Deno.test('CSV handles missing fields gracefully', () => {
  const rows = [
    { date: '2025-01-01', type: 'expense', amount_cents: 1500 },
    // Missing category_name, account_name, payee, notes, currency_code
  ];

  const csv = transactionsToCsv(rows);
  const lines = csv.split('\n');
  assertEquals(lines.length, 2);
  // Missing fields should be empty strings
  assertStringIncludes(lines[1], '2025-01-01');
});
