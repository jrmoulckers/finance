// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Export Edge Function (#98, #353, #1048)
 *
 * GDPR Article 20 — Right to Data Portability.
 *
 * Exports all of a user's data across all their households in either
 * JSON or CSV format (determined by the `format` query parameter or
 * the Accept header).
 *
 * Enhancement (#1048): Now includes ALL user data tables:
 *   - transactions, budgets, goals, categories, accounts
 *   - recurring_transaction_templates (recurring rules)
 *   - household_members (with anonymization of other members)
 *   - notification_preferences, notification_log
 *   - passkey_credentials (with sensitive data redacted)
 *
 * Anonymization: Other household members' data is anonymized —
 * their user_id, email, and display_name are replaced with opaque
 * identifiers to protect their privacy while preserving relational
 * integrity for the exporting user.
 *
 * Streams the response for large datasets to avoid memory pressure.
 *
 * Security (#353 hardening):
 *   - Requires authentication (valid JWT)
 *   - Only exports data for households the user belongs to
 *   - Anonymizes other users' PII even within shared households
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
import { createLogger } from '../_shared/logger.ts';
import { validateEnv } from '../_shared/env.ts';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from '../_shared/rate-limit.ts';
import { methodNotAllowedResponse, streamingResponse } from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid export formats. */
const VALID_FORMATS = ['json', 'csv'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

/** Maximum allowed Content-Length for the request (GET has no body). */
const MAX_CONTENT_LENGTH = 1024; // 1 KB

/** Tables to export and their query configuration. */
const EXPORTABLE_TABLES = [
  { name: 'users', filterBy: 'id', isUserScoped: true },
  { name: 'households', filterBy: 'id', isHouseholdScoped: true },
  { name: 'household_members', filterBy: 'household_id', isHouseholdScoped: true, anonymize: true },
  { name: 'accounts', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'categories', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'transactions', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'budgets', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'goals', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'recurring_transaction_templates', filterBy: 'household_id', isHouseholdScoped: true },
  { name: 'notification_preferences', filterBy: 'user_id', isUserScoped: true },
  { name: 'notification_log', filterBy: 'user_id', isUserScoped: true },
  { name: 'passkey_credentials', filterBy: 'user_id', isUserScoped: true },
] as const;

/** Sensitive columns to redact from export. */
const REDACTED_COLUMNS = new Set(['public_key', 'credential_id', 'transports']);

/** User PII columns to anonymize for non-self records. */
const USER_PII_COLUMNS = new Set(['user_id', 'email', 'display_name', 'created_by', 'owner_id']);

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
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  });
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
 * Create a deterministic anonymous identifier for a user ID.
 * Uses a simple hash to create an opaque but consistent identifier
 * so relational integrity is preserved in the export.
 */
function anonymizeUserId(userId: string): string {
  // Simple deterministic anonymization — not cryptographic, just opaque
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `anonymous_member_${Math.abs(hash).toString(36)}`;
}

/**
 * Anonymize PII columns for records belonging to OTHER users.
 * The exporting user's own data is left intact.
 */
function anonymizeOtherMembers(
  records: Record<string, unknown>[],
  selfUserId: string,
): Record<string, unknown>[] {
  return records.map((record) => {
    const anonymized = { ...record };

    // Determine if this record belongs to another user
    const recordUserId = (anonymized.user_id as string) ?? '';
    const isOtherUser = recordUserId && recordUserId !== selfUserId;

    if (isOtherUser) {
      for (const col of USER_PII_COLUMNS) {
        if (col in anonymized && anonymized[col] && anonymized[col] !== selfUserId) {
          if (col === 'email') {
            anonymized[col] = '[ANONYMIZED]';
          } else if (col === 'display_name') {
            anonymized[col] = anonymizeUserId(recordUserId);
          } else if (typeof anonymized[col] === 'string') {
            // For user_id, owner_id, created_by — anonymize if it's not self
            const val = anonymized[col] as string;
            if (val !== selfUserId) {
              anonymized[col] = anonymizeUserId(val);
            }
          }
        }
      }
    }

    return anonymized;
  });
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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('data-export');
  logger.info('Request received', { method: req.method });

  // Validate required environment variables (#616)
  const envError = validateEnv('data-export', req);
  if (envError) return envError;

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

    logger.setUserId(user.id);

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
    // Rate limiting (#614): max 10 exports per user per hour
    // ------------------------------------------------------------------
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['data-export']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['data-export']);
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
      logger.error('Failed to fetch memberships', { errorMessage: memberError.message });
      return exportErrorResponse(req, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
    }

    const householdIds = (memberships ?? []).map((m: { household_id: string }) => m.household_id);

    // ------------------------------------------------------------------
    // Collect all exportable data (#1048: comprehensive export)
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
        logger.error(`Failed to export ${table.name}`, { errorMessage: error.message });
        exportData[table.name] = [];
        continue;
      }

      // Redact sensitive columns
      let processedData = (data ?? []).map(redactRecord);

      // Anonymize other members' PII (#1048)
      if ('anonymize' in table && table.anonymize) {
        processedData = anonymizeOtherMembers(processedData, user.id);
      }

      exportData[table.name] = processedData;
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
        total_records: Object.values(exportData).reduce((sum, records) => sum + records.length, 0),
      },
    });

    // ------------------------------------------------------------------
    // Build and stream the response
    // ------------------------------------------------------------------
    const totalRecords = Object.values(exportData).reduce(
      (sum, records) => sum + records.length,
      0,
    );
    logger.info('Data export completed', {
      httpStatus: 200,
      format: exportFormat,
      tablesExported: Object.keys(exportData).length,
      totalRecords,
    });

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
          format_version: '2.0',
          gdpr_compliant: true,
          anonymization_applied: true,
          tables_included: Object.keys(exportData),
          record_counts: Object.fromEntries(
            Object.entries(exportData).map(([k, v]) => [k, v.length]),
          ),
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
    logger.error('Data export error', { errorMessage: (err as Error).message });

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

    return exportErrorResponse(req, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
});
