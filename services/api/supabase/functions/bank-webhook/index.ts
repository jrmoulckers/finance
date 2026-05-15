// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): SPECULATIVE — Not wired to any client. No tests. Webhook
// signature verification is stubbed (Plaid JWT, MX HMAC). Depends on
// bank-connection being active. Exclude from alpha deployment. (#1390)

/**
 * Bank Webhook Handler Edge Function (#265)
 *
 * Receives webhook events from Plaid and MX when bank data changes.
 * Verifies webhook signatures, processes events, and triggers syncs.
 *
 * Supported webhook types:
 *   Plaid: TRANSACTIONS (DEFAULT_UPDATE, INITIAL_UPDATE, HISTORICAL_UPDATE, REMOVED)
 *          ITEM (ERROR, PENDING_EXPIRATION, USER_PERMISSION_REVOKED)
 *   MX:    member_connected, member_status_changed, transactions_added
 *
 * Security:
 *   - Verifies webhook signatures (Plaid: JWT, MX: HMAC-SHA256)
 *   - No user authentication — webhook endpoints are public but verified
 *   - NEVER logs raw financial data from webhook payloads
 *   - Rate limited by IP
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   PLAID_WEBHOOK_SECRET      — Plaid webhook verification secret
 *   MX_WEBHOOK_SECRET         — MX webhook verification secret
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createAdminClient } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { validateEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  checkRateLimit,
  getClientIp,
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
// Webhook verification stubs
// ---------------------------------------------------------------------------

/**
 * Verify a Plaid webhook signature.
 *
 * STUB: In production, verifies the JWS signature using Plaid's
 * public key endpoint. Returns true if signature is valid.
 */
async function verifyPlaidWebhook(_body: string, _headers: Headers): Promise<boolean> {
  const secret = Deno.env.get('PLAID_WEBHOOK_SECRET');
  if (!secret) return false;

  // STUB: Would verify Plaid JWS signature here
  // 1. Extract the signed JWT from Plaid-Verification header
  // 2. Fetch Plaid's public key from /webhook_verification_key/get
  // 3. Verify the JWT signature against the public key
  // 4. Compare the body hash against the signed claim
  return true;
}

/**
 * Verify an MX webhook HMAC signature.
 *
 * STUB: In production, computes HMAC-SHA256 of the body and
 * compares against the signature header.
 */
async function verifyMxWebhook(_body: string, _headers: Headers): Promise<boolean> {
  const secret = Deno.env.get('MX_WEBHOOK_SECRET');
  if (!secret) return false;

  // STUB: Would verify MX HMAC-SHA256 signature here
  return true;
}

// ---------------------------------------------------------------------------
// Event processors
// ---------------------------------------------------------------------------

interface PlaidWebhookEvent {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: { error_code: string; error_message: string };
  new_transactions?: number;
  removed_transactions?: string[];
}

interface MxWebhookEvent {
  event_type: string;
  member_guid: string;
  user_guid: string;
}

/**
 * Process a Plaid webhook event.
 *
 * Handles transaction updates, item errors, and connection status changes.
 * NEVER logs raw transaction data — only event metadata.
 */
async function processPlaidEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: PlaidWebhookEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const { webhook_type, webhook_code, item_id } = event;

  logger.info('Processing Plaid event', {
    webhookType: webhook_type,
    webhookCode: webhook_code,
    hasError: !!event.error,
  });

  // Find the connection by item_id in metadata
  const { data: connection } = await supabase
    .from('bank_connections')
    .select('id, household_id')
    .eq('provider', 'plaid')
    .contains('metadata', { item_id })
    .is('deleted_at', null)
    .single();

  if (!connection) {
    logger.warn('No connection found for Plaid item', { webhookType: webhook_type });
    return;
  }

  if (webhook_type === 'ITEM') {
    if (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION') {
      await supabase
        .from('bank_connections')
        .update({
          status: 'needs_reauth',
          error_code: event.error?.error_code ?? webhook_code,
          error_message: event.error?.error_message ?? 'Reconnection required',
        })
        .eq('id', connection.id);
    } else if (webhook_code === 'USER_PERMISSION_REVOKED') {
      await supabase
        .from('bank_connections')
        .update({ status: 'disconnected' })
        .eq('id', connection.id);
    }
  }

  if (webhook_type === 'TRANSACTIONS') {
    // Log sync operation
    const syncType =
      webhook_code === 'INITIAL_UPDATE'
        ? 'initial'
        : webhook_code === 'HISTORICAL_UPDATE'
          ? 'historical'
          : 'webhook';

    await supabase.from('bank_sync_log').insert({
      bank_connection_id: connection.id,
      household_id: connection.household_id,
      sync_type: syncType,
      status: 'pending',
      transactions_added: event.new_transactions ?? 0,
    });

    // Update last_synced_at
    await supabase
      .from('bank_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);
  }
}

/**
 * Process an MX webhook event.
 *
 * NEVER logs raw financial data — only event metadata.
 */
async function processMxEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: MxWebhookEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  logger.info('Processing MX event', { eventType: event.event_type });

  const { data: connection } = await supabase
    .from('bank_connections')
    .select('id, household_id')
    .eq('provider', 'mx')
    .contains('metadata', { item_id: event.member_guid })
    .is('deleted_at', null)
    .single();

  if (!connection) {
    logger.warn('No connection found for MX member');
    return;
  }

  if (event.event_type === 'member_status_changed') {
    await supabase
      .from('bank_connections')
      .update({ status: 'needs_reauth' })
      .eq('id', connection.id);
  }

  if (event.event_type === 'transactions_added' || event.event_type === 'member_connected') {
    await supabase.from('bank_sync_log').insert({
      bank_connection_id: connection.id,
      household_id: connection.household_id,
      sync_type: 'webhook',
      status: 'pending',
    });

    await supabase
      .from('bank_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', connection.id);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('bank-webhook');
  logger.info('Webhook received', { method: req.method });

  if (req.method !== 'POST') {
    return methodNotAllowedResponse(req);
  }

  const envError = validateEnv('bank-webhook', req);
  if (envError) return envError;

  try {
    // Rate limit by IP
    const supabase = createAdminClient();
    const clientIp = getClientIp(req) ?? 'unknown';
    const rateLimitResult = await checkRateLimit(supabase, clientIp, RATE_LIMITS['bank-webhook']);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['bank-webhook']);
    }

    const body = await req.text();
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');

    if (!provider || !(['plaid', 'mx'] as string[]).includes(provider)) {
      return errorResponse(req, 'provider query parameter must be plaid or mx', 400);
    }

    // Verify webhook signature
    let verified = false;
    if (provider === 'plaid') {
      verified = await verifyPlaidWebhook(body, req.headers);
    } else {
      verified = await verifyMxWebhook(body, req.headers);
    }

    if (!verified) {
      logger.warn('Webhook signature verification failed', { provider });
      return errorResponse(req, 'Invalid webhook signature', 401);
    }

    // Process the event
    const event = JSON.parse(body);

    if (provider === 'plaid') {
      await processPlaidEvent(supabase, event as PlaidWebhookEvent, logger);
    } else {
      await processMxEvent(supabase, event as MxWebhookEvent, logger);
    }

    logger.info('Webhook processed successfully', { provider, httpStatus: 200 });
    return jsonResponse(req, { received: true });
  } catch (err) {
    logger.error('Bank webhook error', { errorMessage: (err as Error).message });
    return internalErrorResponse(req);
  }
});
