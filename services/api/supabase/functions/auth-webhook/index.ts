// SPDX-License-Identifier: BUSL-1.1

/**
 * Auth Webhook Edge Function (#68)
 *
 * Handles Supabase Auth webhook events (user signup/signin).
 * On new signup: creates a user row, default household, and owner membership.
 *
 * Configuration:
 *   Supabase Dashboard → Auth → Hooks → MFA Verification / Custom SMS etc.
 *   Or configure via Database Webhooks on auth.users INSERT.
 *
 * Environment Variables:
 *   SUPABASE_URL          — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
 *   AUTH_WEBHOOK_SECRET    — Shared secret to verify webhook authenticity
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createAdminClient } from '../_shared/auth.ts';
import { createLogger, type Logger } from '../_shared/logger.ts';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '../_shared/rate-limit.ts';

interface WebhookPayload {
  type: string;
  table: string;
  record: {
    id: string;
    email: string;
    raw_user_meta_data?: {
      full_name?: string;
      name?: string;
      avatar_url?: string;
    };
    created_at: string;
  };
  old_record: Record<string, unknown> | null;
}

/**
 * Constant-time string comparison to prevent timing attacks (A-6).
 *
 * Uses TextEncoder for proper byte-level encoding and XOR accumulation
 * so that the comparison time depends only on the string length, not on
 * where the first mismatch occurs.
 *
 * Note: the early return on length mismatch is an accepted trade-off —
 * leaking the *length* of the secret is not exploitable in practice.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.length !== bufB.length) return false;

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * Verify that the webhook request is authentic using the shared secret.
 */
function verifyWebhookSecret(req: Request, logger: Logger): boolean {
  const secret = Deno.env.get('AUTH_WEBHOOK_SECRET');
  if (!secret) {
    logger.error('AUTH_WEBHOOK_SECRET not configured');
    return false;
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  const token = authHeader.replace('Bearer ', '');
  return constantTimeEqual(token, secret);
}

serve(async (req: Request): Promise<Response> => {
  const logger = createLogger('auth-webhook');
  logger.info('Request received', { method: req.method });

  // Only accept POST
  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify webhook authenticity
  if (!verifyWebhookSecret(req, logger)) {
    logger.warn('Webhook authentication failed', { httpStatus: 401 });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting (IP-based, #614) — fail open if DB unavailable
  try {
    const rateLimitClient = createAdminClient();
    const clientIp = getClientIp(req) ?? 'unknown';
    const rateLimitResult = await checkRateLimit(
      rateLimitClient,
      clientIp,
      RATE_LIMITS['auth-webhook'],
    );
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', { httpStatus: 429 });
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfterSeconds ?? 0),
        },
      });
    }
  } catch {
    // Rate limiting failure must not block webhook processing
  }

  try {
    const payload: WebhookPayload = await req.json();

    // Only handle INSERT events on auth.users (new signups)
    if (payload.type !== 'INSERT') {
      logger.info('Event ignored', { eventType: payload.type });
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { record } = payload;

    // Initialize Supabase admin client (bypasses RLS via service role)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      logger.error('Missing required environment variables');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Extract display name from user metadata
    const displayName =
      record.raw_user_meta_data?.full_name ?? record.raw_user_meta_data?.name ?? null;

    // Call the database function to create user, household, and membership.
    // The RPC is idempotent (M-6): duplicate webhook fires return
    // { already_provisioned: true } instead of creating duplicate households.
    const { data, error } = await supabaseAdmin.rpc('handle_new_user_signup', {
      p_user_id: record.id,
      p_email: record.email,
      p_name: displayName,
    });

    if (error) {
      logger.error('Failed to provision user', { errorMessage: error.message });
      return new Response(JSON.stringify({ error: 'Failed to provision user' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = data as {
      user_id: string;
      household_id: string;
      display_name: string;
      already_provisioned?: boolean;
    };

    // Idempotent re-fire: user was already provisioned on a previous webhook
    if (result?.already_provisioned) {
      console.log('User already provisioned (idempotent re-fire):', record.id);
      return new Response(
        JSON.stringify({
          message: 'User already provisioned',
          user_id: record.id,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Log success without exposing user data
    logger.info('User provisioned successfully', { userId: record.id, httpStatus: 201 });

    return new Response(
      JSON.stringify({
        message: 'User provisioned',
        user_id: record.id,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    logger.error('Webhook processing error', { errorMessage: (err as Error).message });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
