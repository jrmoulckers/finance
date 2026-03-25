// SPDX-License-Identifier: BUSL-1.1

/**
 * Manage Webhooks Edge Function (#683)
 *
 * Full CRUD for webhook endpoints plus test delivery:
 *   POST               — Create a new webhook endpoint (returns secret ONCE)
 *   GET                — List webhook endpoints for a household (no secrets)
 *   PUT                — Update an existing webhook endpoint
 *   DELETE             — Soft-delete a webhook endpoint
 *   POST ?action=test  — Send a test event to verify endpoint connectivity
 *
 * Security:
 *   - All operations require authentication (Bearer JWT).
 *   - Only household owners and admins can manage webhooks.
 *   - Webhook secrets are NEVER returned in GET/list/update responses.
 *   - NEVER log webhook secrets or payload contents.
 *   - All webhook URLs must use HTTPS.
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
  noContentResponse,
} from '../_shared/response.ts';
import { createWebhookEvent, deliverWebhook, VALID_EVENT_TYPES } from '../_shared/webhook.ts';
import type { WebhookEndpoint } from '../_shared/webhook.ts';

serve(async (req: Request): Promise<Response> => {
  // -------------------------------------------------------------------------
  // CORS preflight
  // -------------------------------------------------------------------------
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('manage-webhooks');
  logger.info('Request received', { method: req.method });

  // -------------------------------------------------------------------------
  // Environment validation
  // -------------------------------------------------------------------------
  const envError = validateEnv('manage-webhooks', req);
  if (envError) return envError;

  try {
    // -----------------------------------------------------------------------
    // Authentication
    // -----------------------------------------------------------------------
    let user;
    try {
      user = await requireAuth(req);
    } catch (response) {
      return response as Response;
    }

    logger.setUserId(user.id);

    const supabase = createAdminClient();

    // -----------------------------------------------------------------------
    // Rate limiting (user-based, 30 req/min)
    // -----------------------------------------------------------------------
    const rateLimitResult = await checkRateLimit(supabase, user.id, RATE_LIMITS['manage-webhooks']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['manage-webhooks']);
    }

    // -----------------------------------------------------------------------
    // Check for ?action=test on POST
    // -----------------------------------------------------------------------
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'POST' && action === 'test') {
      // =====================================================================
      // TEST WEBHOOK DELIVERY
      // =====================================================================
      const body = await req.json();
      const { endpoint_id } = body;

      if (!endpoint_id) {
        return errorResponse(req, 'endpoint_id is required');
      }

      // Fetch the endpoint (with secret for signing)
      const { data: endpoint, error: epError } = await supabase
        .from('webhook_endpoints')
        .select('id, household_id, url, secret, events, is_active')
        .eq('id', endpoint_id)
        .is('deleted_at', null)
        .single();

      if (epError || !endpoint) {
        return errorResponse(req, 'Webhook endpoint not found', 404);
      }

      // Verify user is owner/admin of the endpoint's household
      const { data: membership, error: memError } = await supabase
        .from('household_members')
        .select('id, role')
        .eq('household_id', endpoint.household_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('role', ['owner', 'admin'])
        .single();

      if (memError || !membership) {
        return errorResponse(req, 'Only household owners and admins can test webhooks', 403);
      }

      if (!endpoint.is_active) {
        return errorResponse(req, 'Cannot test a disabled webhook endpoint');
      }

      // Send a test event
      const testEvent = createWebhookEvent('test', endpoint.household_id, endpoint.id, {
        message: 'Webhook test delivery',
      });

      const deliveryEndpoint: WebhookEndpoint = {
        id: endpoint.id,
        url: endpoint.url,
        secret: endpoint.secret,
        events: endpoint.events,
        is_active: endpoint.is_active,
      };

      const result = await deliverWebhook(deliveryEndpoint, testEvent, logger);

      logger.info('Test webhook delivery completed', {
        endpointId: endpoint.id,
        success: result.success,
        httpStatus: 200,
      });

      return jsonResponse(req, {
        success: result.success,
        status_code: result.status_code,
        duration_ms: result.duration_ms,
        ...(result.error ? { error: result.error } : {}),
      });
    }

    // -----------------------------------------------------------------------
    // Method routing
    // -----------------------------------------------------------------------
    switch (req.method) {
      case 'POST': {
        // ===================================================================
        // CREATE WEBHOOK ENDPOINT
        // ===================================================================
        const body = await req.json();
        const { household_id, url: endpointUrl, description, events } = body;

        if (!household_id) {
          return errorResponse(req, 'household_id is required');
        }

        if (!endpointUrl) {
          return errorResponse(req, 'url is required');
        }

        // Validate HTTPS-only
        if (typeof endpointUrl !== 'string' || !endpointUrl.startsWith('https://')) {
          return errorResponse(req, 'Webhook URL must start with https://');
        }

        if (endpointUrl.length > 2048) {
          return errorResponse(req, 'Webhook URL must not exceed 2048 characters');
        }

        // Validate events array
        if (!Array.isArray(events) || events.length === 0) {
          return errorResponse(req, 'events must be a non-empty array');
        }

        const invalidEvents = events.filter(
          (e: unknown) => typeof e !== 'string' || !VALID_EVENT_TYPES.has(e),
        );
        if (invalidEvents.length > 0) {
          return errorResponse(req, `Invalid event types: ${invalidEvents.join(', ')}`);
        }

        // Verify user is owner/admin of the household
        const { data: membership, error: memError } = await supabase
          .from('household_members')
          .select('id, role')
          .eq('household_id', household_id)
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .in('role', ['owner', 'admin'])
          .single();

        if (memError || !membership) {
          return errorResponse(req, 'Only household owners and admins can manage webhooks', 403);
        }

        // Insert endpoint (secret is generated by DB default)
        const { data: endpoint, error: insertError } = await supabase
          .from('webhook_endpoints')
          .insert({
            household_id,
            url: endpointUrl,
            description: description ?? null,
            events,
            created_by: user.id,
          })
          .select('id, url, events, secret, description, is_active, created_at')
          .single();

        if (insertError) {
          logger.error('Failed to create webhook endpoint', {
            errorMessage: insertError.message,
          });
          return internalErrorResponse(req);
        }

        logger.info('Webhook endpoint created', { httpStatus: 201, endpointId: endpoint.id });

        // Return secret ONLY on creation
        return createdResponse(req, {
          id: endpoint.id,
          url: endpoint.url,
          events: endpoint.events,
          secret: endpoint.secret,
          description: endpoint.description,
          is_active: endpoint.is_active,
          created_at: endpoint.created_at,
        });
      }

      case 'GET': {
        // ===================================================================
        // LIST WEBHOOK ENDPOINTS
        // ===================================================================
        const household_id = url.searchParams.get('household_id');

        if (!household_id) {
          return errorResponse(req, 'household_id query parameter is required');
        }

        // Verify user belongs to household as owner/admin
        const { data: membership, error: memError } = await supabase
          .from('household_members')
          .select('id, role')
          .eq('household_id', household_id)
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .in('role', ['owner', 'admin'])
          .single();

        if (memError || !membership) {
          return errorResponse(req, 'Only household owners and admins can view webhooks', 403);
        }

        const { data: endpoints, error: listError } = await supabase
          .from('webhook_endpoints')
          .select(
            'id, url, description, events, is_active, failure_count, last_success_at, last_failure_at, created_at, updated_at',
          )
          .eq('household_id', household_id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (listError) {
          logger.error('Failed to list webhook endpoints', {
            errorMessage: listError.message,
          });
          return internalErrorResponse(req);
        }

        logger.info('Webhook endpoints listed', {
          httpStatus: 200,
          count: endpoints?.length ?? 0,
        });

        // NEVER include secret in list response
        return jsonResponse(req, { endpoints: endpoints ?? [] });
      }

      case 'PUT': {
        // ===================================================================
        // UPDATE WEBHOOK ENDPOINT
        // ===================================================================
        const body = await req.json();
        const {
          id: endpointId,
          url: newUrl,
          events: newEvents,
          description: newDesc,
          is_active,
        } = body;

        if (!endpointId) {
          return errorResponse(req, 'id is required');
        }

        // Fetch the endpoint to verify ownership
        const { data: existing, error: fetchError } = await supabase
          .from('webhook_endpoints')
          .select('id, household_id')
          .eq('id', endpointId)
          .is('deleted_at', null)
          .single();

        if (fetchError || !existing) {
          return errorResponse(req, 'Webhook endpoint not found', 404);
        }

        // Verify user is owner/admin
        const { data: membership, error: memError } = await supabase
          .from('household_members')
          .select('id, role')
          .eq('household_id', existing.household_id)
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .in('role', ['owner', 'admin'])
          .single();

        if (memError || !membership) {
          return errorResponse(req, 'Only household owners and admins can manage webhooks', 403);
        }

        // Build update payload
        const updates: Record<string, unknown> = {};

        if (newUrl !== undefined) {
          if (typeof newUrl !== 'string' || !newUrl.startsWith('https://')) {
            return errorResponse(req, 'Webhook URL must start with https://');
          }
          if (newUrl.length > 2048) {
            return errorResponse(req, 'Webhook URL must not exceed 2048 characters');
          }
          updates.url = newUrl;
        }

        if (newEvents !== undefined) {
          if (!Array.isArray(newEvents) || newEvents.length === 0) {
            return errorResponse(req, 'events must be a non-empty array');
          }
          const invalidEvents = newEvents.filter(
            (e: unknown) => typeof e !== 'string' || !VALID_EVENT_TYPES.has(e),
          );
          if (invalidEvents.length > 0) {
            return errorResponse(req, `Invalid event types: ${invalidEvents.join(', ')}`);
          }
          updates.events = newEvents;
        }

        if (newDesc !== undefined) {
          updates.description = newDesc;
        }

        if (is_active !== undefined) {
          if (typeof is_active !== 'boolean') {
            return errorResponse(req, 'is_active must be a boolean');
          }
          updates.is_active = is_active;
        }

        if (Object.keys(updates).length === 0) {
          return errorResponse(req, 'No fields to update');
        }

        const { data: updated, error: updateError } = await supabase
          .from('webhook_endpoints')
          .update(updates)
          .eq('id', endpointId)
          .select(
            'id, url, description, events, is_active, failure_count, last_success_at, last_failure_at, created_at, updated_at',
          )
          .single();

        if (updateError) {
          logger.error('Failed to update webhook endpoint', {
            errorMessage: updateError.message,
          });
          return internalErrorResponse(req);
        }

        logger.info('Webhook endpoint updated', { httpStatus: 200, endpointId });

        // NEVER include secret in update response
        return jsonResponse(req, updated);
      }

      case 'DELETE': {
        // ===================================================================
        // SOFT-DELETE WEBHOOK ENDPOINT
        // ===================================================================
        const endpointId = url.searchParams.get('id');

        if (!endpointId) {
          // Try reading from body as fallback
          try {
            const body = await req.json();
            if (!body.id) {
              return errorResponse(req, 'id is required');
            }
            return await handleDelete(supabase, req, user, body.id, logger);
          } catch {
            return errorResponse(req, 'id is required');
          }
        }

        return await handleDelete(supabase, req, user, endpointId, logger);
      }

      default:
        return methodNotAllowedResponse(req);
    }
  } catch (err) {
    logger.error('manage-webhooks error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});

/**
 * Handle soft-deletion of a webhook endpoint.
 * Extracted to avoid duplicating the ownership verification logic.
 */
async function handleDelete(
  supabase: ReturnType<typeof createAdminClient>,
  req: Request,
  user: { id: string; email: string },
  endpointId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<Response> {
  // Fetch the endpoint to verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('webhook_endpoints')
    .select('id, household_id')
    .eq('id', endpointId)
    .is('deleted_at', null)
    .single();

  if (fetchError || !existing) {
    return errorResponse(req, 'Webhook endpoint not found', 404);
  }

  // Verify user is owner/admin
  const { data: membership, error: memError } = await supabase
    .from('household_members')
    .select('id, role')
    .eq('household_id', existing.household_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('role', ['owner', 'admin'])
    .single();

  if (memError || !membership) {
    return errorResponse(req, 'Only household owners and admins can manage webhooks', 403);
  }

  const { error: deleteError } = await supabase
    .from('webhook_endpoints')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', endpointId);

  if (deleteError) {
    logger.error('Failed to soft-delete webhook endpoint', {
      errorMessage: deleteError.message,
    });
    return internalErrorResponse(req);
  }

  logger.info('Webhook endpoint soft-deleted', { httpStatus: 204, endpointId });

  return noContentResponse(req);
}
