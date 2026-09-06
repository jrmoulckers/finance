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
  id?: unknown;
  app_id?: unknown;
  customer_id?: unknown;
  product_id?: unknown;
  status?: unknown;
  current_period_starts_at?: unknown;
  current_period_ends_at?: unknown;
  grace_period_ends_at?: unknown;
  environment?: unknown;
  store?: unknown;
  updated_at?: unknown;
}

function millis(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function stableReconciliationId(snapshot: SubscriptionSnapshot): Promise<string> {
  const source = JSON.stringify([
    snapshot.id,
    snapshot.product_id,
    snapshot.status,
    snapshot.updated_at,
    snapshot.current_period_ends_at,
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

export class RevenueCatClient {
  constructor(
    private readonly config: RevenueCatConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getCustomerEvents(customerId: string): Promise<RevenueCatEvent[]> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.config.apiBaseUrl}/projects/${encodeURIComponent(this.config.projectId)}` +
          `/customers/${encodeURIComponent(customerId)}/subscriptions`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
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
    if (!Array.isArray(envelope.items)) throw new RevenueCatUnavailableError();

    const events: RevenueCatEvent[] = [];
    for (const item of envelope.items as SubscriptionSnapshot[]) {
      const shape = eventShape(String(item.status ?? ''));
      const generatedAt = millis(item.updated_at);
      const periodStart = millis(item.current_period_starts_at);
      const periodEnd = millis(item.current_period_ends_at);
      if (
        !shape ||
        typeof item.id !== 'string' ||
        typeof item.app_id !== 'string' ||
        typeof item.customer_id !== 'string' ||
        typeof item.product_id !== 'string' ||
        typeof item.environment !== 'string' ||
        typeof item.store !== 'string' ||
        !generatedAt
      ) {
        continue;
      }
      events.push({
        id: await stableReconciliationId(item),
        type: shape.type,
        event_timestamp_ms: generatedAt,
        app_id: item.app_id,
        app_user_id: item.customer_id,
        original_app_user_id: item.customer_id,
        aliases: [],
        product_id: item.product_id,
        period_type: String(item.status).toLowerCase() === 'trialing' ? 'TRIAL' : 'NORMAL',
        purchased_at_ms: periodStart ?? generatedAt,
        expiration_at_ms: periodEnd,
        grace_period_expiration_at_ms: millis(item.grace_period_ends_at),
        cancel_reason: shape.cancelReason,
        environment: item.environment,
        store: item.store,
        original_transaction_id: item.id,
      });
    }
    return events;
  }
}
