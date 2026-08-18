// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared bank transaction ingestion (#265, #3848).
 *
 * Extracted from `bank-webhook` so the exact same ingestion path can run in two
 * places with identical semantics:
 *   1. `bank-webhook`    — incremental sync when a provider webhook fires.
 *   2. `bank-connection` — an initial backfill immediately after a bank is
 *      linked, so the user sees transactions without waiting for a webhook.
 *
 * Ingestion only accepts transactions whose external Plaid account is mapped to
 * an internal Finance account via `bank_connection_accounts` (is_linked=true).
 * Callers MUST provision + link those rows BEFORE invoking this module, or every
 * transaction is silently dropped.
 *
 * Security:
 *   - Access tokens are decrypted only in memory for provider sync and are
 *     NEVER logged or returned.
 *   - NEVER logs raw financial data — only aggregate counts.
 *
 * @module _shared/bank-ingest
 */

import { createAdminClient } from './auth.ts';
import { decryptToken } from './bank-crypto.ts';
import { createLogger } from './logger.ts';
import {
  plaidTransactionToRecord,
  transactionsSync,
  type PlaidConfig,
  type PlaidTransaction,
  type TransactionRecord,
} from './plaid.ts';
import {
  decodeMxCredential,
  getTransactions as mxGetTransactions,
  mxTransactionToRecord,
  type MxConfig,
  type MxTransaction,
} from './mx.ts';

type AdminClient = ReturnType<typeof createAdminClient>;
type FunctionLogger = ReturnType<typeof createLogger>;

/** A `bank_connections` row with the fields ingestion needs. */
export interface BankConnectionRow {
  id: string;
  household_id: string;
  encrypted_access_token: string;
  metadata: Record<string, unknown> | null;
}

/** An external Plaid account mapped to an internal Finance account. */
export interface LinkedAccount {
  account_id: string;
  household_id: string;
  currency_code: string;
}

/** Summary of an ingestion run (counts only — never transaction contents). */
export interface IngestionSummary {
  added: number;
  modified: number;
  removed: number;
}

/** Create a stable, data-safe error for a failed ingestion database operation. */
function ingestionDatabaseError(operation: string, provider = 'Plaid'): Error {
  return new Error(`${provider} ingestion failed while ${operation}`);
}

/** Read Plaid credentials from the environment. */
function plaidConfigFromEnv(): PlaidConfig {
  return {
    clientId: Deno.env.get('PLAID_CLIENT_ID') ?? '',
    secret: Deno.env.get('PLAID_SECRET') ?? '',
    environment: Deno.env.get('PLAID_ENVIRONMENT') ?? 'sandbox',
  };
}

/**
 * Build a map of Plaid external account id -> internal linked account.
 * Only accounts that are linked to an internal Finance account participate.
 */
export async function loadLinkedAccounts(
  supabase: AdminClient,
  connectionId: string,
): Promise<Map<string, LinkedAccount>> {
  const { data, error } = await supabase
    .from('bank_connection_accounts')
    .select('external_account_id, account_id, household_id, currency_code, is_linked')
    .eq('bank_connection_id', connectionId)
    .eq('is_linked', true)
    .is('deleted_at', null);

  if (error) {
    throw ingestionDatabaseError('loading linked accounts');
  }

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
 * Upsert one already-mapped transaction record, deduplicating on the provider
 * transaction id. Returns true if a new row was inserted.
 *
 * Provider-agnostic: callers map their provider's payload to a
 * {@link TransactionRecord} first, so Plaid and MX share one persistence path.
 *
 * NEVER logs the record contents.
 */
async function upsertTransactionRecord(
  supabase: AdminClient,
  record: TransactionRecord,
  provider: string,
): Promise<boolean> {
  // Deduplicate on the provider transaction id — provider webhooks may retry.
  const { data: existing, error: lookupError } = await supabase
    .from('transactions')
    .select('id')
    .eq('provider_transaction_id', record.provider_transaction_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (lookupError) {
    throw ingestionDatabaseError('checking for an existing transaction', provider);
  }

  const row = { ...record, imported_at: new Date().toISOString() };

  if (existing) {
    const { error } = await supabase.from('transactions').update(row).eq('id', existing.id);
    if (error) {
      throw ingestionDatabaseError('updating a transaction', provider);
    }
    return false;
  }

  const { error } = await supabase.from('transactions').insert(row);
  if (error) {
    throw ingestionDatabaseError('inserting a transaction', provider);
  }
  return true;
}

/**
 * Upsert a single Plaid transaction into `transactions` with provenance.
 * Returns true if a new row was inserted.
 *
 * NEVER logs the transaction contents.
 */
export async function upsertPlaidTransaction(
  supabase: AdminClient,
  txn: PlaidTransaction,
  account: LinkedAccount,
): Promise<boolean> {
  return upsertTransactionRecord(
    supabase,
    plaidTransactionToRecord(txn, {
      householdId: account.household_id,
      accountId: account.account_id,
      currencyFallback: account.currency_code,
    }),
    'Plaid',
  );
}

/**
 * Upsert a single MX transaction into `transactions` with provenance.
 * Returns true if a new row was inserted.
 *
 * NEVER logs the transaction contents.
 */
export async function upsertMxTransaction(
  supabase: AdminClient,
  txn: MxTransaction,
  account: LinkedAccount,
): Promise<boolean> {
  return upsertTransactionRecord(
    supabase,
    mxTransactionToRecord(txn, {
      householdId: account.household_id,
      accountId: account.account_id,
      currencyFallback: account.currency_code,
    }),
    'MX',
  );
}

/**
 * Soft-delete one removed Plaid transaction and return the number of rows changed.
 */
export async function removePlaidTransaction(
  supabase: AdminClient,
  providerTransactionId: string,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('provider_transaction_id', providerTransactionId)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    throw ingestionDatabaseError('removing a transaction');
  }
  return rows?.length ?? 0;
}

/** Persist the cursor and successful-sync timestamp for a completed ingestion run. */
export async function persistPlaidSyncMetadata(
  supabase: AdminClient,
  connection: BankConnectionRow,
  cursor: string | null,
): Promise<void> {
  const mergedMetadata = { ...(connection.metadata ?? {}), cursor };
  const { error } = await supabase
    .from('bank_connections')
    .update({ metadata: mergedMetadata, last_synced_at: new Date().toISOString() })
    .eq('id', connection.id);

  if (error) {
    throw ingestionDatabaseError('persisting the connection sync cursor');
  }
}

/**
 * Ingest incremental transaction updates for a Plaid connection via
 * /transactions/sync, honoring the stored cursor and persisting the new one.
 *
 * Safe to call for the initial backfill (empty cursor) and for every subsequent
 * webhook-driven delta. Returns aggregate counts only.
 */
export async function ingestPlaidTransactions(
  supabase: AdminClient,
  connection: BankConnectionRow,
  _logger: FunctionLogger,
): Promise<IngestionSummary> {
  const summary: IngestionSummary = { added: 0, modified: 0, removed: 0 };

  const config = plaidConfigFromEnv();
  const encryptionKey = Deno.env.get('BANK_ENCRYPTION_KEY');
  if (!config.clientId || !config.secret || !encryptionKey) {
    throw new Error('Plaid ingestion cannot start because provider configuration is incomplete');
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
      const inserted = await upsertPlaidTransaction(supabase, txn, account);
      if (inserted) summary.added++;
      else summary.modified++;
    }

    for (const removed of page.removed) {
      summary.removed += await removePlaidTransaction(supabase, removed.transaction_id);
    }

    cursor = page.next_cursor;
    hasMore = page.has_more;
  }

  // Persist the advanced cursor for the next sync (merge into metadata).
  await persistPlaidSyncMetadata(supabase, connection, cursor);

  return summary;
}

// ---------------------------------------------------------------------------
// MX ingestion
// ---------------------------------------------------------------------------

/** Read MX credentials from the environment. */
function mxConfigFromEnv(): MxConfig {
  return {
    clientId: Deno.env.get('MX_CLIENT_ID') ?? '',
    apiKey: Deno.env.get('MX_API_KEY') ?? '',
    environment: Deno.env.get('MX_ENVIRONMENT') ?? 'sandbox',
  };
}

/**
 * How far back the FIRST MX sync reaches, in days. MX has no opaque sync
 * cursor, so the initial backfill is expressed as a date window.
 */
export const MX_INITIAL_BACKFILL_DAYS = 90;

/**
 * How far back each SUBSEQUENT MX sync re-reads, in days. MX mutates a
 * transaction in place when it settles (PENDING -> POSTED, and the amount can
 * change), so the window deliberately overlaps already-ingested days. The
 * provider_transaction_id dedupe turns that overlap into updates, not
 * duplicates.
 */
export const MX_INCREMENTAL_OVERLAP_DAYS = 7;

/** Shift a date by a whole number of days and format it as `YYYY-MM-DD`. */
export function shiftDate(from: Date, days: number): string {
  const shifted = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Resolve the `from_date` window for an MX sync run. Pure — unit testable.
 *
 * @param storedFromDate The window persisted by the previous successful run.
 * @param now Injectable clock for deterministic tests.
 */
export function resolveMxFromDate(storedFromDate: string | null, now: Date = new Date()): string {
  if (storedFromDate && /^\d{4}-\d{2}-\d{2}$/.test(storedFromDate)) {
    return storedFromDate;
  }
  return shiftDate(now, -MX_INITIAL_BACKFILL_DAYS);
}

/** Persist the next MX window and successful-sync timestamp. */
export async function persistMxSyncMetadata(
  supabase: AdminClient,
  connection: BankConnectionRow,
  nextFromDate: string,
): Promise<void> {
  const mergedMetadata = { ...(connection.metadata ?? {}), mx_from_date: nextFromDate };
  const { error } = await supabase
    .from('bank_connections')
    .update({ metadata: mergedMetadata, last_synced_at: new Date().toISOString() })
    .eq('id', connection.id);

  if (error) {
    throw ingestionDatabaseError('persisting the connection sync window', 'MX');
  }
}

/**
 * Ingest transactions for an MX connection, honoring the stored date window and
 * advancing it on success.
 *
 * Safe to call for the initial backfill (no stored window -> 90 days) and for
 * every subsequent webhook-driven pull. Returns aggregate counts only — never
 * transaction contents.
 *
 * Unlike Plaid, MX does not report removals in the sync response, so
 * `summary.removed` is always 0; deletions arrive as their own webhook event.
 */
export async function ingestMxTransactions(
  supabase: AdminClient,
  connection: BankConnectionRow,
  _logger: FunctionLogger,
): Promise<IngestionSummary> {
  const summary: IngestionSummary = { added: 0, modified: 0, removed: 0 };

  const config = mxConfigFromEnv();
  const encryptionKey = Deno.env.get('BANK_ENCRYPTION_KEY');
  if (!config.clientId || !config.apiKey || !encryptionKey) {
    throw new Error('MX ingestion cannot start because provider configuration is incomplete');
  }

  const credential = await decryptToken(connection.encrypted_access_token, encryptionKey);
  const { userGuid, memberGuid } = decodeMxCredential(credential);
  const linkedAccounts = await loadLinkedAccounts(supabase, connection.id);

  const fromDate = resolveMxFromDate(
    (connection.metadata?.['mx_from_date'] as string | undefined) ?? null,
  );

  let page = 1;
  let totalPages = 1;
  const MAX_PAGES = 20; // Guard against runaway pagination.

  while (page <= totalPages && page <= MAX_PAGES) {
    const result = await mxGetTransactions(config, userGuid, memberGuid, fromDate, page);
    totalPages = result.pagination.total_pages;

    for (const txn of result.transactions) {
      const account = linkedAccounts.get(txn.account_guid);
      if (!account) continue;
      const inserted = await upsertMxTransaction(supabase, txn, account);
      if (inserted) summary.added++;
      else summary.modified++;
    }

    page++;
  }

  // Advance the window, overlapping recent days so settling transactions are
  // re-read and updated in place rather than missed.
  await persistMxSyncMetadata(
    supabase,
    connection,
    shiftDate(new Date(), -MX_INCREMENTAL_OVERLAP_DAYS),
  );

  return summary;
}
