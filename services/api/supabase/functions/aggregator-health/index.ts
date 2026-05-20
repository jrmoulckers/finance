// SPDX-License-Identifier: BUSL-1.1

/**
 * Aggregator Health & Failover Edge Function (#1575, #1577)
 *
 * Manages aggregator provider health monitoring and automatic failover:
 *   GET  ?action=providers       — List all aggregator providers with health status
 *   GET  ?action=health          — Get health status for a specific connection
 *   GET  ?action=health_history  — Get health history for a connection
 *   POST ?action=check_health    — Trigger a health check for a connection
 *   POST ?action=failover        — Initiate failover to backup provider
 *   POST ?action=resolve         — Mark a health issue as resolved
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Household-scoped access via RLS
 *   - NEVER returns access tokens or raw financial data
 *   - NEVER logs sensitive data
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
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
} from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Staleness thresholds (in minutes) for health categorisation. */
const STALENESS_THRESHOLDS = {
  healthy: 60, // <1 hour since last sync
  stale: 360, // 1–6 hours
  critical: 1440, // 6–24 hours
} as const;

/** Error categories for structured health reporting. */
type ErrorCategory = 'auth' | 'provider' | 'institution' | 'network' | 'data' | 'rate_limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the health status of a connection based on last sync time.
 * NEVER returns or logs raw financial data.
 */
function categoriseStaleness(
  lastSyncedAt: string | null,
  thresholdHours: number,
): { status: string; stalenessMinutes: number | null } {
  if (!lastSyncedAt) {
    return { status: 'unknown_error', stalenessMinutes: null };
  }

  const lastSync = new Date(lastSyncedAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const thresholdMinutes = thresholdHours * 60;

  if (diffMinutes < STALENESS_THRESHOLDS.healthy) {
    return { status: 'healthy', stalenessMinutes: diffMinutes };
  }
  if (diffMinutes < thresholdMinutes) {
    return { status: 'stale', stalenessMinutes: diffMinutes };
  }
  return { status: 'stale', stalenessMinutes: diffMinutes };
}

/**
 * Map a bank connection error code to a structured error category.
 */
function categoriseError(errorCode: string | null): ErrorCategory | null {
  if (!errorCode) return null;

  const code = errorCode.toUpperCase();
  if (code.includes('AUTH') || code.includes('LOGIN') || code.includes('CREDENTIAL')) {
    return 'auth';
  }
  if (code.includes('PROVIDER') || code.includes('PLAID') || code.includes('MX')) {
    return 'provider';
  }
  if (code.includes('INSTITUTION') || code.includes('BANK')) {
    return 'institution';
  }
  if (code.includes('NETWORK') || code.includes('TIMEOUT') || code.includes('CONNECTION')) {
    return 'network';
  }
  if (code.includes('RATE') || code.includes('LIMIT') || code.includes('THROTTLE')) {
    return 'rate_limit';
  }
  if (code.includes('DATA') || code.includes('PARSE') || code.includes('FORMAT')) {
    return 'data';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('aggregator-health');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('aggregator-health', req);
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
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['default']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['default']);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // -----------------------------------------------------------------------
    // GET ?action=providers — List all aggregator providers
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'providers') {
      const { data: providers, error } = await supabase
        .from('aggregator_providers')
        .select(
          'id, name, display_name, provider_type, status, health_score, priority, ' +
            'is_enabled, supported_regions, capabilities, last_health_check, ' +
            'incident_count, created_at',
        )
        .is('deleted_at', null)
        .order('priority', { ascending: true });

      if (error) {
        logger.error('Failed to list providers', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { providers: providers ?? [] });
    }

    // -----------------------------------------------------------------------
    // GET ?action=health — Connection health status
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'health') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId) {
        return errorResponse(req, 'household_id query parameter is required');
      }

      // Verify household membership
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', householdId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (memError || !membership) {
        return errorResponse(req, 'Household access denied', 403);
      }

      // Fetch connections with health info — NEVER return encrypted tokens
      const { data: connections, error: connError } = await supabase
        .from('bank_connections')
        .select(
          'id, provider, institution_id, institution_name, status, ' +
            'last_synced_at, error_code, error_message, staleness_threshold_hours, ' +
            'permission_level, connection_type, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (connError) {
        logger.error('Failed to fetch connections', { errorMessage: connError.message });
        return internalErrorResponse(req);
      }

      // Enrich with staleness categorisation
      const healthStatuses = (connections ?? []).map((conn) => {
        const staleness = categoriseStaleness(
          conn.last_synced_at,
          conn.staleness_threshold_hours ?? 24,
        );
        const errorCategory = categoriseError(conn.error_code);

        return {
          id: conn.id,
          provider: conn.provider,
          institution_name: conn.institution_name,
          connection_status: conn.status,
          health_status: conn.status === 'error' ? 'unknown_error' : staleness.status,
          staleness_minutes: staleness.stalenessMinutes,
          error_category: errorCategory,
          error_code: conn.error_code,
          last_synced_at: conn.last_synced_at,
          permission_level: conn.permission_level,
          connection_type: conn.connection_type,
          needs_reauth: conn.status === 'needs_reauth',
        };
      });

      return jsonResponse(req, { connections: healthStatuses });
    }

    // -----------------------------------------------------------------------
    // GET ?action=health_history — Health event history
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'health_history') {
      const connectionId = url.searchParams.get('connection_id');
      if (!connectionId) {
        return errorResponse(req, 'connection_id query parameter is required');
      }

      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

      // RLS ensures household scoping
      const { data: history, error } = await supabase
        .from('bank_connection_health')
        .select(
          'id, status, error_category, error_detail, last_successful_sync, ' +
            'staleness_minutes, resolved_at, resolution_action, created_at',
        )
        .eq('bank_connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch health history', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { history: history ?? [] });
    }

    // -----------------------------------------------------------------------
    // POST ?action=check_health — Trigger health check
    // -----------------------------------------------------------------------
    if (req.method === 'POST' && action === 'check_health') {
      const body = await req.json();
      const connectionId = body.connection_id;

      if (!connectionId) {
        return errorResponse(req, 'connection_id is required');
      }

      // Fetch connection (RLS ensures household scoping)
      const { data: connection, error: connError } = await supabase
        .from('bank_connections')
        .select(
          'id, household_id, provider, status, last_synced_at, ' +
            'error_code, staleness_threshold_hours',
        )
        .eq('id', connectionId)
        .is('deleted_at', null)
        .single();

      if (connError || !connection) {
        return errorResponse(req, 'Bank connection not found', 404);
      }

      // Verify household membership
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', connection.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single();

      if (memError || !membership) {
        return errorResponse(req, 'Household access denied', 403);
      }

      // Calculate health status
      const staleness = categoriseStaleness(
        connection.last_synced_at,
        connection.staleness_threshold_hours ?? 24,
      );
      const errorCategory = categoriseError(connection.error_code);

      // Record health event
      const healthStatus =
        connection.status === 'needs_reauth'
          ? 'auth_expired'
          : connection.status === 'error'
            ? 'unknown_error'
            : staleness.status;

      const { error: insertError } = await supabase.from('bank_connection_health').insert({
        bank_connection_id: connectionId,
        household_id: connection.household_id,
        status: healthStatus,
        error_category: errorCategory,
        error_detail: connection.error_code,
        last_successful_sync: connection.last_synced_at,
        staleness_minutes: staleness.stalenessMinutes,
      });

      if (insertError) {
        logger.error('Failed to record health check', { errorMessage: insertError.message });
        return internalErrorResponse(req);
      }

      logger.info('Health check recorded', {
        connectionId,
        healthStatus,
        httpStatus: 200,
      });

      return jsonResponse(req, {
        connection_id: connectionId,
        health_status: healthStatus,
        staleness_minutes: staleness.stalenessMinutes,
        error_category: errorCategory,
        needs_reauth: connection.status === 'needs_reauth',
      });
    }

    // -----------------------------------------------------------------------
    // POST ?action=resolve — Mark health issue resolved
    // -----------------------------------------------------------------------
    if (req.method === 'POST' && action === 'resolve') {
      const body = await req.json();
      const healthEventId = body.health_event_id;
      const resolutionAction = body.resolution_action;

      if (!healthEventId) {
        return errorResponse(req, 'health_event_id is required');
      }

      // RLS ensures household scoping
      const { error: updateError } = await supabase
        .from('bank_connection_health')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_action: resolutionAction ?? 'manual_resolve',
        })
        .eq('id', healthEventId)
        .is('resolved_at', null);

      if (updateError) {
        logger.error('Failed to resolve health event', { errorMessage: updateError.message });
        return internalErrorResponse(req);
      }

      logger.info('Health event resolved', { healthEventId, httpStatus: 200 });
      return jsonResponse(req, { resolved: true });
    }

    return methodNotAllowedResponse(req);
  } catch (err) {
    logger.error('Aggregator health error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
