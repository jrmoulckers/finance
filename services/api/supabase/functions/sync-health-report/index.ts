// SPDX-License-Identifier: BUSL-1.1

/**
 * Sync Health Report Edge Function (#610)
 *
 * Accepts sync health metrics from authenticated clients and inserts
 * them into the `sync_health_logs` table using the service role
 * (since RLS restricts INSERT to service_role only).
 *
 * Clients call this endpoint after each sync operation completes
 * (successfully or not) so that the server can monitor sync
 * performance, detect degradation, and alert on recurring failures.
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - POST only — no reads through this endpoint
 *   - Input validated and bounded (max lengths, allowed values)
 *   - error_message is sanitized to strip potential PII / financial data
 *   - NEVER logs actual error_message content (may contain sensitive info)
 *   - Rate limited: max 60 reports per user per hour
 *   - Origin-validated CORS (no wildcard)
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL (set automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (set automatically by Supabase)
 *   ALLOWED_ORIGINS           — Comma-separated list of allowed CORS origins
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  createdResponse,
  errorResponse,
  internalErrorResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid sync status values (must match the CHECK constraint on the table). */
const VALID_SYNC_STATUSES = ['success', 'failure', 'partial'] as const;
type SyncStatus = (typeof VALID_SYNC_STATUSES)[number];

/** Maximum device_id length. */
const MAX_DEVICE_ID_LENGTH = 255;

/** Maximum sync duration in milliseconds (1 hour). */
const MAX_SYNC_DURATION_MS = 3_600_000;

/** Maximum error_code length. */
const MAX_ERROR_CODE_LENGTH = 100;

/** Maximum error_message length (before sanitization). */
const MAX_ERROR_MESSAGE_LENGTH = 500;

/** Rate limit: max reports per user within the time window. */
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// PII / Financial Data Sanitisation
// ---------------------------------------------------------------------------

/**
 * Patterns that may indicate PII or financial data in error messages.
 *
 * We replace matches with a generic placeholder so that nothing
 * sensitive is persisted to the database. This list is intentionally
 * broad — false positives are acceptable because the error_code
 * field carries the machine-readable signal.
 */
const PII_PATTERNS: readonly RegExp[] = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Phone numbers (various formats)
  /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
  // Credit card / account numbers (sequences of 12-19 digits, with optional separators)
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{0,7}\b/g,
  // SSN-like patterns (US)
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Monetary amounts ($1,234.56 or €1.234,56 etc.)
  /[$€£¥]\s?\d[\d,.\s]*\d/g,
  // IP addresses
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  // UUIDs (may reference specific user/record IDs)
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // JWT-like tokens (three base64 segments separated by dots)
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

/**
 * Sanitise an error message by removing potential PII and financial data.
 *
 * Returns a truncated, scrubbed string safe for database persistence.
 * The original content is NEVER logged or returned to the client.
 */
function sanitizeErrorMessage(raw: string): string {
  let sanitized = raw;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  // Truncate to maximum allowed length after sanitisation
  return sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

interface SyncHealthReport {
  device_id: string;
  sync_duration_ms: number;
  record_count: number;
  error_code?: string;
  error_message?: string;
  sync_status: SyncStatus;
}

/**
 * Validate the request body and return a typed report or an error message.
 */
function validateBody(body: unknown): { report: SyncHealthReport } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  // device_id — required string, max length, no obvious PII
  if (typeof b.device_id !== 'string' || b.device_id.length === 0) {
    return { error: 'device_id is required and must be a non-empty string' };
  }
  if (b.device_id.length > MAX_DEVICE_ID_LENGTH) {
    return { error: `device_id must be at most ${MAX_DEVICE_ID_LENGTH} characters` };
  }

  // sync_duration_ms — required integer >= 0, max MAX_SYNC_DURATION_MS
  if (typeof b.sync_duration_ms !== 'number' || !Number.isInteger(b.sync_duration_ms)) {
    return { error: 'sync_duration_ms is required and must be an integer' };
  }
  if (b.sync_duration_ms < 0) {
    return { error: 'sync_duration_ms must be >= 0' };
  }
  if (b.sync_duration_ms > MAX_SYNC_DURATION_MS) {
    return { error: `sync_duration_ms must be at most ${MAX_SYNC_DURATION_MS}` };
  }

  // record_count — required integer >= 0
  if (typeof b.record_count !== 'number' || !Number.isInteger(b.record_count)) {
    return { error: 'record_count is required and must be an integer' };
  }
  if (b.record_count < 0) {
    return { error: 'record_count must be >= 0' };
  }

  // sync_status — required, must be one of VALID_SYNC_STATUSES
  if (typeof b.sync_status !== 'string') {
    return { error: 'sync_status is required and must be a string' };
  }
  if (!(VALID_SYNC_STATUSES as readonly string[]).includes(b.sync_status)) {
    return { error: `sync_status must be one of: ${VALID_SYNC_STATUSES.join(', ')}` };
  }

  // error_code — optional string, max length
  if (b.error_code !== undefined && b.error_code !== null) {
    if (typeof b.error_code !== 'string') {
      return { error: 'error_code must be a string' };
    }
    if (b.error_code.length > MAX_ERROR_CODE_LENGTH) {
      return { error: `error_code must be at most ${MAX_ERROR_CODE_LENGTH} characters` };
    }
  }

  // error_message — optional string, max length (will be sanitised)
  if (b.error_message !== undefined && b.error_message !== null) {
    if (typeof b.error_message !== 'string') {
      return { error: 'error_message must be a string' };
    }
    if (b.error_message.length > MAX_ERROR_MESSAGE_LENGTH) {
      return { error: `error_message must be at most ${MAX_ERROR_MESSAGE_LENGTH} characters` };
    }
  }

  return {
    report: {
      device_id: b.device_id,
      sync_duration_ms: b.sync_duration_ms,
      record_count: b.record_count,
      sync_status: b.sync_status as SyncStatus,
      ...(b.error_code ? { error_code: b.error_code as string } : {}),
      ...(b.error_message ? { error_message: b.error_message as string } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('sync-health-report');
  logger.info('Request received', { method: req.method });

  // POST only
  if (req.method !== 'POST') {
    return methodNotAllowedResponse(req);
  }

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

    logger.setUserId(user.id);

    const supabase = createAdminClient();

    // ------------------------------------------------------------------
    // Parse and validate request body
    // ------------------------------------------------------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(req, 'Invalid JSON in request body', 400);
    }

    const validation = validateBody(body);
    if ('error' in validation) {
      logger.warn('Validation failed', { validationError: validation.error });
      return errorResponse(req, validation.error, 400);
    }

    const { report } = validation;

    // ------------------------------------------------------------------
    // Rate limiting: max RATE_LIMIT_MAX reports per hour
    // ------------------------------------------------------------------
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentReportCount, error: rateLimitError } = await supabase
      .from('sync_health_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    if (rateLimitError) {
      // Log but don't block the request if rate-limit check fails
      logger.error('Rate limit query failed', { errorMessage: rateLimitError.message });
    } else if ((recentReportCount ?? 0) >= RATE_LIMIT_MAX) {
      logger.warn('Rate limit exceeded', {
        recentReportCount: recentReportCount ?? 0,
        limit: RATE_LIMIT_MAX,
      });
      return errorResponse(
        req,
        `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX} reports per hour.`,
        429,
      );
    }

    // ------------------------------------------------------------------
    // Sanitise error_message (NEVER store unsanitised client messages)
    // ------------------------------------------------------------------
    const sanitizedErrorMessage = report.error_message
      ? sanitizeErrorMessage(report.error_message)
      : null;

    // ------------------------------------------------------------------
    // Insert using service role (bypasses RLS INSERT restriction)
    // ------------------------------------------------------------------
    const { data: inserted, error: insertError } = await supabase
      .from('sync_health_logs')
      .insert({
        user_id: user.id,
        device_id: report.device_id,
        sync_duration_ms: report.sync_duration_ms,
        record_count: report.record_count,
        error_code: report.error_code ?? null,
        error_message: sanitizedErrorMessage,
        sync_status: report.sync_status,
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      logger.error('Failed to insert sync health log', {
        errorMessage: insertError.message,
      });
      return internalErrorResponse(req);
    }

    // ------------------------------------------------------------------
    // Log sanitised metadata only — NEVER log error_message content
    // ------------------------------------------------------------------
    logger.info('Sync health report recorded', {
      httpStatus: 201,
      syncStatus: report.sync_status,
      syncDurationMs: report.sync_duration_ms,
      recordCount: report.record_count,
      hasErrorCode: !!report.error_code,
      logId: inserted.id,
    });

    return createdResponse(req, {
      id: inserted.id,
      created_at: inserted.created_at,
    });
  } catch (err) {
    logger.error('Sync health report error', {
      errorMessage: (err as Error).message,
    });
    return internalErrorResponse(req);
  }
});
