// SPDX-License-Identifier: BUSL-1.1

/**
 * MX Platform REST client for the Deno Edge runtime (#4371).
 *
 * Calls the MX Platform API directly over `fetch` — the MX Node SDK is NOT used
 * because it is not compatible with the Deno runtime that Supabase Edge
 * Functions execute in. This mirrors the posture of `plaid.ts`.
 *
 * Security:
 *   - Client credentials (MX_CLIENT_ID / MX_API_KEY) are read from the
 *     environment by the caller and passed in — NEVER hard-coded.
 *   - NEVER log the API key, the Basic auth header, user/member GUIDs paired
 *     with financial values, or raw transaction contents.
 *   - Errors surface MX's `status` + safe error code only — never the raw body,
 *     which can echo request fields.
 *
 * Environment mapping (MX_ENVIRONMENT):
 *   sandbox     -> https://int-api.mx.com   (MX's integration/sandbox host)
 *   integration -> https://int-api.mx.com
 *   production  -> https://api.mx.com
 *
 * Credential model:
 *   MX has no Plaid-style `public_token -> access_token` exchange. A connection
 *   is identified by the pair (user_guid, member_guid). Both are required for
 *   every data call, so they are stored together as a single opaque credential
 *   string (see {@link encodeMxCredential}) which the caller encrypts with
 *   AES-256-GCM exactly like a Plaid access token.
 */

import type { InternalAccountType, IngestTarget, TransactionRecord } from './plaid.ts';

/** Supported MX environments. */
export type MxEnvironment = 'sandbox' | 'integration' | 'production';

/** Credentials + environment needed for every MX call. */
export interface MxConfig {
  clientId: string;
  apiKey: string;
  environment: string;
}

/** A single account returned by the accounts endpoint. */
export interface MxAccount {
  guid: string;
  name: string | null;
  account_number: string | null;
  type: string | null;
  subtype: string | null;
  balance: number | null;
  available_balance: number | null;
  currency_code: string | null;
}

/** A single transaction returned by the transactions endpoint. */
export interface MxTransaction {
  guid: string;
  account_guid: string;
  amount: number;
  currency_code: string | null;
  date: string | null;
  transacted_at: string | null;
  posted_at: string | null;
  description: string | null;
  payee: string | null;
  status: string | null;
  type: string | null;
  is_expense: boolean | null;
  is_income: boolean | null;
}

/** MX pagination envelope, present on every list response. */
export interface MxPagination {
  current_page: number;
  total_pages: number;
}

/** Result of a single page of transactions. */
export interface MxTransactionsPage {
  transactions: MxTransaction[];
  pagination: MxPagination;
}

/**
 * An error raised by an MX API call. Carries only the safe status + error code
 * (never the raw body, which may echo sensitive request fields).
 */
export class MxApiError extends Error {
  readonly status: number;
  readonly errorCode: string;

  constructor(status: number, errorCode: string) {
    super(`MX API error (${status}): ${errorCode}`);
    this.name = 'MxApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

const MX_BASE_URLS: Record<MxEnvironment, string> = {
  sandbox: 'https://int-api.mx.com',
  integration: 'https://int-api.mx.com',
  production: 'https://api.mx.com',
};

/**
 * Resolve the MX base URL for a given environment string. Falls back to the
 * integration host for unknown values so misconfiguration never targets
 * production (same fail-safe direction as {@link plaidBaseUrl}).
 */
export function mxBaseUrl(environment: string): string {
  return MX_BASE_URLS[environment as MxEnvironment] ?? MX_BASE_URLS.sandbox;
}

/**
 * Build the headers for an MX request. Exported for unit tests so the auth
 * composition is verifiable without a network call.
 *
 * SECURITY: the returned object contains the Basic credential — NEVER log it.
 */
export function mxHeaders(config: MxConfig): Record<string, string> {
  const basic = btoa(`${config.clientId}:${config.apiKey}`);
  return {
    Accept: 'application/vnd.mx.api.v1+json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${basic}`,
  };
}

// ---------------------------------------------------------------------------
// Low-level request helper
// ---------------------------------------------------------------------------

async function mxRequest<T>(
  config: MxConfig,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${mxBaseUrl(config.environment)}${path}`, {
    method,
    headers: mxHeaders(config),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  // DELETE and other 204s carry no body.
  if (response.status === 204) {
    if (!response.ok) throw new MxApiError(response.status, `HTTP_${response.status}`);
    return {} as T;
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error = body.error as { message?: unknown; status?: unknown } | undefined;
    // MX returns a human-readable `error.message`; it can echo request fields,
    // so only a coarse, non-sensitive code is surfaced.
    const errorCode = typeof error?.status === 'string' ? error.status : `HTTP_${response.status}`;
    throw new MxApiError(response.status, errorCode);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Credential encoding
// ---------------------------------------------------------------------------

const MX_CREDENTIAL_SEPARATOR = ':';

/**
 * Encode the (user_guid, member_guid) pair into the single opaque credential
 * string persisted in `bank_connections.encrypted_access_token`.
 *
 * Pure — no I/O — so it is unit-testable.
 */
export function encodeMxCredential(userGuid: string, memberGuid: string): string {
  return `${userGuid}${MX_CREDENTIAL_SEPARATOR}${memberGuid}`;
}

/**
 * Decode a stored MX credential back into its parts.
 *
 * @throws Error when the credential is not a well-formed pair. The error text
 *   NEVER includes the credential itself.
 */
export function decodeMxCredential(credential: string): {
  userGuid: string;
  memberGuid: string;
} {
  const parts = credential.split(MX_CREDENTIAL_SEPARATOR);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Stored MX credential is malformed');
  }
  return { userGuid: parts[0], memberGuid: parts[1] };
}

// ---------------------------------------------------------------------------
// API operations
// ---------------------------------------------------------------------------

/** Shape of MX's `/users` responses (single and list). */
interface MxUserResponse {
  user?: { guid?: string };
}
interface MxUsersListResponse {
  users?: Array<{ guid?: string; id?: string }>;
}

/**
 * Resolve the MX user GUID for an internal Finance user id, creating the MX
 * user on first use.
 *
 * MX keys its users by an opaque GUID, but accepts a caller-supplied external
 * `id`. The internal user id is used as that `id` so the mapping is derivable
 * on every subsequent call without persisting extra state.
 *
 * SECURITY: the internal user id is a random UUID, not PII. NEVER pass an email
 * or any other identifying attribute here — MX would then hold it.
 */
export async function ensureUser(config: MxConfig, externalUserId: string): Promise<string> {
  const existing = await mxRequest<MxUsersListResponse>(
    config,
    'GET',
    `/users?id=${encodeURIComponent(externalUserId)}`,
  );
  const found = existing.users?.find((u) => u.id === externalUserId)?.guid;
  if (found) return found;

  const created = await mxRequest<MxUserResponse>(config, 'POST', '/users', {
    user: { id: externalUserId },
  });
  const guid = created.user?.guid;
  if (!guid) {
    throw new MxApiError(502, 'USER_GUID_MISSING');
  }
  return guid;
}

/**
 * Build the request body for a connect-widget URL. Pure — unit testable.
 *
 * `ui_message_version: 4` is required for the widget to post back the
 * `member_guid` the client returns to `?action=exchange_token`.
 */
export function buildWidgetUrlRequest(): Record<string, unknown> {
  return {
    widget_url: {
      widget_type: 'connect_widget',
      is_mobile_webview: false,
      ui_message_version: 4,
      color_scheme: 'light',
    },
  };
}

/**
 * Create an MX connect-widget URL for a user.
 *
 * This is MX's analogue of a Plaid Link token: the client opens the returned
 * URL, the user authenticates with their institution, and the widget posts back
 * a `member_guid`.
 *
 * @returns The widget URL plus an expiration matching MX's 30-minute window.
 */
export async function createWidgetUrl(
  config: MxConfig,
  userGuid: string,
): Promise<{ link_token: string; expiration: string }> {
  const result = await mxRequest<{ widget_url?: { url?: string } }>(
    config,
    'POST',
    `/users/${encodeURIComponent(userGuid)}/widget_urls`,
    buildWidgetUrlRequest(),
  );
  const url = result.widget_url?.url;
  if (!url) {
    throw new MxApiError(502, 'WIDGET_URL_MISSING');
  }
  return {
    link_token: url,
    expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

/**
 * List the accounts belonging to a connected member.
 *
 * Called at connection time to discover which external accounts exist so they
 * can be provisioned + linked to internal Finance accounts. Account linking is
 * a hard prerequisite for transaction ingestion, which drops any transaction
 * whose external account is not linked.
 */
export async function getAccounts(
  config: MxConfig,
  userGuid: string,
  memberGuid: string,
): Promise<{ accounts: MxAccount[] }> {
  const result = await mxRequest<{ accounts?: MxAccount[] }>(
    config,
    'GET',
    `/users/${encodeURIComponent(userGuid)}/members/${encodeURIComponent(memberGuid)}/accounts?records_per_page=100`,
  );
  return { accounts: result.accounts ?? [] };
}

/**
 * Fetch one page of a member's transactions within a date window.
 *
 * MX has no Plaid-style opaque sync cursor, so incremental sync is expressed as
 * a `from_date` window (see `bank-ingest`), paginated via `pagination`.
 *
 * @param fromDate Inclusive lower bound, `YYYY-MM-DD`.
 * @param page 1-based page number.
 */
export async function getTransactions(
  config: MxConfig,
  userGuid: string,
  memberGuid: string,
  fromDate: string,
  page: number,
): Promise<MxTransactionsPage> {
  const query = new URLSearchParams({
    from_date: fromDate,
    page: String(page),
    records_per_page: '100',
  });
  const result = await mxRequest<{
    transactions?: MxTransaction[];
    pagination?: MxPagination;
  }>(
    config,
    'GET',
    `/users/${encodeURIComponent(userGuid)}/members/${encodeURIComponent(memberGuid)}/transactions?${query.toString()}`,
  );
  return {
    transactions: result.transactions ?? [],
    pagination: result.pagination ?? { current_page: page, total_pages: page },
  };
}

/**
 * Permanently delete a member at MX, revoking the credentials the user granted.
 *
 * Call this when a user disconnects a connection or deletes their account so the
 * aggregator no longer retains access on their behalf (GDPR Art. 17 / processor
 * deletion propagation — mirrors Plaid's `/item/remove`).
 */
export async function deleteMember(
  config: MxConfig,
  userGuid: string,
  memberGuid: string,
): Promise<void> {
  await mxRequest<Record<string, never>>(
    config,
    'DELETE',
    `/users/${encodeURIComponent(userGuid)}/members/${encodeURIComponent(memberGuid)}`,
  );
}

// ---------------------------------------------------------------------------
// Mapping helpers (pure — unit testable without network)
// ---------------------------------------------------------------------------

/**
 * Map an MX account `type`/`subtype` to the app's canonical internal account
 * type. Pure — no I/O — so it is unit-testable. Falls back to 'OTHER'.
 *
 * @see https://docs.mx.com/api-reference/platform-api/reference/accounts
 */
export function mxAccountTypeToInternal(
  type: string | null,
  subtype: string | null,
): InternalAccountType {
  const t = (type ?? '').toUpperCase();
  const s = (subtype ?? '').toUpperCase();

  if (t === 'CREDIT_CARD') return 'CREDIT_CARD';
  if (t === 'LOAN' || t === 'MORTGAGE' || t === 'LINE_OF_CREDIT') return 'LOAN';
  if (t === 'INVESTMENT') return 'INVESTMENT';
  if (t === 'CASH' || t === 'PREPAID') return 'CASH';
  if (t === 'SAVINGS') return 'SAVINGS';
  if (t === 'CHECKING') {
    // MX reports money-market and CD balances as CHECKING with a subtype.
    if (s === 'MONEY_MARKET' || s === 'CERTIFICATE_OF_DEPOSIT') return 'SAVINGS';
    return 'CHECKING';
  }
  return 'OTHER';
}

/**
 * Convert an MX transaction amount to the app's signed integer-cents convention
 * (positive = income, negative = expense).
 *
 * MX reports `amount` as a POSITIVE magnitude and carries the direction in
 * `type` (`DEBIT`/`CREDIT`) plus the `is_expense`/`is_income` booleans. This is
 * the inverse of Plaid's signed convention, so the two must not share a mapper.
 * `is_expense` is preferred because MX populates it even when `type` is absent.
 */
export function mxAmountToCents(txn: {
  amount: number;
  type?: string | null;
  is_expense?: boolean | null;
  is_income?: boolean | null;
}): { amountCents: number; type: 'income' | 'expense' } {
  const magnitude = Math.round(Math.abs(txn.amount) * 100);

  let isExpense: boolean;
  if (typeof txn.is_expense === 'boolean') {
    isExpense = txn.is_expense;
  } else if (typeof txn.is_income === 'boolean') {
    isExpense = !txn.is_income;
  } else {
    isExpense = (txn.type ?? '').toUpperCase() !== 'CREDIT';
  }

  const amountCents = isExpense ? -magnitude : magnitude;
  return { amountCents, type: isExpense ? 'expense' : 'income' };
}

/** Normalize an MX timestamp (ISO 8601 or `YYYY-MM-DD`) to a calendar date. */
function toCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

/**
 * Map an MX transaction to an internal `transactions` row with provenance
 * columns populated. Pure function — no I/O — so it is unit-testable.
 *
 * NEVER logs the returned record (it describes a financial transaction).
 */
export function mxTransactionToRecord(txn: MxTransaction, target: IngestTarget): TransactionRecord {
  const { amountCents, type } = mxAmountToCents(txn);
  const isPending = (txn.status ?? '').toUpperCase() === 'PENDING';
  const transactedDate = toCalendarDate(txn.date ?? txn.transacted_at);
  const postedDate = toCalendarDate(txn.posted_at);

  return {
    household_id: target.householdId,
    account_id: target.accountId,
    amount_cents: amountCents,
    currency_code: txn.currency_code ?? target.currencyFallback,
    type,
    payee: txn.payee ?? txn.description ?? null,
    // MX always carries at least one usable timestamp; fall back to the posted
    // date so a row is never written with a null NOT NULL date.
    date: transactedDate ?? postedDate ?? new Date().toISOString().slice(0, 10),
    authorized_date: transactedDate,
    posted_date: isPending ? null : postedDate,
    status: isPending ? 'PENDING' : 'CLEARED',
    source: 'aggregator',
    provider_transaction_id: txn.guid,
  };
}

// ---------------------------------------------------------------------------
// Webhook contract
// ---------------------------------------------------------------------------

/**
 * An MX webhook payload.
 *
 * MX dispatches on a `type` (event category) plus an `action` within that
 * category. It sends **no** `event_type` field — an earlier revision of the
 * webhook handler declared one, so every real delivery matched no branch,
 * returned 200, and was never retried.
 *
 * Every field is optional because the payload is attacker-influenced input:
 * the handler must degrade rather than throw on an unexpected shape.
 */
export interface MxWebhookEvent {
  /** Event category, e.g. `AGGREGATION` or `CONNECTION_STATUS`. */
  type?: string;
  /** Action within the category, e.g. `member_data_updated` or `CHANGED`. */
  action?: string;
  member_guid?: string;
  user_guid?: string;
  /** Present on CONNECTION_STATUS events, e.g. `CHALLENGED`, `EXPIRED`. */
  connection_status?: string;
  transactions_created_count?: number;
  transactions_updated_count?: number;
}

/** What the webhook handler should do with an MX event. */
export type MxWebhookDisposition = 'ingest' | 'needs_reauth' | 'unhandled';

/**
 * Decide how to handle an MX webhook event.
 *
 * MX only emits `CONNECTION_STATUS` when a member enters an actionable state
 * (CHALLENGED, DENIED, EXPIRED, IMPAIRED, IMPEDED, LOCKED, PREVENTED,
 * REJECTED), all of which require the user to revisit the connection — so the
 * category alone is sufficient to mark the connection as needing re-auth.
 *
 * Anything else is `unhandled`, which the caller must log rather than silently
 * accept: MX treats a 200 as delivered and never retries.
 */
export function classifyMxWebhookEvent(event: MxWebhookEvent): MxWebhookDisposition {
  switch (event.type) {
    case 'AGGREGATION':
      return 'ingest';
    case 'CONNECTION_STATUS':
      return 'needs_reauth';
    default:
      return 'unhandled';
  }
}
