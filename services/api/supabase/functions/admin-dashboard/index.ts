// SPDX-License-Identifier: BUSL-1.1

/**
 * Admin Dashboard Edge Function (#684)
 *
 * Read-only administrative endpoint that exposes system metrics, user
 * statistics, audit log queries, and sync health diagnostics.
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Requires admin privilege (user email in ADMIN_EMAILS env var)
 *   - All queries use the admin client (service_role) to bypass RLS
 *   - NEVER returns raw financial data (amounts, balances, etc.)
 *   - NEVER returns user emails — only user IDs and aggregate counts
 *   - Rate limited: 60 requests per admin per minute
 *   - Origin-validated CORS (no wildcard)
 *   - Read-only — no mutations through this endpoint
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL (set automatically by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (set automatically by Supabase)
 *   ADMIN_EMAILS              — Comma-separated list of admin email addresses
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient, requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '../_shared/rate-limit.ts';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid action query parameter values. */
type DashboardAction = 'overview' | 'audit' | 'sync-health' | 'rate-limits';

const VALID_ACTIONS: readonly DashboardAction[] = [
  'overview',
  'audit',
  'sync-health',
  'rate-limits',
];

/** Default and maximum pagination limits. */
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const DEFAULT_SYNC_LIMIT = 100;
const MAX_SYNC_LIMIT = 500;

// ---------------------------------------------------------------------------
// Admin verification
// ---------------------------------------------------------------------------

/**
 * Check whether the authenticated user is an admin.
 *
 * Compares the user's email against the ADMIN_EMAILS environment
 * variable (comma-separated list). Matching is case-insensitive.
 *
 * @returns true if the user is an admin, false otherwise.
 */
function isAdmin(userEmail: string): boolean {
  const adminEmailsRaw = Deno.env.get('ADMIN_EMAILS') ?? '';
  if (!adminEmailsRaw.trim()) return false;

  const adminEmails = adminEmailsRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(userEmail.toLowerCase());
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * GET ?action=overview — System overview metrics.
 *
 * Aggregates counts across core tables and sync/rate-limit metadata.
 * All queries use the service_role client to bypass RLS.
 * NEVER returns raw financial data or user-identifiable information.
 */
async function getOverviewMetrics(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
): Promise<Response> {
  // Run all aggregate queries concurrently for performance
  const [
    usersResult,
    activeUsersResult,
    householdsResult,
    transactionsResult,
    accountsResult,
    syncHealthResult,
    rateLimitsResult,
  ] = await Promise.all([
    // Total user count
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true }),

    // Active users (distinct users with sync activity in last 7 days)
    supabase
      .from('sync_health_logs')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Total active households
    supabase
      .from('households')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),

    // Total active transactions
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),

    // Total active accounts
    supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),

    // Sync health summary (last 24 hours)
    supabase
      .from('sync_health_logs')
      .select('sync_duration_ms')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

    // Active rate limit entries (recent window)
    supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .gte('window_start', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
  ]);

  // Compute sync health aggregates from returned rows
  let avgDurationMs = 0;
  let maxDurationMs = 0;
  let reports24h = 0;

  if (!syncHealthResult.error && syncHealthResult.data) {
    const logs = syncHealthResult.data as { sync_duration_ms: number }[];
    reports24h = logs.length;
    if (reports24h > 0) {
      const durations = logs.map((l) => l.sync_duration_ms);
      maxDurationMs = Math.max(...durations);
      avgDurationMs = Math.round(
        durations.reduce((sum, d) => sum + d, 0) / reports24h,
      );
    }
  }

  return jsonResponse(request, {
    overview: {
      users: {
        total: usersResult.count ?? 0,
        active_7d: activeUsersResult.count ?? 0,
      },
      households: {
        total: householdsResult.count ?? 0,
      },
      transactions: {
        total: transactionsResult.count ?? 0,
      },
      accounts: {
        total: accountsResult.count ?? 0,
      },
      sync_health: {
        avg_duration_ms: avgDurationMs,
        max_duration_ms: maxDurationMs,
        reports_24h: reports24h,
      },
      rate_limits: {
        active_entries: rateLimitsResult.count ?? 0,
      },
      generated_at: new Date().toISOString(),
    },
  });
}

/**
 * GET ?action=audit — Paginated audit log query.
 *
 * Supports filtering by user_id, action type, and date range.
 * NEVER includes user emails or raw financial data (old_values/new_values
 * are stripped). Returns only IDs, action types, table references, and
 * timestamps.
 */
async function getAuditLogs(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
  url: URL,
): Promise<Response> {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, parseInt(url.searchParams.get('per_page') ?? String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE),
  );
  const userId = url.searchParams.get('user_id');
  const actionFilter = url.searchParams.get('action_filter');
  const since = url.searchParams.get('since');
  const until = url.searchParams.get('until');

  // Build query — select only non-sensitive columns
  let query = supabase
    .from('audit_log')
    .select('id, user_id, action, table_name, record_id, household_id, created_at', {
      count: 'exact',
    });

  // Apply optional filters
  if (userId) {
    query = query.eq('user_id', userId);
  }
  if (actionFilter) {
    query = query.eq('action', actionFilter);
  }
  if (since) {
    query = query.gte('created_at', since);
  }
  if (until) {
    query = query.lte('created_at', until);
  }

  // Pagination and ordering
  const offset = (page - 1) * perPage;
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  const { data, error, count } = await query;

  if (error) {
    return internalErrorResponse(request);
  }

  const total = count ?? 0;

  return jsonResponse(request, {
    audit_entries: data ?? [],
    pagination: {
      page,
      per_page: perPage,
      total,
      has_more: offset + perPage < total,
    },
  });
}

/**
 * GET ?action=sync-health — Sync health log details.
 *
 * Returns sync health logs with optional user_id filtering and
 * configurable limit. Includes summary statistics.
 * NEVER returns error_message content (may contain PII).
 */
async function getSyncHealthLogs(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
  url: URL,
): Promise<Response> {
  const userId = url.searchParams.get('user_id');
  const since = url.searchParams.get('since');
  const limit = Math.min(
    MAX_SYNC_LIMIT,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_SYNC_LIMIT), 10) || DEFAULT_SYNC_LIMIT),
  );

  // Query for logs — omit error_message (may contain PII)
  let query = supabase
    .from('sync_health_logs')
    .select('id, user_id, device_id, sync_duration_ms, record_count, error_code, sync_status, created_at');

  if (userId) {
    query = query.eq('user_id', userId);
  }
  if (since) {
    query = query.gte('created_at', since);
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data, error } = await query;

  if (error) {
    return internalErrorResponse(request);
  }

  const logs = (data ?? []) as {
    id: string;
    user_id: string;
    device_id: string;
    sync_duration_ms: number;
    record_count: number;
    error_code: string | null;
    sync_status: string;
    created_at: string;
  }[];

  // Compute summary statistics
  const total = logs.length;
  let avgDuration = 0;
  let errorCount = 0;

  if (total > 0) {
    const durations = logs.map((l) => l.sync_duration_ms);
    avgDuration = Math.round(durations.reduce((sum, d) => sum + d, 0) / total);
    errorCount = logs.filter((l) => l.sync_status === 'failure').length;
  }

  return jsonResponse(request, {
    logs,
    summary: {
      avg_duration: avgDuration,
      error_rate: total > 0 ? parseFloat((errorCount / total).toFixed(4)) : 0,
      total,
    },
  });
}

/**
 * GET ?action=rate-limits — Active rate limit entries.
 *
 * Returns all rate limit entries with active (non-expired) windows.
 * The key column is returned for admin diagnostics but NEVER contains
 * user emails or raw financial data (it stores function:identifier pairs).
 */
async function getRateLimitEntries(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
): Promise<Response> {
  // Fetch entries whose window_start is recent (within last hour)
  // The actual expiry depends on the per-function window, but we
  // retrieve anything from the last hour and let the admin interpret.
  const { data, error, count } = await supabase
    .from('rate_limits')
    .select('id, key, window_start, request_count', { count: 'exact' })
    .gte('window_start', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('window_start', { ascending: false });

  if (error) {
    return internalErrorResponse(request);
  }

  return jsonResponse(request, {
    entries: data ?? [],
    total: count ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('admin-dashboard');
  logger.info('Request received', { method: req.method });

  // GET only — this is a read-only dashboard
  if (req.method !== 'GET') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return methodNotAllowedResponse(req);
  }

  try {
    // ------------------------------------------------------------------
    // Environment validation
    // ------------------------------------------------------------------
    const envError = validateEnv('admin-dashboard', req);
    if (envError) return envError;

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

    // ------------------------------------------------------------------
    // Admin authorization
    // ------------------------------------------------------------------
    if (!isAdmin(user.email)) {
      logger.warn('Admin access denied', { httpStatus: 403 });
      return errorResponse(req, 'Forbidden: admin access required', 403);
    }

    // ------------------------------------------------------------------
    // Rate limiting (user-based, 60 req/min)
    // ------------------------------------------------------------------
    const supabase = createAdminClient();
    const rateLimitConfig = RATE_LIMITS['admin-dashboard'];
    const rateLimitResult = await checkRateLimit(supabase, user.id, rateLimitConfig);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, rateLimitConfig);
    }

    // ------------------------------------------------------------------
    // Route by ?action= query parameter
    // ------------------------------------------------------------------
    const url = new URL(req.url);
    const action = url.searchParams.get('action') as DashboardAction | null;

    if (!action || !(VALID_ACTIONS as readonly string[]).includes(action)) {
      return errorResponse(
        req,
        `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        400,
      );
    }

    logger.info('Processing admin action', { action });

    switch (action) {
      case 'overview':
        return await getOverviewMetrics(supabase, req);
      case 'audit':
        return await getAuditLogs(supabase, req, url);
      case 'sync-health':
        return await getSyncHealthLogs(supabase, req, url);
      case 'rate-limits':
        return await getRateLimitEntries(supabase, req);
      default:
        return errorResponse(req, 'Invalid action', 400);
    }
  } catch (err) {
    logger.error('Admin dashboard error', {
      errorType: (err as Error).name,
      errorMessage: (err as Error).message,
    });
    return internalErrorResponse(req);
  }
});
