// SPDX-License-Identifier: BUSL-1.1
/**
 * Webhook verification module for incoming webhooks (#1104).
 * HMAC signature verification, replay prevention, IP allowlisting.
 */
import { timingSafeEqual } from './crypto.ts';
import { signWebhookPayload } from './webhook.ts';
import { getClientIp } from './rate-limit.ts';
import type { Logger } from './logger.ts';
import type { RpcClient } from './rate-limit.ts';

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
  failedCheck?: 'signature' | 'timestamp' | 'nonce' | 'ip_allowlist' | 'missing_headers';
}

export interface WebhookProviderConfig {
  name: string;
  signingSecret: string;
  signatureHeader: string;
  timestampHeader: string;
  nonceHeader: string;
  maxAgeSecs?: number;
  enforceIpAllowlist?: boolean;
}

export const WEBHOOK_PROVIDERS: Record<string, Omit<WebhookProviderConfig, 'signingSecret'>> = {
  stripe: {
    name: 'stripe',
    signatureHeader: 'stripe-signature',
    timestampHeader: 'stripe-signature',
    nonceHeader: 'stripe-signature',
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

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  return timingSafeEqual(await signWebhookPayload(payload, secret), signature);
}

export function isTimestampValid(timestamp: string, maxAgeSecs = 300): boolean {
  const epoch = parseInt(timestamp, 10);
  const ts = !isNaN(epoch) && epoch > 1e9 ? epoch * 1000 : new Date(timestamp).getTime();
  return !isNaN(ts) && Math.abs(Date.now() - ts) / 1000 <= maxAgeSecs;
}

export async function verifyIncomingWebhook(
  req: Request,
  payload: string,
  config: WebhookProviderConfig,
  supabase: RpcClient,
  logger: Logger,
): Promise<WebhookVerificationResult> {
  const maxAge = config.maxAgeSecs ?? 300;
  const sig = req.headers.get(config.signatureHeader);
  if (!sig) {
    logger.warn('Missing signature header', { provider: config.name });
    return { valid: false, reason: 'Missing signature', failedCheck: 'missing_headers' };
  }
  if (!(await verifyWebhookSignature(payload, sig, config.signingSecret))) {
    logger.warn('Signature failed', { provider: config.name });
    return { valid: false, reason: 'Invalid signature', failedCheck: 'signature' };
  }
  const ts = req.headers.get(config.timestampHeader);
  if (ts && config.timestampHeader !== config.signatureHeader && !isTimestampValid(ts, maxAge)) {
    logger.warn('Timestamp expired', { provider: config.name });
    return { valid: false, reason: 'Timestamp too old', failedCheck: 'timestamp' };
  }
  const nonce = req.headers.get(config.nonceHeader);
  if (nonce && config.nonceHeader !== config.signatureHeader) {
    try {
      const { data, error } = await supabase.rpc('validate_webhook_nonce', {
        p_nonce: nonce,
        p_provider: config.name,
        p_ttl_seconds: maxAge * 2,
      });
      if (!error && data && !(data as { valid: boolean }).valid) {
        logger.warn('Nonce reuse', { provider: config.name });
        return { valid: false, reason: 'Nonce already used', failedCheck: 'nonce' };
      }
    } catch {
      logger.warn('Nonce check error — failing open', { provider: config.name });
    }
  }
  if (config.enforceIpAllowlist !== false) {
    const ip = getClientIp(req);
    if (ip) {
      try {
        const { data, error } = await supabase.rpc('check_webhook_ip_allowed', {
          p_provider: config.name,
          p_ip_address: ip,
        });
        if (!error && data === false) {
          logger.warn('IP not allowed', { provider: config.name });
          return { valid: false, reason: 'IP not allowed', failedCheck: 'ip_allowlist' };
        }
      } catch {
        logger.warn('IP check error — failing open', { provider: config.name });
      }
    }
  }
  return { valid: true };
}

export function webhookVerificationFailedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Webhook verification failed' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
