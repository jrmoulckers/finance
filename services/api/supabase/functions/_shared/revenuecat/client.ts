// SPDX-License-Identifier: BUSL-1.1

import type { RevenueCatConfig } from './config.ts';
import type { RevenueCatEvent } from './normalization.ts';

export class RevenueCatUnavailableError extends Error {
  constructor() {
    super('RevenueCat is temporarily unavailable');
    this.name = 'RevenueCatUnavailableError';
  }
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface SubscriptionSnapshot {
  auto_renewal_status?: unknown;
  country?: unknown;
  current_period_ends_at?: unknown;
  current_period_starts_at?: unknown;
  customer_id?: unknown;
  entitlement_ids?: unknown;
  environment?: unknown;
  gives_access?: unknown;
  id?: unknown;
  management_url?: unknown;
  pending_changes?: unknown;
  product_id?: unknown;
  status?: unknown;
  grace_period_ends_at?: unknown;
  store?: unknown;
  store_subscription_identifier?: unknown;
}

function millis(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function stableReconciliationId(snapshot: SubscriptionSnapshot): Promise<string> {
  const source = JSON.stringify([
    snapshot.id,
    snapshot.product_id,
    snapshot.status,
    snapshot.current_period_starts_at,
    snapshot.current_period_ends_at,
    snapshot.grace_period_ends_at,
    snapshot.environment,
    snapshot.store,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `reconcile_${hex}`;
}

function eventShape(status: string): { type: string; cancelReason?: string } | null {
  switch (status.toLowerCase()) {
    case 'trialing':
      return { type: 'INITIAL_PURCHASE' };
    case 'active':
      return { type: 'RENEWAL' };
    case 'cancelled':
    case 'canceled':
      return { type: 'CANCELLATION', cancelReason: 'UNSUBSCRIBE' };
    case 'in_grace_period':
    case 'in_billing_retry':
      return { type: 'BILLING_ISSUE' };
    case 'paused':
      return { type: 'SUBSCRIPTION_PAUSED' };
    case 'expired':
      return { type: 'EXPIRATION' };
    case 'refunded':
      return { type: 'CANCELLATION', cancelReason: 'REFUND' };
    case 'chargeback':
      return { type: 'CANCELLATION', cancelReason: 'CHARGEBACK' };
    default:
      return null;
  }
}

function providerStore(value: unknown): 'APP_STORE' | 'PLAY_STORE' | null {
  if (value === 'app_store') return 'APP_STORE';
  if (value === 'play_store') return 'PLAY_STORE';
  return null;
}

async function snapshotEvent(
  snapshot: SubscriptionSnapshot,
  config: RevenueCatConfig,
): Promise<RevenueCatEvent | null> {
  const shape = eventShape(String(snapshot.status ?? ''));
  const periodStart = millis(snapshot.current_period_starts_at);
  const periodEnd = millis(snapshot.current_period_ends_at);
  const graceEnd = millis(snapshot.grace_period_ends_at);
  const store = providerStore(snapshot.store);
  const product =
    typeof snapshot.product_id === 'string' ? config.products[snapshot.product_id] : undefined;
  const appId =
    store && product && config.apps[product.appId]?.store === store ? product.appId : null;
  if (
    !shape ||
    typeof snapshot.id !== 'string' ||
    typeof snapshot.customer_id !== 'string' ||
    typeof snapshot.product_id !== 'string' ||
    typeof snapshot.environment !== 'string' ||
    !periodStart ||
    !store ||
    !appId
  ) {
    return null;
  }

  const isTerminal =
    shape.type === 'EXPIRATION' ||
    shape.cancelReason === 'REFUND' ||
    shape.cancelReason === 'CHARGEBACK';
  const effectiveAt = isTerminal ? periodEnd : periodStart;
  if (!effectiveAt) return null;

  return {
    id: await stableReconciliationId(snapshot),
    type: shape.type,
    event_timestamp_ms: effectiveAt,
    provider_order_ms: Math.max(periodStart, periodEnd ?? 0, graceEnd ?? 0),
    app_id: appId,
    app_user_id: snapshot.customer_id,
    original_app_user_id: snapshot.customer_id,
    aliases: [],
    product_id: snapshot.product_id,
    period_type: String(snapshot.status).toLowerCase() === 'trialing' ? 'TRIAL' : 'NORMAL',
    purchased_at_ms: periodStart,
    expiration_at_ms: periodEnd,
    grace_period_expiration_at_ms: graceEnd,
    cancel_reason: shape.cancelReason,
    environment: snapshot.environment,
    store,
    original_transaction_id: snapshot.id,
  };
}

export class RevenueCatClient {
  constructor(
    private readonly config: RevenueCatConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getCustomerEvents(customerId: string): Promise<RevenueCatEvent[]> {
    const firstPage = new URL(
      `${this.config.apiBaseUrl}/projects/${encodeURIComponent(this.config.projectId)}` +
        `/customers/${encodeURIComponent(customerId)}/subscriptions`,
    );
    let pageUrl: URL | null = firstPage;
    const visited = new Set<string>();
    const events: RevenueCatEvent[] = [];

    while (pageUrl) {
      if (visited.has(pageUrl.href)) {
        throw new RevenueCatUnavailableError();
      }
      visited.add(pageUrl.href);

      let response: Response;
      try {
        response = await this.fetchImpl(pageUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new RevenueCatUnavailableError();
      }
      if (!response.ok) throw new RevenueCatUnavailableError();

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new RevenueCatUnavailableError();
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new RevenueCatUnavailableError();
      }
      const envelope = body as Record<string, unknown>;
      if (
        !Array.isArray(envelope.items) ||
        (envelope.next_page !== null && typeof envelope.next_page !== 'string')
      ) {
        throw new RevenueCatUnavailableError();
      }

      for (const item of envelope.items as SubscriptionSnapshot[]) {
        const event = await snapshotEvent(item, this.config);
        if (event) events.push(event);
      }

      if (envelope.next_page === null) {
        pageUrl = null;
        continue;
      }
      const nextPage = new URL(envelope.next_page, firstPage);
      if (
        nextPage.origin !== firstPage.origin ||
        nextPage.pathname !== firstPage.pathname ||
        nextPage.username ||
        nextPage.password
      ) {
        throw new RevenueCatUnavailableError();
      }
      pageUrl = nextPage;
    }
    return events;
  }
}
