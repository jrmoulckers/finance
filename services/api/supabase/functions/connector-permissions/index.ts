// SPDX-License-Identifier: BUSL-1.1

/**
 * Connector Permissions & Safety Center Edge Function (#1583)
 *
 * Manages third-party connector permissions, displays what each connector
 * can access, and provides permission revocation:
 *   GET  ?action=list            — List all connector permissions for household
 *   GET  ?action=access_log      — View audit log of third-party data access
 *   PUT  ?action=revoke          — Revoke a connector's permissions
 *   PUT  ?action=update_level    — Update permission level for a connector
 *
 * Security:
 *   - Requires authentication (valid JWT)
 *   - Only household owners/admins can manage permissions
 *   - All connectors default to read-only
 *   - NEVER returns access tokens in responses
 *   - NEVER logs sensitive financial data
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
// Constants
// ---------------------------------------------------------------------------

const VALID_PERMISSION_LEVELS = ['read_only', 'read_write', 'read_balance', 'read_transactions'];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('connector-permissions');
  logger.info('Request received', { method: req.method });

  const envError = validateEnv('connector-permissions', req);
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
    // GET ?action=list — List connector permissions for household
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'list') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId) {
        return errorResponse(req, 'household_id query parameter is required');
      }

      // Verify membership
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

      // Fetch permissions with connection details — NEVER return tokens
      const { data: permissions, error } = await supabase
        .from('connector_permissions')
        .select(
          'id, bank_connection_id, permission_level, granted_scopes, ' +
            'scope_descriptions, is_revoked, revoked_at, revoked_reason, ' +
            'token_status, token_expires_at, last_refreshed_at, ' +
            'created_at, updated_at',
        )
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to list permissions', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      // Fetch associated bank connections for display names
      const connectionIds = [...new Set((permissions ?? []).map((p) => p.bank_connection_id))];
      let connectionMap: Record<string, { provider: string; institution_name: string }> = {};

      if (connectionIds.length > 0) {
        const { data: connections } = await supabase
          .from('bank_connections')
          .select('id, provider, institution_name')
          .in('id', connectionIds)
          .is('deleted_at', null);

        if (connections) {
          connectionMap = Object.fromEntries(
            connections.map((c) => [
              c.id,
              { provider: c.provider, institution_name: c.institution_name },
            ]),
          );
        }
      }

      // Enrich permissions with connection info
      const enriched = (permissions ?? []).map((p) => ({
        ...p,
        connection: connectionMap[p.bank_connection_id] ?? null,
      }));

      return jsonResponse(req, { permissions: enriched });
    }

    // -----------------------------------------------------------------------
    // GET ?action=access_log — View audit log
    // -----------------------------------------------------------------------
    if (req.method === 'GET' && action === 'access_log') {
      const householdId = url.searchParams.get('household_id');
      if (!householdId) {
        return errorResponse(req, 'household_id query parameter is required');
      }

      // Verify membership
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

      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

      const { data: log, error } = await supabase
        .from('connector_access_log')
        .select(
          'id, bank_connection_id, access_type, provider_name, ' +
            'status, record_count, error_message, duration_ms, created_at',
        )
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch access log', { errorMessage: error.message });
        return internalErrorResponse(req);
      }

      return jsonResponse(req, { access_log: log ?? [] });
    }

    // -----------------------------------------------------------------------
    // PUT ?action=revoke — Revoke connector permissions
    // -----------------------------------------------------------------------
    if (req.method === 'PUT' && action === 'revoke') {
      const body = await req.json();
      const permissionId = body.permission_id;
      const reason = body.reason;

      if (!permissionId) {
        return errorResponse(req, 'permission_id is required');
      }

      // Fetch permission to verify ownership
      const { data: permission, error: fetchError } = await supabase
        .from('connector_permissions')
        .select('id, household_id, bank_connection_id')
        .eq('id', permissionId)
        .is('deleted_at', null)
        .single();

      if (fetchError || !permission) {
        return errorResponse(req, 'Permission not found', 404);
      }

      // Verify admin/owner role
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', permission.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (memError || !membership) {
        return errorResponse(req, 'Only household owners and admins can revoke permissions', 403);
      }

      // Revoke
      const { error: updateError } = await supabase
        .from('connector_permissions')
        .update({
          is_revoked: true,
          revoked_at: new Date().toISOString(),
          revoked_reason: reason ?? 'User initiated revocation',
          token_status: 'revoked',
        })
        .eq('id', permissionId);

      if (updateError) {
        logger.error('Failed to revoke permission', { errorMessage: updateError.message });
        return internalErrorResponse(req);
      }

      // Record access log entry for audit
      await supabase.from('connector_access_log').insert({
        bank_connection_id: permission.bank_connection_id,
        household_id: permission.household_id,
        access_type: 'revoke_access',
        provider_name: 'user_action',
        status: 'success',
        record_count: 0,
      });

      logger.info('Permission revoked', { permissionId, httpStatus: 200 });
      return jsonResponse(req, { revoked: true });
    }

    // -----------------------------------------------------------------------
    // PUT ?action=update_level — Update permission level
    // -----------------------------------------------------------------------
    if (req.method === 'PUT' && action === 'update_level') {
      const body = await req.json();
      const permissionId = body.permission_id;
      const newLevel = body.permission_level;

      if (!permissionId) {
        return errorResponse(req, 'permission_id is required');
      }
      if (!newLevel || !VALID_PERMISSION_LEVELS.includes(newLevel)) {
        return errorResponse(
          req,
          `permission_level must be one of: ${VALID_PERMISSION_LEVELS.join(', ')}`,
        );
      }

      // Fetch permission
      const { data: permission, error: fetchError } = await supabase
        .from('connector_permissions')
        .select('id, household_id')
        .eq('id', permissionId)
        .is('deleted_at', null)
        .eq('is_revoked', false)
        .single();

      if (fetchError || !permission) {
        return errorResponse(req, 'Permission not found or already revoked', 404);
      }

      // Verify admin/owner role
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', permission.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (memError || !membership) {
        return errorResponse(req, 'Only household owners and admins can update permissions', 403);
      }

      const { error: updateError } = await supabase
        .from('connector_permissions')
        .update({ permission_level: newLevel })
        .eq('id', permissionId);

      if (updateError) {
        logger.error('Failed to update permission level', { errorMessage: updateError.message });
        return internalErrorResponse(req);
      }

      logger.info('Permission level updated', { permissionId, newLevel, httpStatus: 200 });
      return jsonResponse(req, { updated: true, permission_level: newLevel });
    }

    // -----------------------------------------------------------------------
    // DELETE — not supported, use revoke
    // -----------------------------------------------------------------------
    if (req.method === 'DELETE') {
      return errorResponse(req, 'Use PUT ?action=revoke to revoke permissions', 405);
    }

    return methodNotAllowedResponse(req);
  } catch (err) {
    logger.error('Connector permissions error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
