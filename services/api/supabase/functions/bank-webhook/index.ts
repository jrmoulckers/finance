// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank Webhook Handler Edge Function (#265, #3848)
 *
 * Receives webhook events from Plaid and MX when bank data changes,
 * verifies their signatures, ingests transaction/balance updates into the
 * `transactions` table (respecting provenance columns), and records a
 * `bank_connection_health` event.
 *
 * Supported webhook types:
 *   Plaid: TRANSACTIONS (SYNC_UPDATES_AVAILABLE, DEFAULT_UPDATE,
 *          INITIAL_UPDATE, HISTORICAL_UPDATE), ITEM (ERROR,
 *          PENDING_EXPIRATION, USER_PERMISSION_REVOKED)
 *   MX:    AGGREGATION (member_data_updated), CONNECTION_STATUS (CHANGED)
 *
 * Security:
 *   - Plaid webhooks are verified via the signed JWT in the
 *     `Plaid-Verification` header (ES256 JWS + request-body SHA-256).
 *   - MX does not sign webhook requests at all, so MX webhooks are
 *     authenticated by a shared secret carried in the `token` query
 *     parameter of the registered webhook URL (see `verifyMx`).
 *   - No user authentication — endpoints are public but cryptographically
 *     verified. Rate limited by IP.
 *   - Access tokens are decrypted only in memory for provider sync and are
 *     NEVER logged or returned.
 *   - NEVER logs raw financial data from webhook payloads.
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   PLAID_CLIENT_ID           — Plaid client id (webhook key fetch + sync)
 *   PLAID_SECRET              — Plaid secret (webhook key fetch + sync)
 *   PLAID_ENVIRONMENT         — Plaid environment (sandbox/development/production)
 *   BANK_ENCRYPTION_KEY       — AES-256 key for decrypting stored access tokens
 *   MX_WEBHOOK_SECRET         — Shared secret expected in the MX webhook
 *                               URL's `token` query parameter
 *   MX_CLIENT_ID              — MX client id (transaction pull)
 *   MX_API_KEY                — MX API key (transaction pull)
 *   MX_ENVIRONMENT            — MX environment (sandbox/integration/production)
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
import { timingSafeEqual } from '../_shared/crypto.ts';
import { verifyPlaidWebhook } from '../_shared/plaid-webhook.ts';
import { getWebhookVerificationKey, type PlaidConfig } from '../_shared/plaid.ts';
import { classifyMxWebhookEvent, type MxWebhookEvent } from '../_shared/mx.ts';
import {
  ingestMxTransactions,
  ingestPlaidTransactions,
  type BankConnectionRow,
  type IngestionSummary,
} from '../_shared/bank-ingest.ts';

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/** Read Plaid credentials from the environment. */
function plaidConfigFromEnv(): PlaidConfig {
  return {
    clientId: Deno.env.get('PLAID_CLIENT_ID') ?? '',
    secret: Deno.env.get('PLAID_SECRET') ?? '',
    environment: Deno.env.get('PLAID_ENVIRONMENT') ?? 'sandbox',
  };
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

/**
 * Verify a Plaid webhook using the signed JWT in the `Plaid-Verification`
 * header. The verification key is fetched from Plaid for the JWT's `kid`.
 */
async function verifyPlaid(body: string, headers: Headers): Promise<boolean> {
  const config = plaidConfigFromEnv();
  if (!config.clientId || !config.secret) return false;

  const verificationHeader = headers.get('plaid-verification');
  return verifyPlaidWebhook(body, verificationHeader, {
    fetchKey: (keyId) => getWebhookVerificationKey(config, keyId),
  });
}

/**
 * Verify an MX webhook.
 *
 * MX does **not** sign webhook requests. Its published verification guidance
 * offers only transport/endpoint-level options (HTTP Basic, mTLS, OAuth2) and
 * documents no body-signing header — an earlier revision of this function
 * required an `mx-signature` header that MX never sends, which rejected every
 * real delivery with 401.
 *
 * Authenticity is therefore established with a shared secret carried in the
 * `token` query parameter of the webhook URL registered in the MX dashboard.
 * The comparison is constant time so a wrong token cannot be refined one
 * character at a time from response latency.
 *
 * Defense in depth: `processMxEvent` never trusts payload contents. It uses
 * `member_guid` only to look up a connection we already own and then pulls the
 * data from MX's authenticated API, so a forged event cannot inject financial
 * data — at worst it triggers a redundant sync.
 */
async function verifyMx(url: URL): Promise<boolean> {
  const mxSecret = Deno.env.get('MX_WEBHOOK_SECRET');
  if (!mxSecret) return false;

  const token = url.searchParams.get('token');
  if (!token) return false;

  return timingSafeEqual(token, mxSecret);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaidWebhookEvent {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: { error_code: string; error_message: string };
  new_transactions?: number;
  removed_transactions?: string[];
}

type AdminClient = ReturnType<typeof createAdminClient>;
type FunctionLogger = ReturnType<typeof createLogger>;

// ---------------------------------------------------------------------------
// Health event recording
// ---------------------------------------------------------------------------

/**
 * Record a `bank_connection_health` event for a connection. Best-effort —
 * failures are logged but do not abort webhook processing.
 */
async function recordHealthEvent(
  supabase: AdminClient,
  connection: { id: string; household_id: string },
  status: string,
  logger: FunctionLogger,
  detail?: { errorCategory?: string | null; errorDetail?: string | null },
): Promise<void> {
  const { error } = await supabase.from('bank_connection_health').insert({
    bank_connection_id: connection.id,
    household_id: connection.household_id,
    status,
    error_category: detail?.errorCategory ?? null,
    error_detail: detail?.errorDetail ?? null,
    last_successful_sync: status === 'healthy' ? new Date().toISOString() : null,
  });

  if (error) {
    logger.warn('Failed to record health event', { errorMessage: error.message });
  }
}

// ---------------------------------------------------------------------------
// Event processors
// ---------------------------------------------------------------------------

const PLAID_TRANSACTION_CODES = new Set([
  'SYNC_UPDATES_AVAILABLE',
  'INITIAL_UPDATE',
  'HISTORICAL_UPDATE',
  'DEFAULT_UPDATE',
  'TRANSACTIONS_REMOVED',
]);

/**
 * Process a Plaid webhook event. NEVER logs raw transaction data — only
 * event metadata and aggregate counts.
 */
async function processPlaidEvent(
  supabase: AdminClient,
  event: PlaidWebhookEvent,
  logger: FunctionLogger,
): Promise<void> {
  const { webhook_type, webhook_code, item_id } = event;

  logger.info('Processing Plaid event', {
    webhookType: webhook_type,
    webhookCode: webhook_code,
    hasError: !!event.error,
  });

  const { data: connection } = await supabase
    .from('bank_connections')
    .select('id, household_id, encrypted_access_token, metadata')
    .eq('provider', 'plaid')
    .contains('metadata', { item_id })
    .is('deleted_at', null)
    .single();

  if (!connection) {
    logger.warn('No connection found for Plaid item', { webhookType: webhook_type });
    return;
  }

  const conn = connection as BankConnectionRow;

  if (webhook_type === 'ITEM') {
    if (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION') {
      await supabase
        .from('bank_connections')
        .update({
          status: 'needs_reauth',
          error_code: event.error?.error_code ?? webhook_code,
          error_message: event.error?.error_message ?? 'Reconnection required',
        })
        .eq('id', conn.id);
      await recordHealthEvent(supabase, conn, 'auth_expired', logger, {
        errorCategory: 'auth',
        errorDetail: event.error?.error_code ?? webhook_code,
      });
    } else if (webhook_code === 'USER_PERMISSION_REVOKED') {
      await supabase.from('bank_connections').update({ status: 'disconnected' }).eq('id', conn.id);
      await recordHealthEvent(supabase, conn, 'auth_expired', logger, {
        errorCategory: 'auth',
        errorDetail: webhook_code,
      });
    }
    return;
  }

  if (webhook_type === 'TRANSACTIONS' && PLAID_TRANSACTION_CODES.has(webhook_code)) {
    const syncType =
      webhook_code === 'INITIAL_UPDATE'
        ? 'initial'
        : webhook_code === 'HISTORICAL_UPDATE'
          ? 'historical'
          : 'webhook';

    let summary: IngestionSummary = { added: 0, modified: 0, removed: 0 };
    let syncStatus = 'completed';
    try {
      summary = await ingestPlaidTransactions(supabase, conn, logger);
    } catch (err) {
      syncStatus = 'failed';
      logger.error('Plaid ingestion failed', { errorMessage: (err as Error).message });
    }

    await supabase.from('bank_sync_log').insert({
      bank_connection_id: conn.id,
      household_id: conn.household_id,
      sync_type: syncType,
      status: syncStatus,
      transactions_added: summary.added,
      transactions_updated: summary.modified,
      completed_at: new Date().toISOString(),
    });

    await recordHealthEvent(
      supabase,
      conn,
      syncStatus === 'failed' ? 'provider_down' : 'healthy',
      logger,
    );

    logger.info('Plaid transactions processed', {
      added: summary.added,
      modified: summary.modified,
      removed: summary.removed,
      syncStatus,
    });
  }
}

/**
 * Process an MX webhook event.
 *
 * MX does not deliver transaction contents in the webhook payload, so a
 * transaction event triggers a real pull from the MX API (mirroring the Plaid
 * path). NEVER logs raw financial data — only aggregate counts.
 */
async function processMxEvent(
  supabase: AdminClient,
  event: MxWebhookEvent,
  logger: FunctionLogger,
): Promise<void> {
  logger.info('Processing MX event', { mxType: event.type, mxAction: event.action });

  if (!event.member_guid) {
    logger.warn('MX event has no member_guid', { mxType: event.type, mxAction: event.action });
    return;
  }

  const { data: connection } = await supabase
    .from('bank_connections')
    .select('id, household_id, encrypted_access_token, metadata')
    .eq('provider', 'mx')
    .contains('metadata', { item_id: event.member_guid })
    .is('deleted_at', null)
    .single();

  if (!connection) {
    logger.warn('No connection found for MX member');
    return;
  }

  const conn = connection as BankConnectionRow;
  const disposition = classifyMxWebhookEvent(event);

  // MX only emits CONNECTION_STATUS when a member enters an actionable state
  // (CHALLENGED, DENIED, EXPIRED, IMPAIRED, IMPEDED, LOCKED, PREVENTED,
  // REJECTED) — all of which require the user to revisit the connection.
  // `connection_status_message` is deliberately not logged: it embeds the
  // institution name.
  if (disposition === 'needs_reauth') {
    await supabase.from('bank_connections').update({ status: 'needs_reauth' }).eq('id', conn.id);
    await recordHealthEvent(supabase, conn, 'auth_expired', logger, {
      errorCategory: 'auth',
      errorDetail: event.connection_status ?? 'unknown',
    });
    return;
  }

  if (disposition === 'ingest') {
    let summary: IngestionSummary = { added: 0, modified: 0, removed: 0 };
    let syncStatus = 'completed';
    try {
      summary = await ingestMxTransactions(supabase, conn, logger);
    } catch (err) {
      syncStatus = 'failed';
      logger.error('MX ingestion failed', { errorMessage: (err as Error).message });
    }

    await supabase.from('bank_sync_log').insert({
      bank_connection_id: conn.id,
      household_id: conn.household_id,
      sync_type: 'webhook',
      status: syncStatus,
      transactions_added: summary.added,
      transactions_updated: summary.modified,
      completed_at: new Date().toISOString(),
    });

    await recordHealthEvent(
      supabase,
      conn,
      syncStatus === 'failed' ? 'provider_down' : 'healthy',
      logger,
    );

    logger.info('MX transactions processed', {
      added: summary.added,
      modified: summary.modified,
      syncStatus,
    });
    return;
  }

  // Falling through means MX sent a category we do not handle. Log it loudly:
  // silently returning 200 on an unrecognized shape is what hid the earlier
  // `event_type` contract mismatch, because MX treats 200 as delivered and
  // never retries.
  logger.warn('Unhandled MX webhook event category', {
    mxType: event.type,
    mxAction: event.action,
  });
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

    // Verify the webhook BEFORE parsing/processing.
    const verified =
      provider === 'plaid' ? await verifyPlaid(body, req.headers) : await verifyMx(url);

    if (!verified) {
      logger.warn('Webhook verification failed', { provider });
      return errorResponse(req, 'Invalid webhook signature', 401);
    }

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
