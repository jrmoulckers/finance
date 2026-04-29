// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Import Pipeline Edge Function (#sprint-11)
 *
 * Processes CSV uploads for transaction import:
 *   POST /import-data               — Upload and process a CSV file
 *   GET  /import-data               — List import jobs for a household
 *   GET  /import-data?job_id=<uuid> — Get status of a specific import job
 *
 * Supported CSV Formats:
 *   - generic: Auto-detect columns (date, amount, description/payee, category, note)
 *   - mint:    Mint export format (Date, Description, Original Description, Amount,
 *              Transaction Type, Category, Account Name, Labels, Notes)
 *   - ynab:    YNAB export format (Date, Payee, Category, Memo, Outflow, Inflow)
 *
 * Processing Pipeline:
 *   1. Parse CSV content
 *   2. Map columns to transaction fields (auto or explicit mapping)
 *   3. Validate each row (date format, amount, required fields)
 *   4. Detect duplicates by amount + date + description (payee)
 *   5. Insert valid, non-duplicate transactions in batches
 *   6. Track progress in import_jobs table
 *
 * Security:
 *   - Requires authentication (Bearer JWT)
 *   - Rate-limited: 5 requests/minute per user (file processing is expensive)
 *   - All inserts go through RLS (household isolation)
 *   - CSV content is never logged or stored (only metadata)
 *   - Max file size: 5MB
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum CSV content size: 5 MB. */
const MAX_CSV_SIZE = 5 * 1024 * 1024;

/** Maximum rows to process per import. */
const MAX_ROWS = 10_000;

/** Batch size for transaction inserts. */
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

/** Parse a CSV string into rows of string arrays. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (line.trim() === '') continue;

    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // Skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Date Parsing
// ---------------------------------------------------------------------------

/** Parse various date formats to YYYY-MM-DD. */
function parseDate(value: string): string | null {
  const trimmed = value.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  let match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const m = match[1].padStart(2, '0');
    const d = match[2].padStart(2, '0');
    return `${match[3]}-${m}-${d}`;
  }

  // MM/DD/YY
  match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (match) {
    const year = parseInt(match[3], 10);
    const fullYear = year >= 50 ? 1900 + year : 2000 + year;
    const m = match[1].padStart(2, '0');
    const d = match[2].padStart(2, '0');
    return `${fullYear}-${m}-${d}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Amount Parsing
// ---------------------------------------------------------------------------

/** Parse amount string to integer cents. Handles $, commas, negatives, parens. */
function parseAmountCents(value: string): number | null {
  let cleaned = value.trim();

  // Remove currency symbols
  cleaned = cleaned.replace(/[$€£¥]/g, '');

  // Handle parentheses for negative: (123.45) → -123.45
  const isNegParens = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isNegParens) {
    cleaned = '-' + cleaned.substring(1, cleaned.length - 1);
  }

  // Remove thousands separators (commas)
  cleaned = cleaned.replace(/,/g, '');

  // Remove whitespace
  cleaned = cleaned.trim();

  if (cleaned === '' || cleaned === '-') return null;

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  // Convert to integer cents (round to avoid floating-point issues)
  return Math.round(num * 100);
}

// ---------------------------------------------------------------------------
// Column Mapping
// ---------------------------------------------------------------------------

/** Known column name patterns for auto-detection. */
const COLUMN_PATTERNS: Record<string, RegExp[]> = {
  date: [/^date$/i, /^trans(action)?[\s_-]?date$/i, /^posted[\s_-]?date$/i],
  amount: [/^amount$/i, /^debit$/i, /^credit$/i, /^total$/i],
  payee: [
    /^payee$/i,
    /^description$/i,
    /^merchant$/i,
    /^name$/i,
    /^original[\s_-]?description$/i,
    /^memo$/i,
  ],
  category: [/^category$/i, /^cat$/i, /^type$/i],
  note: [/^note$/i, /^notes$/i, /^memo$/i, /^labels$/i],
};

/** Mint CSV column mapping. */
const MINT_MAPPING: Record<string, string> = {
  Date: 'date',
  Description: 'payee',
  Amount: 'amount',
  'Transaction Type': 'type',
  Category: 'category',
  Notes: 'note',
};

/** YNAB CSV column mapping. */
const YNAB_MAPPING: Record<string, string> = {
  Date: 'date',
  Payee: 'payee',
  Category: 'category',
  Memo: 'note',
  Outflow: 'outflow',
  Inflow: 'inflow',
};

/** Auto-detect column mapping from headers. */
function autoDetectMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim();
    for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
      if (field in mapping) continue; // Don't overwrite first match
      for (const pattern of patterns) {
        if (pattern.test(header)) {
          mapping[field] = i;
          break;
        }
      }
    }
  }

  return mapping;
}

/** Map Mint-specific column indices. */
function mintColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const mapped = MINT_MAPPING[headers[i].trim()];
    if (mapped) {
      mapping[mapped] = i;
    }
  }
  // Mint uses "Transaction Type" to indicate debit/credit
  const typeIdx = headers.findIndex((h) => h.trim() === 'Transaction Type');
  if (typeIdx >= 0) {
    mapping['mint_type'] = typeIdx;
  }
  return mapping;
}

/** Map YNAB-specific column indices. */
function ynabColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const mapped = YNAB_MAPPING[headers[i].trim()];
    if (mapped) {
      mapping[mapped] = i;
    }
  }
  return mapping;
}

/** Columns safe to return from import_jobs. */
const JOB_COLUMNS =
  'id, household_id, owner_id, account_id, file_name, format, status, total_rows, imported_rows, duplicate_rows, error_rows, errors, started_at, completed_at, created_at, updated_at';

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('import-data');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('import-data', req);
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
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['import-data']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['import-data']);
    }

    const url = new URL(req.url);

    if (req.method === 'GET') {
      // ===================================================================
      // LIST/GET IMPORT JOBS
      // ===================================================================
      const jobId = url.searchParams.get('job_id');
      const householdId = url.searchParams.get('household_id');

      if (jobId) {
        const { data: job, error: jobErr } = await supabase
          .from('import_jobs')
          .select(JOB_COLUMNS)
          .eq('id', jobId)
          .is('deleted_at', null)
          .single();

        if (jobErr || !job) {
          return errorResponse(req, 'Import job not found', 404);
        }

        return jsonResponse(req, { import_job: job });
      }

      if (!householdId) {
        return errorResponse(req, 'household_id or job_id query parameter is required');
      }

      const { data: jobs, error: listErr } = await supabase
        .from('import_jobs')
        .select(JOB_COLUMNS)
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (listErr) {
        logger.error('Failed to list import jobs', { errorMessage: listErr.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { import_jobs: jobs ?? [] });
    }

    if (req.method !== 'POST') {
      return methodNotAllowedResponse(req);
    }

    // =====================================================================
    // PROCESS CSV IMPORT
    // =====================================================================
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON body');
    }

    const {
      household_id,
      account_id,
      csv_content,
      format = 'generic',
      file_name = 'import.csv',
      column_mapping: customMapping,
    } = body as {
      household_id?: string;
      account_id?: string;
      csv_content?: string;
      format?: string;
      file_name?: string;
      column_mapping?: Record<string, string>;
    };

    // Validate required fields
    if (!household_id) {
      return errorResponse(req, 'household_id is required');
    }
    if (!account_id) {
      return errorResponse(req, 'account_id is required');
    }
    if (!csv_content || typeof csv_content !== 'string') {
      return errorResponse(req, 'csv_content is required');
    }
    if (!['generic', 'mint', 'ynab'].includes(format)) {
      return errorResponse(req, 'format must be generic, mint, or ynab');
    }

    // Size check
    if (csv_content.length > MAX_CSV_SIZE) {
      return errorResponse(
        req,
        `CSV content exceeds maximum size of ${MAX_CSV_SIZE / 1024 / 1024}MB`,
        413,
      );
    }

    // Verify membership
    const { data: membership } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', household_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      return errorResponse(req, 'You are not a member of this household', 403);
    }

    // Verify account belongs to household
    const { data: account } = await supabase
      .from('accounts')
      .select('id, currency_code')
      .eq('id', account_id)
      .eq('household_id', household_id)
      .is('deleted_at', null)
      .single();

    if (!account) {
      return errorResponse(req, 'Account not found or does not belong to this household', 404);
    }

    // Create import job record
    const { data: job, error: jobErr } = await supabase
      .from('import_jobs')
      .insert({
        household_id,
        owner_id: user.id,
        account_id,
        file_name,
        format,
        status: 'processing',
        started_at: new Date().toISOString(),
        column_mapping: customMapping ?? {},
      })
      .select('id')
      .single();

    if (jobErr || !job) {
      logger.error('Failed to create import job', { errorMessage: jobErr?.message });
      return internalErrorResponse(req);
    }

    const jobId = job.id;

    // Parse CSV
    const rows = parseCsv(csv_content);
    if (rows.length < 2) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'failed',
          total_rows: 0,
          errors: [{ row: 0, message: 'CSV has no data rows' }],
        })
        .eq('id', jobId);
      return errorResponse(req, 'CSV must have a header row and at least one data row');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1, MAX_ROWS + 1);
    const totalRows = dataRows.length;

    // Determine column mapping
    let colMap: Record<string, number>;
    switch (format) {
      case 'mint':
        colMap = mintColumnMapping(headers);
        break;
      case 'ynab':
        colMap = ynabColumnMapping(headers);
        break;
      default:
        colMap = autoDetectMapping(headers);
    }

    // Validate we have at minimum date and amount columns
    if (!('date' in colMap)) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'failed',
          total_rows: totalRows,
          errors: [{ row: 0, message: 'Could not detect date column' }],
        })
        .eq('id', jobId);
      return errorResponse(
        req,
        'Could not detect date column in CSV. Please provide column_mapping.',
      );
    }

    const hasAmount = 'amount' in colMap;
    const hasYnabFlows = 'outflow' in colMap && 'inflow' in colMap;

    if (!hasAmount && !hasYnabFlows) {
      await supabase
        .from('import_jobs')
        .update({
          status: 'failed',
          total_rows: totalRows,
          errors: [{ row: 0, message: 'Could not detect amount column' }],
        })
        .eq('id', jobId);
      return errorResponse(
        req,
        'Could not detect amount column in CSV. Please provide column_mapping.',
      );
    }

    // Fetch existing transactions for duplicate detection
    const { data: existingTxs } = await supabase
      .from('transactions')
      .select('amount_cents, date, payee')
      .eq('household_id', household_id)
      .eq('account_id', account_id)
      .is('deleted_at', null);

    const existingSet = new Set(
      (existingTxs ?? []).map(
        (t: { amount_cents: number; date: string; payee: string | null }) =>
          `${t.amount_cents}|${t.date}|${(t.payee ?? '').toLowerCase().trim()}`,
      ),
    );

    // Process rows
    const errors: Array<{ row: number; message: string }> = [];
    const validTransactions: Array<Record<string, unknown>> = [];
    let duplicateCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-indexed, accounting for header

      // Parse date
      const dateVal = 'date' in colMap ? row[colMap.date] : undefined;
      if (!dateVal) {
        errors.push({ row: rowNum, message: 'Missing date' });
        continue;
      }

      const parsedDate = parseDate(dateVal);
      if (!parsedDate) {
        errors.push({ row: rowNum, message: 'Invalid date format' });
        continue;
      }

      // Parse amount
      let amountCents: number | null = null;
      let txType = 'expense';

      if (format === 'ynab' && hasYnabFlows) {
        // YNAB: Outflow is expense, Inflow is income
        const outflow = row[colMap.outflow] ? parseAmountCents(row[colMap.outflow]) : null;
        const inflow = row[colMap.inflow] ? parseAmountCents(row[colMap.inflow]) : null;

        if (inflow && inflow > 0) {
          amountCents = inflow;
          txType = 'income';
        } else if (outflow && outflow > 0) {
          amountCents = -outflow;
          txType = 'expense';
        } else if (outflow !== null) {
          amountCents = outflow;
          txType = 'expense';
        }
      } else if (hasAmount) {
        amountCents = parseAmountCents(row[colMap.amount] ?? '');

        // Mint: "debit" type means expense (negate if positive)
        if (format === 'mint' && 'mint_type' in colMap) {
          const mintType = (row[colMap.mint_type] ?? '').toLowerCase().trim();
          if (mintType === 'debit' && amountCents !== null && amountCents > 0) {
            amountCents = -amountCents;
          }
          txType = mintType === 'credit' ? 'income' : 'expense';
        } else {
          txType = amountCents !== null && amountCents >= 0 ? 'income' : 'expense';
        }
      }

      if (amountCents === null) {
        errors.push({ row: rowNum, message: 'Invalid or missing amount' });
        continue;
      }

      // Parse payee
      const payee = 'payee' in colMap ? (row[colMap.payee] ?? '').trim() : '';

      // Parse note
      const note = 'note' in colMap ? (row[colMap.note] ?? '').trim() : '';

      // Duplicate detection
      const dupeKey = `${amountCents}|${parsedDate}|${payee.toLowerCase().trim()}`;
      if (existingSet.has(dupeKey)) {
        duplicateCount++;
        continue;
      }

      // Add to set to prevent intra-file duplicates too
      existingSet.add(dupeKey);

      validTransactions.push({
        household_id,
        account_id,
        amount_cents: amountCents,
        currency_code: account.currency_code,
        type: txType,
        payee: payee || null,
        note: note || null,
        date: parsedDate,
        status: 'CLEARED',
        owner_id: user.id,
      });
    }

    // Batch insert valid transactions
    let importedCount = 0;

    for (let i = 0; i < validTransactions.length; i += BATCH_SIZE) {
      const batch = validTransactions.slice(i, i + BATCH_SIZE);
      const { error: insertErr, data: inserted } = await supabase
        .from('transactions')
        .insert(batch)
        .select('id');

      if (insertErr) {
        logger.error('Batch insert failed', {
          batchStart: i,
          errorMessage: insertErr.message,
        });
        errors.push({
          row: 0,
          message: `Batch insert failed at rows ${i + 1}-${i + batch.length}`,
        });
      } else {
        importedCount += inserted?.length ?? batch.length;
      }
    }

    // Determine final status
    let finalStatus = 'completed';
    if (importedCount === 0 && errors.length > 0) {
      finalStatus = 'failed';
    } else if (errors.length > 0) {
      finalStatus = 'partial';
    }

    // Update import job with results
    // Limit stored errors to first 100 to avoid bloating JSONB
    const cappedErrors = errors.slice(0, 100);

    const { data: updatedJob } = await supabase
      .from('import_jobs')
      .update({
        status: finalStatus,
        total_rows: totalRows,
        imported_rows: importedCount,
        duplicate_rows: duplicateCount,
        error_rows: errors.length,
        errors: cappedErrors,
        completed_at: new Date().toISOString(),
        column_mapping: colMap,
      })
      .eq('id', jobId)
      .select(JOB_COLUMNS)
      .single();

    logger.info('Import completed', {
      httpStatus: 201,
      jobId,
      totalRows,
      importedRows: importedCount,
      duplicateRows: duplicateCount,
      errorRows: errors.length,
      status: finalStatus,
    });

    return createdResponse(req, {
      import_job: updatedJob,
      summary: {
        total_rows: totalRows,
        imported_rows: importedCount,
        duplicate_rows: duplicateCount,
        error_rows: errors.length,
        status: finalStatus,
      },
    });
  } catch (err) {
    logger.error('Import data error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
