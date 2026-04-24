// SPDX-License-Identifier: BUSL-1.1

/**
 * Webhook verification module for incoming webhooks (#1104).
 *
 * Provides HMAC signature verification, replay attack prevention
 * (nonce + timestamp), and IP allowlisting for known providers
 * (Plaid, Stripe).
 *
 * Security:
 *   - Verifies HMAC-SHA256 signature using timing-safe comparison
 *   - Rejects requests with timestamps older than 5 minutes (replay)
 *   - Validates nonce uniqueness via database (one-time use)
 *   - Checks source IP against provider allowlist
 *   - NEVER log webhook secrets or raw payload contents
 */

import { timingSafeEqual } from './crypto.ts';
import { signWebhookPayload } from './webhook.ts';
import { getClientIp } from './rate-limit.ts';
import type { Logger } from './logger.ts';
import type { RpcClient } from './rate-limit.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of incoming webhook verification. */
export interface WebhookVerificationResult {
  /** Whether the webhook passed all security checks. */
  valid: boolean;
  /** Human-readable reason if verification failed. */
  reason?: string;
  /** Which check failed (for logging, not for responses). */
  failedCheck?: 'signature' | 'timestamp' | 'nonce' | 'ip_allowlist' | 'missing_headers';
}

/** Configuration for a webhook provider. */
export interface WebhookProviderConfig {
  /** Provider name (e.g. 'stripe', 'plaid'). */
  name: string;
  /** The HMAC signing secret for this provider. */
  signingSecret: string;
  /** Header name containing the HMAC signature. */
  signatureHeader: string;
  /** Header name containing the delivery timestamp. */
  timestampHeader: string;
  /** Header name containing the nonce/delivery ID. */
  nonceHeader: string;
  /** Maximum age of a webhook in seconds (default: 300 = 5 min). */
  maxAgeSecs?: number;
  /** Whether to enforce IP allowlisting (default: true). */
  enforceIpAllowlist?: boolean;
}

// ---------------------------------------------------------------------------
// Pre-configured providers
// ---------------------------------------------------------------------------

/** Provider configurations for known webhook sources. */
export const WEBHOOK_PROVIDERS: Record<string, Omit<WebhookProviderConfig, 'signingSecret'>> = {
  stripe: {
    name: 'stripe',
    signatureHeader: 'stripe-signature',
    timestampHeader: 'stripe-signature', // Stripe embeds timestamp in signature header
    nonceHeader: 'stripe-signature', // Stripe uses a unique format: t=timestamp,v1=signature
    maxAgeSecs: 300,
    enforceIpAllowlist: true,
  },
  plaid: {
    name: 'plaid',
    signatureHeader: 'plaid-verification',
    timestampHeader: 'x-plaid-timestamp',
    nonceHeader: 'x-plaid-request-id',
    maxAgeSecs: 300,
    enforceIpAllowlist: true,
  },
  internal: {
    name: 'internal',
    signatureHeader: 'x-webhook-signature',
    timestampHeader: 'x-webhook-timestamp',
    nonceHeader: 'x-webhook-delivery',
    maxAgeSecs: 300,
    enforceIpAllowlist: false,
  },
};

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the HMAC-SHA256 signature of an incoming webhook payload.
 *
 * @param payload The raw request body string.
 * @param signature The signature from the request header.
 * @param secret The HMAC signing secret.
 * @returns true if the signature matches.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // Compute expected signature
  const expected = await signWebhookPayload(payload, secret);

  // Compare using timing-safe comparison
  return timingSafeEqual(expected, signature);
}

// ---------------------------------------------------------------------------
// Timestamp validation
// ---------------------------------------------------------------------------

/**
 * Validate that a webhook timestamp is within the acceptable window.
 *
 * Rejects webhooks older than maxAgeSecs to prevent replay attacks
 * using captured payloads.
 *
 * @param timestamp ISO 8601 timestamp or Unix epoch seconds string.
 * @param maxAgeSecs Maximum age in seconds (default: 300).
 * @returns true if the timestamp is within the acceptable window.
 */
export function isTimestampValid(timestamp: string, maxAgeSecs: number = 300): boolean {
  let ts: number;

  // Try parsing as Unix epoch seconds (Stripe format)
  const epoch = parseInt(timestamp, 10);
  if (!isNaN(epoch) && epoch > 1_000_000_000) {
    ts = epoch * 1000; // Convert to milliseconds
  } else {
    // Try ISO 8601
    ts = new Date(timestamp).getTime();
  }

  if (isNaN(ts)) return false;

  const now = Date.now();
  const age = Math.abs(now - ts) / 1000;

  return age <= maxAgeSecs;
}

// ---------------------------------------------------------------------------
// Full verification pipeline
// ---------------------------------------------------------------------------

/**
 * Verify an incoming webhook request through the full security pipeline:
 *   1. Check required headers are present
 *   2. Verify HMAC signature (timing-safe)
 *   3. Validate timestamp (replay window)
 *   4. Validate nonce uniqueness (replay prevention)
 *   5. Check source IP against provider allowlist
 *
 * @param req The incoming webhook request.
 * @param payload The raw request body string.
 * @param config The webhook provider configuration.
 * @param supabase Supabase client for nonce/IP checks.
 * @param logger Logger instance.
 * @returns Verification result with pass/fail and reason.
 */
export async function verifyIncomingWebhook(
  req: Request,
  payload: string,
  config: WebhookProviderConfig,
  supabase: RpcClient & {
    rpc(
      fn: string,
      params?: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  logger: Logger,
): Promise<WebhookVerificationResult> {
  const maxAge = config.maxAgeSecs ?? 300;

  // ── Step 1: Check required headers ─────────────────────────────────
  const signature = req.headers.get(config.signatureHeader);
  if (!signature) {
    logger.warn('Webhook missing signature header', {
      provider: config.name,
      header: config.signatureHeader,
    });
    return {
      valid: false,
      reason: 'Missing signature header',
      failedCheck: 'missing_headers',
    };
  }

  // ── Step 2: Verify HMAC signature ──────────────────────────────────
  const signatureValid = await verifyWebhookSignature(
    payload,
    signature,
    config.signingSecret,
  );

  if (!signatureValid) {
    logger.warn('Webhook signature verification failed', {
      provider: config.name,
    });
    return {
      valid: false,
      reason: 'Invalid signature',
      failedCheck: 'signature',
    };
  }

  // ── Step 3: Validate timestamp ─────────────────────────────────────
  const timestampHeader = req.headers.get(config.timestampHeader);
  if (timestampHeader && config.timestampHeader !== config.signatureHeader) {
    if (!isTimestampValid(timestampHeader, maxAge)) {
      logger.warn('Webhook timestamp outside acceptable window', {
        provider: config.name,
        maxAgeSecs: maxAge,
      });
      return {
        valid: false,
        reason: 'Timestamp too old or too far in the future',
        failedCheck: 'timestamp',
      };
    }
  }

  // ── Step 4: Validate nonce ─────────────────────────────────────────
  const nonce = req.headers.get(config.nonceHeader);
  if (nonce && config.nonceHeader !== config.signatureHeader) {
    try {
      const { data, error } = await supabase.rpc('validate_webhook_nonce', {
        p_nonce: nonce,
        p_provider: config.name,
        p_ttl_seconds: maxAge * 2, // Keep nonces for 2x the replay window
      });

      if (error) {
        // Fail open on DB errors — don't block webhooks due to infra issues
        logger.warn('Nonce validation DB error — failing open', {
          provider: config.name,
          errorMessage: error.message,
        });
      } else if (data) {
        const result = data as { valid: boolean; reason: string | null };
        if (!result.valid) {
          logger.warn('Webhook nonce already used (replay attempt)', {
            provider: config.name,
          });
          return {
            valid: false,
            reason: 'Nonce already used — possible replay attack',
            failedCheck: 'nonce',
          };
        }
      }
    } catch {
      // Fail open
      logger.warn('Nonce validation error — failing open', {
        provider: config.name,
      });
    }
  }

  // ── Step 5: Check IP allowlist ─────────────────────────────────────
  if (config.enforceIpAllowlist !== false) {
    const clientIp = getClientIp(req);

    if (clientIp) {
      try {
        const { data, error } = await supabase.rpc('check_webhook_ip_allowed', {
          p_provider: config.name,
          p_ip_address: clientIp,
        });

        if (error) {
          // Fail open on DB errors
          logger.warn('IP allowlist check DB error — failing open', {
            provider: config.name,
            errorMessage: error.message,
          });
        } else if (data === false) {
          logger.warn('Webhook from non-allowlisted IP', {
            provider: config.name,
          });
          return {
            valid: false,
            reason: 'Source IP not in provider allowlist',
            failedCheck: 'ip_allowlist',
          };
        }
      } catch {
        // Fail open
        logger.warn('IP allowlist check error — failing open', {
          provider: config.name,
        });
      }
    }
  }

  // All checks passed
  return { valid: true };
}

/**
 * Build a standardised 401 response for failed webhook verification.
 *
 * Returns a generic error that does NOT reveal which check failed
 * (to avoid helping attackers adapt).
 */
export function webhookVerificationFailedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Webhook verification failed' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
