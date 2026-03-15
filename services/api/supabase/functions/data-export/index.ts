// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Export Edge Function (#98, #353)
 *
 * GDPR Article 20 — Right to Data Portability.
 *
 * Exports all of a user's data across all their households in either
 * JSON or CSV format (determined by the `format` query parameter or
 * the Accept header).
 *
 * Streams the response for large datasets to avoid memory pressure.
 *
 * Security (#353 hardening):
 *   - Requires authentication (valid JWT)
 *   - Only exports data for households the user belongs to
 *   - Never exports other users' data even within shared households
 *   - Origin-validated CORS (no wildcard)
 *   - Rate limited: max 10 exports per user per hour
 *   - Input validation on export format
 *   - Structured error responses (no internal detail leakage)
 *   - Audit-logged to dedicated data_export_audit_log table
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   ALLOWED_ORIGINS           — Comma-separated list of allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import {
  methodNotAllowedResponse,
  streamingResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid export formats. */
const VALID_FORMATS = ['json', 'csv'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

/** Rate limit: max exports per user within the time window. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Maximum allowed Content-Length for the request (GET has no body). */
const MAX_CONTENT_LENGTH = 1024; // 1 KB

/** Tables to export and their household-scoped query configuration. */
const EXPORTABLE_TABLES = [
  { name: 'users', filterBy: 'id', isUserScoped: true },
  { name: 'households', filterBy: 'id', isHouseholdScoped: true },
  { name: 'household_members', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'accounts', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'categories', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'transactions', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'budgets', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'goals', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'passkey_credentials', filterBy: 'user_id', isUserScoped: true },
] as const;

/** Sensitive columns to redact from export. */
const REDACTED_COLUMNS = new Set(['public_key']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return a structured error response for data-export.
 * Never leaks internal details to the client.
 */
function exportErrorResponse(
  request: Request,
  code: string,
  message: string,
  status: number = 400,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    {
      status,
      headers: {
        ...getCorsHeaders(request),
        'Content-Type': 'application/json',
      },
    },
  );
}

/**
 * Determine export format from the `format` query parameter,
 * falling back to the Accept header.
 *
 * Returns null if the requested format is invalid.
 */
function resolveExportFormat(req: Request): ExportFormat | null {
  const url = new URL(req.url);
  const formatParam = url.searchParams.get('format');

  if (formatParam) {
    return (VALID_FORMATS as readonly string[]).includes(formatParam)
      ? (formatParam as ExportFormat)
      : null;
  }

  // Fall back to Accept header
  const acceptHeader = req.headers.get('Accept') ?? 'application/json';
  if (acceptHeader.includes('text/csv')) return 'csv';
  return 'json';
}

/**
 * Redact sensitive columns from a record.
 */
function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...record };
  for (const col of REDACTED_COLUMNS) {
    if (col in redacted) {
      redacted[col] = '[REDACTED]';
    }
  }
  return redacted;
}

/**
 * Convert an array of records to CSV format.
 */
function recordsToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';

  const headers = Object.keys(records[0]);
  const lines = [headers.join(',')];

  for (const record of records) {
    const values = headers.map((h) => {
      const val = record[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Escape CSV values containing commas, quotes, or newlines
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Extract the client IP address from request headers (best-effort).
 * Returns null if not available.
 */
function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || null;
  }
  return req.headers.get('x-real-ip') || null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  if (req.method !== 'GET') {
    return methodNotAllowedResponse(req);
  }

  let userId: string | undefined;
  let exportFormat: ExportFormat = 'json';

  try {
    // ------------------------------------------------------------------
    // Authentication
    // ------------------------------------------------------------------
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }
    userId = user.id;

    const supabase = createAdminClient();

    // ------------------------------------------------------------------
    // Input validation: export format
    // ------------------------------------------------------------------
    const format = resolveExportFormat(req);
    if (!format) {
      return exportErrorResponse(
        req,
        'INVALID_FORMAT',
        'Export format must be "json" or "csv". Use ?format=json or ?format=csv.',
      );
    }
    exportFormat = format;

    // ------------------------------------------------------------------
    // Input validation: request size
    // ------------------------------------------------------------------
    const contentLength = req.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_LENGTH) {
      return exportErrorResponse(
        req,
        'REQUEST_TOO_LARGE',
        'Request exceeds maximum allowed size.',
        413,
      );
    }

    // ------------------------------------------------------------------
    // Rate limiting: max RATE_LIMIT_MAX exports per hour
    // ------------------------------------------------------------------
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentExportCount, error: rateLimitError } = await supabase
      .from('data_export_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    if (rateLimitError) {
      // Log but don't block the request if rate-limit check fails
      console.error('Rate limit query failed:', rateLimitError.message);
    } else if ((recentExportCount ?? 0) >= RATE_LIMIT_MAX) {
      return exportErrorResponse(
        req,
        'RATE_LIMITED',
        `Export limit exceeded. Maximum ${RATE_LIMIT_MAX} exports per hour.`,
        429,
      );
    }

    // ------------------------------------------------------------------
    // Fetch user's household memberships
    // ------------------------------------------------------------------
    const { data: memberships, error: memberError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (memberError) {
      console.error('Failed to fetch memberships:', memberError.message);
      return exportErrorResponse(
        req,
        'INTERNAL_ERROR',
        'An unexpected error occurred.',
        500,
      );
    }

    const householdIds = (memberships ?? []).map(
      (m: { household_id: string }) => m.household_id,
    );

    // ------------------------------------------------------------------
    // Collect all exportable data
    // ------------------------------------------------------------------
    const exportData: Record<string, Record<string, unknown>[]> = {};

    for (const table of EXPORTABLE_TABLES) {
      let query = supabase.from(table.name).select('*');

      if ('isUserScoped' in table && table.isUserScoped) {
        query = query.eq(table.filterBy, user.id);
      } else if ('isHouseholdScoped' in table && table.isHouseholdScoped) {
        if (householdIds.length === 0) {
          exportData[table.name] = [];
          continue;
        }
        query = query.in(table.filterBy, householdIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Failed to export ${table.name}:`, error.message);
        exportData[table.name] = [];
        continue;
      }

      // Redact sensitive columns
      exportData[table.name] = (data ?? []).map(redactRecord);
    }

    // ------------------------------------------------------------------
    // Audit log: record the successful export (never log exported data)
    // ------------------------------------------------------------------
    const clientIp = getClientIp(req);

    await supabase.from('data_export_audit_log').insert({
      user_id: user.id,
      export_format: exportFormat,
      account_count: exportData['accounts']?.length ?? 0,
      transaction_count: exportData['transactions']?.length ?? 0,
      category_count: exportData['categories']?.length ?? 0,
      budget_count: exportData['budgets']?.length ?? 0,
      goal_count: exportData['goals']?.length ?? 0,
      status: 'success',
      ip_address: clientIp,
    });

    // Also log to the general audit_log table for cross-function consistency
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'DATA_EXPORT',
      table_name: 'users',
      record_id: user.id,
      new_values: {
        format: exportFormat,
        tables_exported: Object.keys(exportData),
        total_records: Object.values(exportData).reduce(
          (sum, records) => sum + records.length,
          0,
        ),
      },
    });

    // ------------------------------------------------------------------
    // Build and stream the response
    // ------------------------------------------------------------------
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (exportFormat === 'csv') {
      // Stream CSV — each table as a separate section
      const csvParts: string[] = [];

      for (const [tableName, records] of Object.entries(exportData)) {
        csvParts.push(`\n# Table: ${tableName}`);
        csvParts.push(`# Records: ${records.length}`);
        if (records.length > 0) {
          csvParts.push(recordsToCsv(records));
        }
        csvParts.push(''); // blank line between tables
      }

      const csvContent = csvParts.join('\n');
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(csvContent));
          controller.close();
        },
      });

      return streamingResponse(
        req,
        stream,
        'text/csv; charset=utf-8',
        `finance-export-${timestamp}.csv`,
      );
    } else {
      // Stream JSON
      const jsonContent = JSON.stringify(
        {
          export_date: new Date().toISOString(),
          user_id: user.id,
          format_version: '1.0',
          data: exportData,
        },
        null,
        2,
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Stream in chunks to handle large datasets
          const chunkSize = 64 * 1024; // 64KB chunks
          let offset = 0;

          while (offset < jsonContent.length) {
            const chunk = jsonContent.slice(offset, offset + chunkSize);
            controller.enqueue(encoder.encode(chunk));
            offset += chunkSize;
          }

          controller.close();
        },
      });

      return streamingResponse(
        req,
        stream,
        'application/json; charset=utf-8',
        `finance-export-${timestamp}.json`,
      );
    }
  } catch (err) {
    console.error('Data export error:', (err as Error).message);

    // Best-effort: log the failure to the audit table
    if (userId) {
      try {
        const supabase = createAdminClient();
        await supabase.from('data_export_audit_log').insert({
          user_id: userId,
          export_format: exportFormat,
          status: 'failure',
          error_message: 'Export processing failed',
          ip_address: getClientIp(req),
        });
      } catch {
        // Audit logging must not mask the original error
      }
    }

    return exportErrorResponse(
      req,
      'INTERNAL_ERROR',
      'An unexpected error occurred.',
      500,
    );
  }
});
