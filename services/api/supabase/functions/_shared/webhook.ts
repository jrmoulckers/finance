// SPDX-License-Identifier: BUSL-1.1

/**
 * Webhook dispatch module for external integrations (#683).
 *
 * Provides HMAC-SHA256 payload signing, HTTP delivery with timeout,
 * and exponential-backoff retry logic for webhook event delivery.
 *
 * Security:
 *   - Uses Web Crypto API (crypto.subtle) for HMAC — NOT Node.js crypto.
 *   - NEVER log webhook secrets or raw payload contents.
 *   - Delivery timeout is 10 seconds to prevent Edge Function timeout.
 *   - All endpoints must use HTTPS — HTTP is rejected at the DB level.
 */

import type { Logger } from './logger.ts';
import {
  directOutboundTransport,
  OutboundDestinationError,
  type OutboundHttpTransport,
} from './outbound-destination.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A webhook event to be delivered to subscribed endpoints. */
export interface WebhookEvent {
  /** Event type (e.g. 'transaction.created'). */
  type: string;
  /** The household that owns the entity. */
  household_id: string;
  /** The UUID of the affected entity. */
  entity_id: string;
  /** Event-specific data. NEVER include raw financial amounts. */
  data: Record<string, unknown>;
  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: string;
}

/** Result of a single webhook delivery attempt. */
export interface WebhookDeliveryResult {
  /** Whether the endpoint returned a 2xx status. */
  success: boolean;
  /** HTTP status code returned by the endpoint (if any). */
  status_code?: number;
  /** Error description (if delivery failed). */
  error?: string;
  /** Time taken for the delivery attempt in milliseconds. */
  duration_ms: number;
}

/** A registered webhook endpoint (subset used for delivery). */
export interface WebhookEndpoint {
  /** Endpoint UUID. */
  id: string;
  /** The HTTPS URL to POST events to. */
  url: string;
  /** HMAC-SHA256 signing secret. */
  secret: string;
  /** Event types this endpoint subscribes to. */
  events: string[];
  /** Whether this endpoint is currently active. */
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Valid event types
// ---------------------------------------------------------------------------

/** The complete set of valid webhook event types. */
export const VALID_EVENT_TYPES: ReadonlySet<string> = new Set([
  'transaction.created',
  'transaction.updated',
  'transaction.deleted',
  'account.created',
  'account.updated',
  'account.deleted',
  'budget.created',
  'budget.updated',
  'budget.threshold_reached',
  'goal.created',
  'goal.updated',
  'goal.completed',
  'household.member_joined',
  'household.member_left',
  'invitation.created',
  'invitation.accepted',
]);

// ---------------------------------------------------------------------------
// HMAC signing (Web Crypto API)
// ---------------------------------------------------------------------------

/**
 * Sign a webhook payload with HMAC-SHA256 using the Web Crypto API.
 *
 * @param payload The JSON string payload to sign.
 * @param secret The hex-encoded HMAC secret.
 * @returns A hex-encoded signature prefixed with "sha256=".
 */
export async function signWebhookPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);

  // Convert ArrayBuffer to hex string
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `sha256=${hex}`;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/** Delivery timeout in milliseconds (10 seconds). */
const DELIVERY_TIMEOUT_MS = 10_000;

class WebhookDeliveryTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Webhook delivery exceeded ${timeoutMs}ms`);
    this.name = 'WebhookDeliveryTimeoutError';
  }
}

async function sendWithDeadline(
  transport: OutboundHttpTransport,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new WebhookDeliveryTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      transport.send(url, {
        ...init,
        signal: controller.signal,
      }),
      timeout,
    ]);
  } catch (error) {
    // Abort-aware sends can reject before the timeout promise wins the race.
    if (didTimeout && !(error instanceof WebhookDeliveryTimeoutError)) {
      throw new WebhookDeliveryTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Deliver a webhook event to an endpoint via HTTP POST.
 *
 * Sends the event as a JSON body with HMAC signature and metadata
 * headers. Enforces a 10-second timeout to prevent Edge Function
 * timeout cascade.
 *
 * @param endpoint The webhook endpoint to deliver to.
 * @param event The webhook event to send.
 * @param logger Logger instance (NEVER logs secrets or payload contents).
 * @param transport Validated outbound transport. Injectable for tests or a future egress proxy.
 * @param deliveryTimeoutMs Complete transport deadline. Injectable for deterministic tests.
 * @returns The delivery result with success/failure status and timing.
 */
export async function deliverWebhook(
  endpoint: WebhookEndpoint,
  event: WebhookEvent,
  logger: Logger,
  transport: OutboundHttpTransport = directOutboundTransport,
  deliveryTimeoutMs = DELIVERY_TIMEOUT_MS,
): Promise<WebhookDeliveryResult> {
  const startTime = performance.now();
  const deliveryId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const body = JSON.stringify(event);

  try {
    const signature = await signWebhookPayload(body, endpoint.secret);

    try {
      const response = await sendWithDeadline(
        transport,
        endpoint.url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event.type,
            'X-Webhook-Delivery': deliveryId,
            'X-Webhook-Timestamp': timestamp,
          },
          body,
        },
        deliveryTimeoutMs,
      );

      const durationMs = Math.round(performance.now() - startTime);
      const success = response.status >= 200 && response.status < 300;

      logger.info('Webhook delivery completed', {
        endpointId: endpoint.id,
        deliveryId,
        eventType: event.type,
        statusCode: response.status,
        success,
        duration_ms: durationMs,
      });

      return {
        success,
        status_code: response.status,
        duration_ms: durationMs,
        ...(success ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (fetchError) {
      const durationMs = Math.round(performance.now() - startTime);

      // Distinguish timeout from network error
      const isTimeout = fetchError instanceof WebhookDeliveryTimeoutError;
      const isDestinationRejection = fetchError instanceof OutboundDestinationError;
      const errorMessage = isTimeout
        ? `Timeout after ${fetchError.timeoutMs}ms`
        : isDestinationRejection
          ? 'Webhook destination rejected'
          : `Network error: ${(fetchError as Error).message}`;

      logger.warn('Webhook delivery failed', {
        endpointId: endpoint.id,
        deliveryId,
        eventType: event.type,
        error: errorMessage,
        duration_ms: durationMs,
      });

      return {
        success: false,
        error: errorMessage,
        duration_ms: durationMs,
      };
    }
  } catch (signingError) {
    const durationMs = Math.round(performance.now() - startTime);

    logger.error('Webhook signing failed', {
      endpointId: endpoint.id,
      error: (signingError as Error).message,
      duration_ms: durationMs,
    });

    return {
      success: false,
      error: `Signing error: ${(signingError as Error).message}`,
      duration_ms: durationMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

/**
 * Calculate the retry delay for a given attempt using exponential backoff.
 *
 * Formula: min(2^attemptCount * 1000, 3600000) with ±10% jitter.
 *
 * @param attemptCount The current attempt number (0-based).
 * @returns Delay in milliseconds before the next retry.
 */
export function calculateRetryDelay(attemptCount: number): number {
  const baseDelay = Math.min(Math.pow(2, attemptCount) * 1000, 3_600_000);
  // Add ±10% jitter to avoid thundering herd
  const jitter = baseDelay * 0.1 * (2 * Math.random() - 1);
  return Math.round(baseDelay + jitter);
}

/**
 * Determine whether a delivery should be retried.
 *
 * @param attemptCount The number of attempts already made.
 * @param maxAttempts The maximum number of attempts allowed.
 * @returns True if another retry should be attempted.
 */
export function shouldRetry(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts;
}

// ---------------------------------------------------------------------------
// Event factory
// ---------------------------------------------------------------------------

/**
 * Create a new webhook event with the current timestamp.
 *
 * @param type The event type (e.g. 'transaction.created').
 * @param householdId The household UUID that owns the entity.
 * @param entityId The UUID of the affected entity.
 * @param data Event-specific data. NEVER include raw financial amounts.
 * @returns A fully-formed WebhookEvent.
 */
export function createWebhookEvent(
  type: string,
  householdId: string,
  entityId: string,
  data: Record<string, unknown>,
): WebhookEvent {
  return {
    type,
    household_id: householdId,
    entity_id: entityId,
    data,
    timestamp: new Date().toISOString(),
  };
}
