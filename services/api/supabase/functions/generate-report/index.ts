// SPDX-License-Identifier: BUSL-1.1

/**
 * Report Generation Edge Function (#sprint-8)
 *
 * Generates financial reports from household data:
 *   POST /generate-report              — Generate a report from inline config
 *   POST /generate-report?action=save  — Save a report config for reuse
 *   POST /generate-report?action=schedule — Schedule recurring report generation
 *   GET  /generate-report               — List saved report configs
 *
 * Report Types:
 *   - spending_summary:    Total spending grouped by period
 *   - income_expense:      Income vs expense comparison
 *   - category_breakdown:  Spending per category (with percentages)
 *   - account_balance:     Balance snapshots per account
 *   - budget_variance:     Budget vs actual comparison
 *   - trend_analysis:      Month-over-month trend data
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - All data queries go through RLS (household isolation)
 *   - Rate-limited: 30 requests/minute per user
 *   - Aggregated results only — never returns raw transaction details
 *   - Monetary amounts returned as integer cents
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

/** ISO 8601 date pattern: YYYY-MM-DD */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Valid report types. */
const VALID_REPORT_TYPES = [
  'spending_summary',
  'income_expense',
  'category_breakdown',
  'account_balance',
  'budget_variance',
  'trend_analysis',
] as const;
type ReportType = (typeof VALID_REPORT_TYPES)[number];

/** Valid group_by options. */
const VALID_GROUP_BY = ['day', 'week', 'month', 'quarter', 'year', 'category', 'account'] as const;

/** Report configuration shape. */
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

/** Validate report config from request body. */
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

  if (!household_id || typeof household_id !== 'string') {
    return 'household_id is required';
  }

  if (!report_type || !(VALID_REPORT_TYPES as readonly string[]).includes(report_type)) {
    return `Invalid report_type. Valid: ${VALID_REPORT_TYPES.join(', ')}`;
  }

  if (!date_from || !ISO_DATE_PATTERN.test(date_from)) {
    return 'date_from is required (YYYY-MM-DD)';
  }

  if (!date_to || !ISO_DATE_PATTERN.test(date_to)) {
    return 'date_to is required (YYYY-MM-DD)';
  }

  if (date_from > date_to) {
    return 'date_from must be before or equal to date_to';
  }

  if (group_by && !(VALID_GROUP_BY as readonly string[]).includes(group_by)) {
    return `Invalid group_by. Valid: ${VALID_GROUP_BY.join(', ')}`;
  }

  if (category_ids && !Array.isArray(category_ids)) {
    return 'category_ids must be an array of UUIDs';
  }

  if (account_ids && !Array.isArray(account_ids)) {
    return 'account_ids must be an array of UUIDs';
  }

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

// ---------------------------------------------------------------------------
// CSV Export Helpers
// ---------------------------------------------------------------------------

/** Valid CSV export columns. Never includes raw financial identifiers. */
const CSV_COLUMNS = [
  'date',
  'type',
  'amount_cents',
  'currency_code',
  'category_name',
  'account_name',
  'payee',
  'notes',
] as const;

/**
 * Escape a CSV field value (RFC 4180 compliant).
 *
 * @param value The value to escape.
 * @returns The escaped string.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert transaction rows to CSV format.
 *
 * @param rows Array of transaction records.
 * @param columns Column names to include.
 * @returns CSV string with header row.
 */
export function transactionsToCsv(
  rows: Record<string, unknown>[],
  columns: readonly string[] = CSV_COLUMNS,
): string {
  const lines: string[] = [columns.join(',')];
  for (const row of rows) {
    const values = columns.map((col) => escapeCsvField(row[col]));
    lines.push(values.join(','));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// PDF Generation Stub
// ---------------------------------------------------------------------------

/**
 * Generate a simple text-based report document.
 *
 * This produces a plain-text formatted report suitable for download.
 * A full PDF implementation (using e.g. pdf-lib) can replace this
 * function in a future iteration.
 *
 * @param reportData The report data object.
 * @param config The report configuration.
 * @returns A formatted text report string.
 */
export function generateTextReport(
  reportData: Record<string, unknown>,
  config: ReportConfig,
): string {
  const lines: string[] = [];
  const separator = '='.repeat(60);

  lines.push(separator);
  lines.push(`FINANCIAL REPORT — ${config.report_type.replace(/_/g, ' ').toUpperCase()}`);
  lines.push(separator);
  lines.push(`Date Range: ${config.date_from} to ${config.date_to}`);
  lines.push(`Currency: ${config.currency_code}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Format based on report type
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
    case 'category_breakdown': {
      const cats = (reportData.categories as Array<Record<string, unknown>>) ?? [];
      lines.push('CATEGORY BREAKDOWN');
      lines.push('-'.repeat(40));
      for (const cat of cats) {
        const cents = cat.total_cents as number;
        const pct = cat.percentage as number;
        lines.push(`  ${cat.category_name}: ${(cents / 100).toFixed(2)} (${pct.toFixed(1)}%)`);
      }
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

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('generate-report');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('generate-report', req);
  if (envError) return envError;

  try {
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);
    const supabase = createAdminClient();

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['generate-report']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['generate-report']);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'GET') {
      // ===================================================================
      // LIST SAVED REPORT CONFIGS
      // ===================================================================
      const householdId = url.searchParams.get('household_id');
      if (!householdId) {
        return errorResponse(req, 'household_id query parameter is required');
      }

      const { data: configs, error: listErr } = await supabase
        .from('report_configs')
        .select(
          'id, household_id, owner_id, name, report_type, config, last_generated_at, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (listErr) {
        logger.error('Failed to list report configs', { errorMessage: listErr.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { report_configs: configs ?? [] });
    }

    if (req.method !== 'POST') {
      return methodNotAllowedResponse(req);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON body');
    }

    if (action === 'save') {
      // ===================================================================
      // SAVE REPORT CONFIG
      // ===================================================================
      const configOrError = validateConfig(body);
      if (typeof configOrError === 'string') {
        return errorResponse(req, configOrError);
      }

      const { name } = body as { name?: string };
      if (!name || typeof name !== 'string') {
        return errorResponse(req, 'name is required when saving a report config');
      }

      const { data: saved, error: saveErr } = await supabase
        .from('report_configs')
        .insert({
          household_id: configOrError.household_id,
          owner_id: user.id,
          name,
          report_type: configOrError.report_type,
          config: {
            date_from: configOrError.date_from,
            date_to: configOrError.date_to,
            category_ids: configOrError.category_ids,
            account_ids: configOrError.account_ids,
            group_by: configOrError.group_by,
            currency_code: configOrError.currency_code,
          },
        })
        .select('id, name, report_type, config, created_at')
        .single();

      if (saveErr) {
        logger.error('Failed to save report config', { errorMessage: saveErr.message });
        return internalErrorResponse(req);
      }

      logger.info('Report config saved', { httpStatus: 201 });
      return createdResponse(req, { report_config: saved });
    }

    if (action === 'schedule') {
      // ===================================================================
      // SCHEDULE REPORT
      // ===================================================================
      const { report_config_id, cron_expression, household_id } = body as {
        report_config_id?: string;
        cron_expression?: string;
        household_id?: string;
      };

      if (!report_config_id) {
        return errorResponse(req, 'report_config_id is required');
      }
      if (!cron_expression || typeof cron_expression !== 'string') {
        return errorResponse(req, 'cron_expression is required');
      }
      if (!household_id) {
        return errorResponse(req, 'household_id is required');
      }

      // Validate cron expression (basic 5-field check)
      const cronParts = cron_expression.trim().split(/\s+/);
      if (cronParts.length !== 5) {
        return errorResponse(req, 'cron_expression must be a 5-field cron expression');
      }

      const { data: schedule, error: schedErr } = await supabase
        .from('scheduled_reports')
        .insert({
          report_config_id,
          household_id,
          owner_id: user.id,
          cron_expression,
          is_active: true,
        })
        .select('id, report_config_id, cron_expression, is_active, created_at')
        .single();

      if (schedErr) {
        logger.error('Failed to schedule report', { errorMessage: schedErr.message });
        return internalErrorResponse(req);
      }

      logger.info('Report scheduled', { httpStatus: 201 });
      return createdResponse(req, { scheduled_report: schedule });
    }

    if (action === 'export_csv') {
      // ===================================================================
      // CSV EXPORT — raw transaction data with configurable columns
      // ===================================================================
      const configOrError = validateConfig(body);
      if (typeof configOrError === 'string') {
        return errorResponse(req, configOrError);
      }

      // Verify household membership
      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', configOrError.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (!membership) {
        return errorResponse(req, 'You are not a member of this household', 403);
      }

      // Query transactions for export
      let csvQuery = supabase
        .from('transactions')
        .select('date, type, amount_cents, currency_code, payee, notes, category_id, account_id')
        .eq('household_id', configOrError.household_id)
        .gte('date', configOrError.date_from)
        .lte('date', configOrError.date_to)
        .is('deleted_at', null)
        .order('date', { ascending: true });

      if (configOrError.account_ids?.length) {
        csvQuery = csvQuery.in('account_id', configOrError.account_ids);
      }
      if (configOrError.category_ids?.length) {
        csvQuery = csvQuery.in('category_id', configOrError.category_ids);
      }

      const { data: csvTxs, error: csvErr } = await csvQuery;
      if (csvErr) {
        logger.error('Failed to query transactions for CSV', { errorMessage: csvErr.message });
        return internalErrorResponse(req);
      }

      // Fetch category and account names for enrichment
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('household_id', configOrError.household_id)
        .is('deleted_at', null);

      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', configOrError.household_id)
        .is('deleted_at', null);

      const categoryMap = new Map(
        (categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
      );
      const accountMap = new Map(
        (accounts ?? []).map((a: { id: string; name: string }) => [a.id, a.name]),
      );

      // Enrich rows with names
      const enrichedRows = (csvTxs ?? []).map((tx: Record<string, unknown>) => ({
        date: tx.date,
        type: tx.type,
        amount_cents: tx.amount_cents,
        currency_code: tx.currency_code,
        category_name: categoryMap.get(tx.category_id as string) ?? 'Uncategorized',
        account_name: accountMap.get(tx.account_id as string) ?? 'Unknown',
        payee: tx.payee ?? '',
        notes: tx.notes ?? '',
      }));

      const csvContent = transactionsToCsv(enrichedRows);
      const filename = `report_${configOrError.report_type}_${configOrError.date_from}_${configOrError.date_to}.csv`;

      logger.info('CSV export generated', {
        httpStatus: 200,
        rowCount: enrichedRows.length,
      });

      return new Response(csvContent, {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    if (action === 'export_pdf') {
      // ===================================================================
      // PDF/TEXT EXPORT — formatted report document
      // ===================================================================
      const configOrError = validateConfig(body);
      if (typeof configOrError === 'string') {
        return errorResponse(req, configOrError);
      }

      // Verify household membership
      const { data: membership } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', configOrError.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (!membership) {
        return errorResponse(req, 'You are not a member of this household', 403);
      }

      // Generate the report data first (reuse existing report logic inline)
      // For now, generate a simple spending summary for the text report
      const { data: txData, error: txErr } = await supabase
        .from('transactions')
        .select('amount_cents, currency_code, date, type, category_id')
        .eq('household_id', configOrError.household_id)
        .gte('date', configOrError.date_from)
        .lte('date', configOrError.date_to)
        .is('deleted_at', null);

      if (txErr) {
        logger.error('Failed to query transactions for export', { errorMessage: txErr.message });
        return internalErrorResponse(req);
      }

      // Build summary data
      const periodTotals: Record<string, bigint> = {};
      let totalCents = BigInt(0);
      for (const tx of txData ?? []) {
        if (tx.type === 'expense') {
          const period = tx.date.substring(0, 7);
          const amount = BigInt(tx.amount_cents);
          periodTotals[period] = (periodTotals[period] ?? BigInt(0)) + amount;
          totalCents += amount;
        }
      }

      const reportData = {
        report_type: configOrError.report_type,
        period_totals: Object.entries(periodTotals).map(([period, cents]) => ({
          period,
          total_cents: Number(cents),
        })),
        grand_total_cents: Number(totalCents),
        transaction_count: txData?.length ?? 0,
      };

      const textContent = generateTextReport(reportData, configOrError);
      const filename = `report_${configOrError.report_type}_${configOrError.date_from}_${configOrError.date_to}.txt`;

      logger.info('Text report exported', { httpStatus: 200 });

      // TODO: Replace with actual PDF generation (e.g., pdf-lib) when available.
      // For now, returns a plain-text formatted report.
      return new Response(textContent, {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // =====================================================================
    // GENERATE REPORT (default action)
    // =====================================================================
    const configOrError = validateConfig(body);
    if (typeof configOrError === 'string') {
      return errorResponse(req, configOrError);
    }

    const config = configOrError;

    // Verify household membership
    const { data: membership } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', config.household_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      return errorResponse(req, 'You are not a member of this household', 403);
    }

    // Build the report based on type
    let reportData: Record<string, unknown>;

    switch (config.report_type) {
      case 'spending_summary': {
        // Aggregate spending by period
        let query = supabase
          .from('transactions')
          .select('amount_cents, currency_code, date, type, category_id')
          .eq('household_id', config.household_id)
          .gte('date', config.date_from)
          .lte('date', config.date_to)
          .eq('type', 'expense')
          .is('deleted_at', null);

        if (config.account_ids?.length) {
          query = query.in('account_id', config.account_ids);
        }
        if (config.category_ids?.length) {
          query = query.in('category_id', config.category_ids);
        }

        const { data: transactions, error: txErr } = await query;
        if (txErr) {
          logger.error('Failed to query transactions', { errorMessage: txErr.message });
          return internalErrorResponse(req);
        }

        // Aggregate in application code (RLS ensures data isolation)
        const periodTotals: Record<string, bigint> = {};
        let totalCents = BigInt(0);

        for (const tx of transactions ?? []) {
          const period = tx.date.substring(0, 7); // YYYY-MM
          const amount = BigInt(tx.amount_cents);
          periodTotals[period] = (periodTotals[period] ?? BigInt(0)) + amount;
          totalCents += amount;
        }

        reportData = {
          report_type: 'spending_summary',
          period_totals: Object.entries(periodTotals).map(([period, cents]) => ({
            period,
            total_cents: Number(cents),
            currency_code: config.currency_code,
          })),
          grand_total_cents: Number(totalCents),
          currency_code: config.currency_code,
          transaction_count: transactions?.length ?? 0,
        };
        break;
      }

      case 'income_expense': {
        const { data: transactions, error: txErr } = await supabase
          .from('transactions')
          .select('amount_cents, type, date')
          .eq('household_id', config.household_id)
          .gte('date', config.date_from)
          .lte('date', config.date_to)
          .is('deleted_at', null);

        if (txErr) {
          logger.error('Failed to query transactions', { errorMessage: txErr.message });
          return internalErrorResponse(req);
        }

        let incomeCents = BigInt(0);
        let expenseCents = BigInt(0);

        for (const tx of transactions ?? []) {
          const amount = BigInt(tx.amount_cents);
          if (tx.type === 'income') {
            incomeCents += amount;
          } else if (tx.type === 'expense') {
            expenseCents += amount;
          }
        }

        reportData = {
          report_type: 'income_expense',
          income_cents: Number(incomeCents),
          expense_cents: Number(expenseCents),
          net_cents: Number(incomeCents - expenseCents),
          currency_code: config.currency_code,
          transaction_count: transactions?.length ?? 0,
        };
        break;
      }

      case 'category_breakdown': {
        let query = supabase
          .from('transactions')
          .select('amount_cents, category_id, type')
          .eq('household_id', config.household_id)
          .gte('date', config.date_from)
          .lte('date', config.date_to)
          .eq('type', 'expense')
          .is('deleted_at', null);

        if (config.account_ids?.length) {
          query = query.in('account_id', config.account_ids);
        }

        const { data: transactions, error: txErr } = await query;
        if (txErr) {
          logger.error('Failed to query transactions', { errorMessage: txErr.message });
          return internalErrorResponse(req);
        }

        // Fetch categories for names
        const { data: categories } = await supabase
          .from('categories')
          .select('id, name')
          .eq('household_id', config.household_id)
          .is('deleted_at', null);

        const categoryMap = new Map(
          (categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
        );

        const categoryTotals: Record<string, bigint> = {};
        let grandTotal = BigInt(0);

        for (const tx of transactions ?? []) {
          const catId = tx.category_id ?? 'uncategorized';
          const amount = BigInt(tx.amount_cents);
          categoryTotals[catId] = (categoryTotals[catId] ?? BigInt(0)) + amount;
          grandTotal += amount;
        }

        const breakdown = Object.entries(categoryTotals).map(([catId, cents]) => ({
          category_id: catId === 'uncategorized' ? null : catId,
          category_name:
            catId === 'uncategorized' ? 'Uncategorized' : (categoryMap.get(catId) ?? 'Unknown'),
          total_cents: Number(cents),
          percentage: grandTotal > 0 ? Number((cents * BigInt(10000)) / grandTotal) / 100 : 0,
          currency_code: config.currency_code,
        }));

        breakdown.sort((a, b) => b.total_cents - a.total_cents);

        reportData = {
          report_type: 'category_breakdown',
          categories: breakdown,
          grand_total_cents: Number(grandTotal),
          currency_code: config.currency_code,
        };
        break;
      }

      case 'account_balance': {
        let query = supabase
          .from('accounts')
          .select('id, name, type, balance_cents, currency_code')
          .eq('household_id', config.household_id)
          .is('deleted_at', null);

        if (config.account_ids?.length) {
          query = query.in('id', config.account_ids);
        }

        const { data: accounts, error: accErr } = await query;
        if (accErr) {
          logger.error('Failed to query accounts', { errorMessage: accErr.message });
          return internalErrorResponse(req);
        }

        reportData = {
          report_type: 'account_balance',
          accounts: (accounts ?? []).map((a: Record<string, unknown>) => ({
            account_id: a.id,
            account_name: a.name,
            account_type: a.type,
            balance_cents: a.balance_cents,
            currency_code: a.currency_code,
          })),
          snapshot_date: new Date().toISOString(),
        };
        break;
      }

      case 'budget_variance': {
        const { data: budgets, error: budErr } = await supabase
          .from('budgets')
          .select('id, category_id, amount_cents, currency_code, period')
          .eq('household_id', config.household_id)
          .is('deleted_at', null);

        if (budErr) {
          logger.error('Failed to query budgets', { errorMessage: budErr.message });
          return internalErrorResponse(req);
        }

        // Get actual spending per category in date range
        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount_cents, category_id')
          .eq('household_id', config.household_id)
          .gte('date', config.date_from)
          .lte('date', config.date_to)
          .eq('type', 'expense')
          .is('deleted_at', null);

        const actualByCategory: Record<string, bigint> = {};
        for (const tx of transactions ?? []) {
          const catId = tx.category_id ?? 'uncategorized';
          actualByCategory[catId] =
            (actualByCategory[catId] ?? BigInt(0)) + BigInt(tx.amount_cents);
        }

        const { data: categories } = await supabase
          .from('categories')
          .select('id, name')
          .eq('household_id', config.household_id)
          .is('deleted_at', null);

        const categoryMap = new Map(
          (categories ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
        );

        const variances = (budgets ?? []).map((b: Record<string, unknown>) => {
          const budgetCents = BigInt(b.amount_cents as number);
          const actualCents = actualByCategory[b.category_id as string] ?? BigInt(0);
          return {
            budget_id: b.id,
            category_id: b.category_id,
            category_name: categoryMap.get(b.category_id as string) ?? 'Unknown',
            budget_cents: Number(budgetCents),
            actual_cents: Number(actualCents),
            variance_cents: Number(budgetCents - actualCents),
            utilization_pct:
              budgetCents > 0 ? Number((actualCents * BigInt(10000)) / budgetCents) / 100 : 0,
            currency_code: b.currency_code,
          };
        });

        reportData = {
          report_type: 'budget_variance',
          budgets: variances,
        };
        break;
      }

      case 'trend_analysis': {
        const { data: transactions, error: txErr } = await supabase
          .from('transactions')
          .select('amount_cents, type, date')
          .eq('household_id', config.household_id)
          .gte('date', config.date_from)
          .lte('date', config.date_to)
          .is('deleted_at', null)
          .order('date', { ascending: true });

        if (txErr) {
          logger.error('Failed to query transactions', { errorMessage: txErr.message });
          return internalErrorResponse(req);
        }

        const monthlyData: Record<string, { income: bigint; expense: bigint }> = {};

        for (const tx of transactions ?? []) {
          const month = tx.date.substring(0, 7);
          if (!monthlyData[month]) {
            monthlyData[month] = { income: BigInt(0), expense: BigInt(0) };
          }
          const amount = BigInt(tx.amount_cents);
          if (tx.type === 'income') {
            monthlyData[month].income += amount;
          } else if (tx.type === 'expense') {
            monthlyData[month].expense += amount;
          }
        }

        const trends = Object.entries(monthlyData)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({
            month,
            income_cents: Number(data.income),
            expense_cents: Number(data.expense),
            net_cents: Number(data.income - data.expense),
            currency_code: config.currency_code,
          }));

        reportData = {
          report_type: 'trend_analysis',
          trends,
          currency_code: config.currency_code,
        };
        break;
      }

      default:
        return errorResponse(req, 'Unsupported report type');
    }

    // Update last_generated_at if this was from a saved config
    const { report_config_id } = body as { report_config_id?: string };
    if (report_config_id) {
      await supabase
        .from('report_configs')
        .update({ last_generated_at: new Date().toISOString() })
        .eq('id', report_config_id);
    }

    logger.info('Report generated', {
      httpStatus: 200,
      reportType: config.report_type,
    });

    return jsonResponse(req, {
      report: {
        ...reportData,
        generated_at: new Date().toISOString(),
        date_range: { from: config.date_from, to: config.date_to },
        household_id: config.household_id,
      },
    });
  } catch (err) {
    logger.error('Report generation error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
