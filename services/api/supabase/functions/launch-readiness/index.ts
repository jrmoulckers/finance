// SPDX-License-Identifier: BUSL-1.1

/**
 * Launch Readiness Dashboard Edge Function (#894)
 *
 * Admin-only endpoint that returns a comprehensive system health
 * report for launch readiness assessment. Aggregates RLS coverage,
 * schema integrity, sync health, and database statistics.
 *
 * Endpoints:
 *   GET ?action=readiness  — Full launch readiness report
 *   GET ?action=checks     — Individual check results only
 *   GET ?action=refresh    — Force refresh of materialized view
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Requires admin privilege (user email in ADMIN_EMAILS env var)
 *   - All queries use the admin client (service_role)
 *   - NEVER returns raw financial data, user emails, or PII
 *   - Rate limited: 30 requests per admin per minute
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
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DashboardAction = 'readiness' | 'checks' | 'refresh';

const VALID_ACTIONS: readonly DashboardAction[] = ['readiness', 'checks', 'refresh'];

// ---------------------------------------------------------------------------
// Admin verification
// ---------------------------------------------------------------------------

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
 * GET ?action=readiness — Full launch readiness report.
 *
 * Calls the get_launch_readiness() RPC which returns a comprehensive
 * JSONB report with pass/fail checks and aggregate statistics.
 * NEVER returns PII or financial data.
 */
async function getReadinessReport(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
): Promise<Response> {
  const { data, error } = await supabase.rpc('get_launch_readiness');

  if (error) {
    return internalErrorResponse(request);
  }

  return jsonResponse(request, { readiness: data });
}

/**
 * GET ?action=checks — Individual check results.
 *
 * Returns just the checks array from the readiness report,
 * useful for monitoring dashboards that only need pass/fail status.
 */
async function getChecksOnly(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
): Promise<Response> {
  const { data, error } = await supabase.rpc('get_launch_readiness');

  if (error) {
    return internalErrorResponse(request);
  }

  const report = data as { status: string; checks: unknown[]; generated_at: string };

  return jsonResponse(request, {
    status: report.status,
    checks: report.checks,
    generated_at: report.generated_at,
  });
}

/**
 * GET ?action=refresh — Force refresh of the materialized view.
 *
 * Triggers a concurrent refresh of launch_readiness_checks and
 * returns confirmation with the new snapshot timestamp.
 */
async function refreshDashboard(
  supabase: ReturnType<typeof createAdminClient>,
  request: Request,
): Promise<Response> {
  const { error } = await supabase.rpc('refresh_launch_readiness');

  if (error) {
    return internalErrorResponse(request);
  }

  return jsonResponse(request, {
    refreshed: true,
    refreshed_at: new Date().toISOString(),
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

  const logger = createLogger('launch-readiness');
  logger.info('Request received', { method: req.method });

  // GET only — read-only dashboard
  if (req.method !== 'GET') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return methodNotAllowedResponse(req);
  }

  try {
    // ------------------------------------------------------------------
    // Environment validation
    // ------------------------------------------------------------------
    const envError = validateEnv('launch-readiness', req);
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
    // Rate limiting (user-based, 30 req/min)
    // ------------------------------------------------------------------
    const supabase = createAdminClient();
    const rateLimitConfig = RATE_LIMITS['launch-readiness'];
    const rateLimitResult = await checkRateLimit(supabase, user.id, rateLimitConfig);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, rateLimitConfig);
    }

    // ------------------------------------------------------------------
    // Route by ?action= query parameter
    // ------------------------------------------------------------------
    const url = new URL(req.url);
    const action = (url.searchParams.get('action') ?? 'readiness') as DashboardAction;

    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return errorResponse(req, `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400);
    }

    logger.info('Processing launch readiness action', { action });

    switch (action) {
      case 'readiness':
        return await getReadinessReport(supabase, req);
      case 'checks':
        return await getChecksOnly(supabase, req);
      case 'refresh':
        return await refreshDashboard(supabase, req);
      default:
        return errorResponse(req, 'Invalid action', 400);
    }
  } catch (err) {
    logger.error('Launch readiness error', {
      errorType: (err as Error).name,
      errorMessage: (err as Error).message,
    });
    return internalErrorResponse(req);
  }
});
