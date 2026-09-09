// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient } from '../_shared/auth.ts';
import { validateEnv } from '../_shared/env.ts';
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
  rateLimitResponse,
} from '../_shared/rate-limit.ts';
import { StripeRestGateway } from '../stripe-common/client.ts';
import { loadStripeWebhookConfig } from '../stripe-common/config.ts';
import { normalizeStripeEvent, parseStripeEvent } from '../stripe-common/normalize.ts';
import { verifyStripeSignature } from '../stripe-common/signature.ts';
import { findStripeBillingContext, recordAndApplyStripeEvidence } from '../stripe-common/store.ts';
import {
  type StripeEnvironment,
  type StripeEvent,
  type StripeGateway,
  StripeServiceError,
} from '../stripe-common/types.ts';

const MAX_WEBHOOK_BYTES = 256 * 1024;

interface WebhookService {
  process(input: {
    rawBody: string;
    signatureHeader: string | null;
    stripeAccountHeader: string | null;
  }): Promise<'applied' | 'ignored'>;
}

type WebhookRateLimit = (request: Request) => Promise<Response | null>;

export function createStripeWebhookHandler(
  service: WebhookService = defaultWebhookService(),
  checkLimit: WebhookRateLimit = () => Promise.resolve(null),
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    const limited = await checkLimit(request);
    if (limited) return limited;

    const rawBody = await readTextBodyWithLimit(request, MAX_WEBHOOK_BYTES);
    if (rawBody === null) {
      return json(413, { error: 'Invalid billing evidence' });
    }
    if (rawBody.length === 0) return json(400, { error: 'Invalid billing evidence' });

    try {
      const outcome = await service.process({
        rawBody,
        signatureHeader: request.headers.get('Stripe-Signature'),
        stripeAccountHeader: request.headers.get('Stripe-Account'),
      });
      return json(200, { received: true, applied: outcome === 'applied' });
    } catch (error) {
      if (error instanceof StripeServiceError && error.retryable) {
        return json(
          503,
          { error: 'Billing evidence temporarily unavailable' },
          { 'Retry-After': '30' },
        );
      }
      return json(400, { error: 'Invalid billing evidence' });
    }
  };
}

async function readTextBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) return null;
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

function defaultWebhookService(): WebhookService {
  return {
    async process(input) {
      const config = loadStripeWebhookConfig();
      await verifyStripeSignature({
        rawBody: input.rawBody,
        signatureHeader: input.signatureHeader,
        webhookSecrets: config.webhookSecrets,
      });
      const event = parseStripeEvent(input.rawBody);
      verifyEventMode(event, config.environment);

      const gateway = new StripeRestGateway(config.secretKey);
      const account = await gateway.retrieveAccount();
      if (
        account.id !== config.accountId ||
        (event.account && event.account !== config.accountId) ||
        (input.stripeAccountHeader && input.stripeAccountHeader !== config.accountId)
      ) {
        throw new Error('Stripe account mismatch');
      }

      const evidence = await normalizeStripeEvent(event, gateway);
      if (!evidence) return 'ignored';
      const supabase = createAdminClient();
      const context = await findStripeBillingContext({
        supabase,
        providerCustomerId: evidence.providerCustomerId,
        environment: config.environment,
      });
      if (!context) throw new Error('Unknown billing identity');
      await recordAndApplyStripeEvidence({
        supabase,
        context,
        environment: config.environment,
        evidence,
      });
      return 'applied';
    },
  };
}

export function verifyEventMode(event: StripeEvent, environment: StripeEnvironment): void {
  if (event.livemode !== (environment === 'production')) {
    throw new Error('Stripe mode mismatch');
  }
}

export async function verifyStripeAccount(
  gateway: Pick<StripeGateway, 'retrieveAccount'>,
  expectedAccountId: string,
): Promise<void> {
  if ((await gateway.retrieveAccount()).id !== expectedAccountId) {
    throw new Error('Stripe account mismatch');
  }
}

function json(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export const handler = (request: Request): Promise<Response> => {
  const envError = validateEnv('stripe-webhook', request);
  if (envError) return Promise.resolve(envError);

  const admin = createAdminClient();
  return createStripeWebhookHandler(defaultWebhookService(), async (incoming) => {
    const result = await checkRateLimit(
      admin,
      getClientIp(incoming) ?? 'unknown',
      RATE_LIMITS['stripe-webhook'],
    );
    return result.allowed
      ? null
      : rateLimitResponse(incoming, result, RATE_LIMITS['stripe-webhook']);
  })(request);
};
if (import.meta.main) Deno.serve(handler);
