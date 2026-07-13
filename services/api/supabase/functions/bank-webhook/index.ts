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
 *   MX:    member_connected, member_status_changed, transactions_added
 *
 * Security:
 *   - Plaid webhooks are verified via the signed JWT in the
 *     `Plaid-Verification` header (ES256 JWS + request-body SHA-256).
 *   - MX webhooks are verified via HMAC-SHA256 of the raw body.
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
 *   MX_WEBHOOK_SECRET         — MX HMAC verification secret
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
import { decryptToken } from '../_shared/bank-crypto.ts';
import { verifyWebhookSignature } from '../_shared/webhook-verify.ts';
import { verifyPlaidWebhook } from '../_shared/plaid-webhook.ts';
import {
  getWebhookVerificationKey,
  plaidTransactionToRecord,
  transactionsSync,
  type PlaidConfig,
  type PlaidTransaction,
} from '../_shared/plaid.ts';

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
 * Verify an MX webhook via HMAC-SHA256 of the raw body. MX sends the
 * signature in the `mx-signature` header as `sha256=<hex>`.
 */
async function verifyMx(body: string, headers: Headers): Promise<boolean> {
  const mxSecret = Deno.env.get('MX_WEBHOOK_SECRET');
  if (!mxSecret) return false;

  const signature = headers.get('mx-signature');
  if (!signature) return false;

  return verifyWebhookSignature(body, signature, mxSecret);
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

interface MxWebhookEvent {
  event_type: string;
  member_guid: string;
  user_guid: string;
}

interface BankConnectionRow {
  id: string;
  household_id: string;
  encrypted_access_token: string;
  metadata: Record<string, unknown> | null;
}

interface LinkedAccount {
  account_id: string;
  household_id: string;
  currency_code: string;
}

/** Summary of an ingestion run (counts only — never transaction contents). */
interface IngestionSummary {
  added: number;
  modified: number;
  removed: number;
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
// Transaction ingestion (Plaid)
// ---------------------------------------------------------------------------

/**
 * Build a map of Plaid external account id -> internal linked account.
 * Only accounts that are linked to an internal Finance account participate.
 */
async function loadLinkedAccounts(
  supabase: AdminClient,
  connectionId: string,
): Promise<Map<string, LinkedAccount>> {
  const { data } = await supabase
    .from('bank_connection_accounts')
    .select('external_account_id, account_id, household_id, currency_code, is_linked')
    .eq('bank_connection_id', connectionId)
    .eq('is_linked', true)
    .is('deleted_at', null);

  const map = new Map<string, LinkedAccount>();
  for (const row of data ?? []) {
    if (row.account_id) {
      map.set(row.external_account_id, {
        account_id: row.account_id,
        household_id: row.household_id,
        currency_code: row.currency_code ?? 'USD',
      });
    }
  }
  return map;
}

/**
 * Upsert a single Plaid transaction into `transactions` with provenance.
 * Returns true if a new row was inserted.
 *
 * NEVER logs the transaction contents.
 */
async function upsertPlaidTransaction(
  supabase: AdminClient,
  txn: PlaidTransaction,
  account: LinkedAccount,
): Promise<boolean> {
  // Deduplicate on the provider transaction id — provider webhooks may retry.
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('provider_transaction_id', txn.transaction_id)
    .is('deleted_at', null)
    .maybeSingle();

  const record = {
    ...plaidTransactionToRecord(txn, {
      householdId: account.household_id,
      accountId: account.account_id,
      currencyFallback: account.currency_code,
    }),
    imported_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('transactions').update(record).eq('id', existing.id);
    return false;
  }

  await supabase.from('transactions').insert(record);
  return true;
}

/**
 * Ingest incremental transaction updates for a Plaid connection via
 * /transactions/sync, honoring the stored cursor and persisting the new one.
 */
async function ingestPlaidTransactions(
  supabase: AdminClient,
  connection: BankConnectionRow,
  logger: FunctionLogger,
): Promise<IngestionSummary> {
  const summary: IngestionSummary = { added: 0, modified: 0, removed: 0 };

  const config = plaidConfigFromEnv();
  const encryptionKey = Deno.env.get('BANK_ENCRYPTION_KEY');
  if (!config.clientId || !config.secret || !encryptionKey) {
    logger.warn('Skipping ingestion — provider config incomplete');
    return summary;
  }

  const accessToken = await decryptToken(connection.encrypted_access_token, encryptionKey);
  const linkedAccounts = await loadLinkedAccounts(supabase, connection.id);

  let cursor = (connection.metadata?.['cursor'] as string | undefined) ?? null;
  let hasMore = true;
  let pages = 0;
  const MAX_PAGES = 20; // Guard against runaway pagination.

  while (hasMore && pages < MAX_PAGES) {
    pages++;
    const page = await transactionsSync(config, accessToken, cursor);

    for (const txn of page.added) {
      const account = linkedAccounts.get(txn.account_id);
      if (!account) continue;
      const inserted = await upsertPlaidTransaction(supabase, txn, account);
      if (inserted) summary.added++;
      else summary.modified++;
    }

    for (const txn of page.modified) {
      const account = linkedAccounts.get(txn.account_id);
      if (!account) continue;
      await upsertPlaidTransaction(supabase, txn, account);
      summary.modified++;
    }

    for (const removed of page.removed) {
      const { data: rows } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('provider_transaction_id', removed.transaction_id)
        .is('deleted_at', null)
        .select('id');
      summary.removed += rows?.length ?? 0;
    }

    cursor = page.next_cursor;
    hasMore = page.has_more;
  }

  // Persist the advanced cursor for the next sync (merge into metadata).
  const mergedMetadata = { ...(connection.metadata ?? {}), cursor };
  await supabase
    .from('bank_connections')
    .update({ metadata: mergedMetadata, last_synced_at: new Date().toISOString() })
    .eq('id', connection.id);

  return summary;
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
 * Process an MX webhook event. MX transaction contents are not delivered in
 * the webhook payload, so we record intent and health (full MX pull is a
 * documented follow-up). NEVER logs raw financial data.
 */
async function processMxEvent(
  supabase: AdminClient,
  event: MxWebhookEvent,
  logger: FunctionLogger,
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
    await recordHealthEvent(supabase, connection, 'auth_expired', logger, {
      errorCategory: 'auth',
      errorDetail: event.event_type,
    });
    return;
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
    await recordHealthEvent(supabase, connection, 'healthy', logger);
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

    // Verify webhook signature BEFORE parsing/processing.
    const verified =
      provider === 'plaid'
        ? await verifyPlaid(body, req.headers)
        : await verifyMx(body, req.headers);

    if (!verified) {
      logger.warn('Webhook signature verification failed', { provider });
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
