// SPDX-License-Identifier: BUSL-1.1

/**
 * Plaid REST client for the Deno Edge runtime (#3848).
 *
 * Calls the Plaid API directly over `fetch` — the Plaid Node SDK is NOT used
 * because it is not compatible with the Deno runtime that Supabase Edge
 * Functions execute in.
 *
 * Security:
 *   - Client credentials (PLAID_CLIENT_ID / PLAID_SECRET) are read from the
 *     environment by the caller and passed in — NEVER hard-coded.
 *   - NEVER log access tokens, public tokens, or client secrets.
 *   - Errors surface Plaid's `error_code` only (safe) — never the raw body.
 *
 * Environment mapping (PLAID_ENVIRONMENT):
 *   sandbox      -> https://sandbox.plaid.com
 *   development  -> https://development.plaid.com
 *   production   -> https://production.plaid.com
 */

/** Supported Plaid environments. */
export type PlaidEnvironment = 'sandbox' | 'development' | 'production';

/** Credentials + environment needed for every Plaid call. */
export interface PlaidConfig {
  clientId: string;
  secret: string;
  environment: string;
  /** Optional webhook URL registered with Plaid for async updates. */
  webhookUrl?: string;
}

/** A single transaction returned by /transactions/sync. */
export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string | null;
  merchant_name: string | null;
  pending: boolean;
}

/** Result of a /transactions/sync page. */
export interface PlaidSyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
}

/** A JSON Web Key returned by /webhook_verification_key/get. */
export interface PlaidVerificationKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid?: string;
  use?: string;
  alg?: string;
  expired_at?: number | null;
}

/**
 * An error raised by a Plaid API call. Carries only the safe `error_code`
 * (never the raw body, which may echo sensitive request fields).
 */
export class PlaidApiError extends Error {
  readonly status: number;
  readonly errorCode: string;

  constructor(status: number, errorCode: string) {
    super(`Plaid API error (${status}): ${errorCode}`);
    this.name = 'PlaidApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

const PLAID_BASE_URLS: Record<PlaidEnvironment, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

/**
 * Resolve the Plaid base URL for a given environment string. Falls back to
 * sandbox for unknown values so misconfiguration never targets production.
 */
export function plaidBaseUrl(environment: string): string {
  return PLAID_BASE_URLS[environment as PlaidEnvironment] ?? PLAID_BASE_URLS.sandbox;
}

// ---------------------------------------------------------------------------
// Low-level request helper
// ---------------------------------------------------------------------------

async function plaidPost<T>(
  config: PlaidConfig,
  path: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${plaidBaseUrl(config.environment)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...payload,
    }),
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const errorCode =
      typeof body.error_code === 'string' ? body.error_code : `HTTP_${response.status}`;
    throw new PlaidApiError(response.status, errorCode);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Request builders (pure — unit testable without network)
// ---------------------------------------------------------------------------

/**
 * Build the request body for /link/token/create.
 *
 * @param userId The internal user id — used as Plaid's client_user_id.
 * @param webhookUrl Optional webhook URL for async updates.
 */
export function buildLinkTokenRequest(
  userId: string,
  webhookUrl?: string,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    client_name: 'Finance',
    user: { client_user_id: userId },
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
  };
  if (webhookUrl) {
    request.webhook = webhookUrl;
  }
  return request;
}

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------

/**
 * Create a Plaid Link token. The client uses it to launch Plaid Link.
 */
export async function createLinkToken(
  config: PlaidConfig,
  userId: string,
): Promise<{ link_token: string; expiration: string }> {
  return plaidPost(config, '/link/token/create', buildLinkTokenRequest(userId, config.webhookUrl));
}

/**
 * Exchange a Plaid public token for a long-lived access token + item id.
 *
 * SECURITY: the returned access_token is a bearer credential — NEVER log it,
 * and encrypt it (AES-256-GCM) before persistence.
 */
export async function exchangePublicToken(
  config: PlaidConfig,
  publicToken: string,
): Promise<{ access_token: string; item_id: string }> {
  return plaidPost(config, '/item/public_token/exchange', { public_token: publicToken });
}

/**
 * Permanently invalidate an Item's access token via /item/remove.
 *
 * After this call Plaid stops billing for the Item and the access token can no
 * longer be used. Call this when a user disconnects a connection or deletes
 * their account so the aggregator no longer retains access on their behalf
 * (GDPR Art. 17 / processor deletion propagation — #3867/#3869).
 *
 * SECURITY: NEVER log the access token.
 */
export async function removeItem(
  config: PlaidConfig,
  accessToken: string,
): Promise<{ request_id: string }> {
  return plaidPost<{ request_id: string }>(config, '/item/remove', {
    access_token: accessToken,
  });
}

/**
 * Fetch incremental transaction updates for an item via /transactions/sync.
 *
 * @param cursor The last cursor persisted for the item (empty for first sync).
 */
export async function transactionsSync(
  config: PlaidConfig,
  accessToken: string,
  cursor: string | null,
): Promise<PlaidSyncResult> {
  return plaidPost<PlaidSyncResult>(config, '/transactions/sync', {
    access_token: accessToken,
    cursor: cursor ?? undefined,
    count: 250,
  });
}

/**
 * Fetch the public verification key used to validate Plaid webhook JWTs.
 *
 * @param keyId The `kid` from the webhook JWT header.
 */
export async function getWebhookVerificationKey(
  config: PlaidConfig,
  keyId: string,
): Promise<PlaidVerificationKey | null> {
  const result = await plaidPost<{ key: PlaidVerificationKey | null }>(
    config,
    '/webhook_verification_key/get',
    { key_id: keyId },
  );
  return result.key ?? null;
}

/**
 * Convert a Plaid transaction amount (major units, positive = outflow) to the
 * app's signed integer-cents convention (positive = income, negative =
 * expense) plus the matching transaction `type`.
 *
 * This mirrors the CSV import default in `import-data` where a positive net
 * amount is treated as income and a negative net amount as an expense.
 */
export function plaidAmountToCents(plaidAmount: number): {
  amountCents: number;
  type: 'income' | 'expense';
} {
  const amountCents = -Math.round(plaidAmount * 100);
  return { amountCents, type: amountCents >= 0 ? 'income' : 'expense' };
}

/** Target internal account for an ingested transaction. */
export interface IngestTarget {
  householdId: string;
  accountId: string;
  currencyFallback: string;
}

/** A provenance-tagged transaction row ready to persist. */
export interface TransactionRecord {
  household_id: string;
  account_id: string;
  amount_cents: number;
  currency_code: string;
  type: 'income' | 'expense';
  payee: string | null;
  date: string;
  authorized_date: string | null;
  posted_date: string | null;
  status: 'PENDING' | 'CLEARED';
  source: 'aggregator';
  provider_transaction_id: string;
}

/**
 * Map a Plaid transaction to an internal `transactions` row with provenance
 * columns populated. Pure function — no I/O — so it is unit-testable.
 *
 * NEVER logs the returned record (it describes a financial transaction).
 */
export function plaidTransactionToRecord(
  txn: PlaidTransaction,
  target: IngestTarget,
): TransactionRecord {
  const { amountCents, type } = plaidAmountToCents(txn.amount);
  const currency = txn.iso_currency_code ?? txn.unofficial_currency_code ?? target.currencyFallback;
  return {
    household_id: target.householdId,
    account_id: target.accountId,
    amount_cents: amountCents,
    currency_code: currency,
    type,
    payee: txn.merchant_name ?? txn.name ?? null,
    date: txn.date,
    authorized_date: txn.authorized_date,
    posted_date: txn.pending ? null : txn.date,
    status: txn.pending ? 'PENDING' : 'CLEARED',
    source: 'aggregator',
    provider_transaction_id: txn.transaction_id,
  };
}
