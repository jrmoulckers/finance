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
  store?: unknown;
  store_subscription_identifier?: unknown;
}

interface SubscriptionTransaction {
  id?: unknown;
  object?: unknown;
  purchased_at?: unknown;
}

interface StoreTransaction {
  id: string;
  purchasedAt: number;
}

function millis(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function stableReconciliationId(
  snapshot: SubscriptionSnapshot,
  storeTransactionIds: readonly string[],
): Promise<string> {
  const source = JSON.stringify([
    snapshot.id,
    snapshot.product_id,
    snapshot.status,
    snapshot.current_period_starts_at,
    snapshot.current_period_ends_at,
    snapshot.gives_access,
    snapshot.environment,
    snapshot.store,
    storeTransactionIds,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `reconcile_${hex}`;
}

interface SnapshotEventShape {
  type: string;
  cancelReason?: string;
  terminalAt: 'period_start' | 'period_end' | null;
}

function eventShape(statusValue: unknown, givesAccess: unknown): SnapshotEventShape | null {
  const status = String(statusValue ?? '').toLowerCase();
  if (typeof givesAccess !== 'boolean') {
    throw new RevenueCatUnavailableError();
  }

  switch (status) {
    case 'trialing':
      return givesAccess
        ? { type: 'INITIAL_PURCHASE', terminalAt: null }
        : { type: 'EXPIRATION', terminalAt: 'period_start' };
    case 'active':
      return givesAccess
        ? { type: 'RENEWAL', terminalAt: null }
        : { type: 'EXPIRATION', terminalAt: 'period_start' };
    case 'cancelled':
    case 'canceled':
      return givesAccess
        ? {
            type: 'CANCELLATION',
            cancelReason: 'UNSUBSCRIBE',
            terminalAt: null,
          }
        : { type: 'EXPIRATION', terminalAt: 'period_start' };
    case 'in_grace_period':
      if (givesAccess) throw new RevenueCatUnavailableError();
      return { type: 'EXPIRATION', terminalAt: 'period_start' };
    case 'in_billing_retry':
      return { type: 'EXPIRATION', terminalAt: 'period_start' };
    case 'paused':
      return givesAccess
        ? { type: 'SUBSCRIPTION_PAUSED', terminalAt: null }
        : { type: 'EXPIRATION', terminalAt: 'period_start' };
    case 'expired':
      return { type: 'EXPIRATION', terminalAt: 'period_end' };
    case 'refunded':
      return {
        type: 'CANCELLATION',
        cancelReason: 'REFUND',
        terminalAt: 'period_end',
      };
    case 'chargeback':
      return {
        type: 'CANCELLATION',
        cancelReason: 'CHARGEBACK',
        terminalAt: 'period_end',
      };
    default:
      if (givesAccess) throw new RevenueCatUnavailableError();
      return { type: 'EXPIRATION', terminalAt: 'period_start' };
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
  getStoreTransactions: (subscriptionId: string) => Promise<readonly StoreTransaction[]>,
): Promise<RevenueCatEvent | null> {
  if (
    typeof snapshot.environment === 'string' &&
    snapshot.environment.toLowerCase() !== config.environment
  ) {
    return null;
  }
  const shape = eventShape(snapshot.status, snapshot.gives_access);
  if (!shape) return null;

  const periodStart = millis(snapshot.current_period_starts_at);
  const periodEnd = millis(snapshot.current_period_ends_at);
  const store = providerStore(snapshot.store);
  const product =
    typeof snapshot.product_id === 'string'
      ? Object.values(config.products).find(
          (candidate) => candidate.revenueCatProductId === snapshot.product_id,
        )
      : undefined;
  const appId =
    store && product && config.apps[product.appId]?.store === store ? product.appId : null;
  if (!store || !appId) return null;
  if (
    typeof snapshot.id !== 'string' ||
    typeof snapshot.customer_id !== 'string' ||
    typeof snapshot.product_id !== 'string' ||
    typeof snapshot.environment !== 'string' ||
    typeof snapshot.store_subscription_identifier !== 'string'
  ) {
    throw new RevenueCatUnavailableError();
  }
  const storeTransactions = await getStoreTransactions(snapshot.id);
  const orderedTransactions = [...storeTransactions].sort(
    (left, right) => left.purchasedAt - right.purchasedAt || left.id.localeCompare(right.id),
  );
  const storeTransactionIds = [
    ...new Set(orderedTransactions.map((transaction) => transaction.id)),
  ];
  if (
    storeTransactionIds.length === 0 ||
    !storeTransactionIds.includes(snapshot.store_subscription_identifier)
  ) {
    throw new RevenueCatUnavailableError();
  }
  if (!periodStart || (!periodEnd && shape.type !== 'EXPIRATION')) {
    throw new RevenueCatUnavailableError();
  }
  const terminalAt =
    shape.terminalAt === 'period_start'
      ? periodStart
      : shape.terminalAt === 'period_end'
        ? periodEnd
        : null;
  if (shape.terminalAt && !terminalAt) throw new RevenueCatUnavailableError();
  const effectiveAt = terminalAt ?? periodStart;

  return {
    id: await stableReconciliationId(snapshot, storeTransactionIds),
    type: shape.type,
    event_timestamp_ms: effectiveAt,
    provider_order_ms: Math.max(periodStart, periodEnd ?? 0),
    app_id: appId,
    app_user_id: snapshot.customer_id,
    original_app_user_id: snapshot.customer_id,
    aliases: [],
    product_id: snapshot.product_id,
    period_type: String(snapshot.status).toLowerCase() === 'trialing' ? 'TRIAL' : 'NORMAL',
    purchased_at_ms: periodStart,
    expiration_at_ms: shape.type === 'EXPIRATION' ? terminalAt : periodEnd,
    grace_period_expiration_at_ms: null,
    cancel_reason: shape.cancelReason,
    environment: snapshot.environment,
    store,
    original_transaction_id: storeTransactionIds[0],
    revenuecat_subscription_id: snapshot.id,
    store_transaction_ids: storeTransactionIds,
  };
}

export class RevenueCatClient {
  constructor(
    private readonly config: RevenueCatConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async requestJson(pageUrl: URL): Promise<Record<string, unknown>> {
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
    return body as Record<string, unknown>;
  }

  private nextPage(value: unknown, firstPage: URL, environment?: string): URL | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !value.trim()) throw new RevenueCatUnavailableError();
    const nextPage = new URL(value, firstPage);
    if (
      nextPage.origin !== firstPage.origin ||
      nextPage.pathname !== firstPage.pathname ||
      nextPage.username ||
      nextPage.password
    ) {
      throw new RevenueCatUnavailableError();
    }
    if (environment) {
      if (
        nextPage.searchParams.has('environment') &&
        nextPage.searchParams.get('environment') !== environment
      ) {
        throw new RevenueCatUnavailableError();
      }
      nextPage.searchParams.set('environment', environment);
    }
    return nextPage;
  }

  private async getStoreTransactions(subscriptionId: string): Promise<StoreTransaction[]> {
    const firstPage = new URL(
      `${this.config.apiBaseUrl}/projects/${encodeURIComponent(this.config.projectId)}` +
        `/subscriptions/${encodeURIComponent(subscriptionId)}/transactions`,
    );
    firstPage.searchParams.set('limit', '100');
    firstPage.searchParams.set('sort', 'purchased_at');
    firstPage.searchParams.set('direction', 'asc');
    let pageUrl: URL | null = firstPage;
    const visited = new Set<string>();
    const transactions: StoreTransaction[] = [];

    while (pageUrl) {
      if (visited.has(pageUrl.href)) throw new RevenueCatUnavailableError();
      visited.add(pageUrl.href);
      const envelope = await this.requestJson(pageUrl);
      if (!Array.isArray(envelope.items)) throw new RevenueCatUnavailableError();

      for (const item of envelope.items as SubscriptionTransaction[]) {
        if (
          item.object !== 'subscription_transaction' ||
          typeof item.id !== 'string' ||
          !item.id.trim() ||
          item.id.length > 255 ||
          !millis(item.purchased_at)
        ) {
          throw new RevenueCatUnavailableError();
        }
        transactions.push({ id: item.id, purchasedAt: item.purchased_at as number });
      }
      pageUrl = this.nextPage(envelope.next_page, firstPage);
    }
    return transactions;
  }

  async getCustomerEvents(customerId: string): Promise<RevenueCatEvent[]> {
    const firstPage = new URL(
      `${this.config.apiBaseUrl}/projects/${encodeURIComponent(this.config.projectId)}` +
        `/customers/${encodeURIComponent(customerId)}/subscriptions`,
    );
    firstPage.searchParams.set('environment', this.config.environment);
    let pageUrl: URL | null = firstPage;
    const visited = new Set<string>();
    const events: RevenueCatEvent[] = [];

    while (pageUrl) {
      if (visited.has(pageUrl.href)) {
        throw new RevenueCatUnavailableError();
      }
      visited.add(pageUrl.href);

      const envelope = await this.requestJson(pageUrl);
      if (!Array.isArray(envelope.items)) {
        throw new RevenueCatUnavailableError();
      }

      for (const item of envelope.items as SubscriptionSnapshot[]) {
        const event = await snapshotEvent(item, this.config, (subscriptionId) =>
          this.getStoreTransactions(subscriptionId),
        );
        if (event) events.push(event);
      }

      pageUrl = this.nextPage(envelope.next_page, firstPage, this.config.environment);
    }
    return events;
  }
}
