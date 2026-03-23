// SPDX-License-Identifier: BUSL-1.1

/**
 * Passkey Authentication Edge Function (#69, #362)
 *
 * Implements the WebAuthn authentication ceremony:
 *   1. POST /passkey-authenticate?step=options  → Generate authentication options (challenge)
 *   2. POST /passkey-authenticate?step=verify   → Validate assertion and return JWT session
 *
 * Security fixes (#362):
 *   - A-5:   Mint a proper Supabase JWT session instead of returning raw user_id
 *   - API-9: Scope challenge lookup to specific challenge value (not global "most recent")
 *   - Enforce challenge expiry (5 min) and one-time use
 *
 * Uses @simplewebauthn/server for WebAuthn ceremony logic.
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   WEBAUTHN_RP_ID            — Relying Party ID
 *   WEBAUTHN_ORIGIN           — Expected origin
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from 'https://esm.sh/@simplewebauthn/server@9.0.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { errorResponse, internalErrorResponse, jsonResponse } from '../_shared/response.ts';
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from '../_shared/rate-limit.ts';
import type {
  AuthenticatorTransportFuture,
  VerifiedAuthenticationResponse,
} from 'https://esm.sh/@simplewebauthn/server@9.0.3';

interface StoredCredential {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
}

/** Maximum age for a WebAuthn challenge before it expires (#362). */
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Decode a base64url-encoded string to a Uint8Array.
 *
 * Used to parse the clientDataJSON from the WebAuthn assertion so we can
 * extract the challenge value for scoped database lookup (#362, API-9).
 */
function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padNeeded = base64.length % 4;
  const padded = padNeeded ? base64 + '='.repeat(4 - padNeeded) : base64;
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const logger = createLogger('passkey-authenticate');
  logger.info('Request received', { method: req.method });

  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rpID = Deno.env.get('WEBAUTHN_RP_ID') ?? 'finance.example.com';
  const origin = Deno.env.get('WEBAUTHN_ORIGIN') ?? 'https://app.finance.example.com';

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Rate limiting (IP-based, pre-auth, #614)
  const clientIp = getClientIp(req) ?? 'unknown';
  const rateLimitResult = await checkRateLimit(
    supabaseAdmin,
    clientIp,
    RATE_LIMITS['passkey-authenticate'],
  );
  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { httpStatus: 429 });
    return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['passkey-authenticate']);
  }

  const url = new URL(req.url);
  const step = url.searchParams.get('step');

  logger.info('Processing authentication step', { step: step ?? 'unknown' });

  try {
    if (step === 'options') {
      // Step 1: Generate authentication options
      // For passkey authentication, we may not know the user yet (usernameless flow)
      const body = await req.json().catch(() => ({}));
      const email = body.email as string | undefined;

      let allowCredentials: {
        id: string;
        type: 'public-key';
        transports?: AuthenticatorTransportFuture[];
      }[] = [];
      let resolvedUserId: string | null = null;

      if (email) {
        // If email is provided, look up user's credentials
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', email)
          .is('deleted_at', null)
          .single();

        if (userData) {
          resolvedUserId = userData.id;

          const { data: creds } = await supabaseAdmin
            .from('passkey_credentials')
            .select('credential_id, transports')
            .eq('user_id', userData.id)
            .is('deleted_at', null);

          allowCredentials = (creds ?? []).map(
            (c: { credential_id: string; transports: string[] | null }) => ({
              id: c.credential_id,
              type: 'public-key' as const,
              transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
            }),
          );
        }
      }

      const authenticationOptions = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
        allowCredentials,
      });

      // Store challenge scoped to user when known (#362, API-9).
      // For usernameless flows user_id is null; the challenge value
      // itself is the lookup key in the verify step.
      const challengeExpiry = new Date(Date.now() + CHALLENGE_TTL_MS);

      await supabaseAdmin.from('webauthn_challenges').insert({
        challenge: authenticationOptions.challenge,
        type: 'authentication',
        expires_at: challengeExpiry.toISOString(),
        user_id: resolvedUserId,
      });

      logger.info('Authentication options generated', { httpStatus: 200 });

      return new Response(JSON.stringify(authenticationOptions), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    } else if (step === 'verify') {
      // Step 2: Verify authentication response and mint JWT session (#362)
      const body = await req.json();
      const credentialId = body.id as string;

      if (!credentialId) {
        return errorResponse(req, 'Missing credential ID', 400);
      }

      // ── Credential lookup ────────────────────────────────────────────
      const { data: storedCred, error: credError } = await supabaseAdmin
        .from('passkey_credentials')
        .select('*')
        .eq('credential_id', credentialId)
        .is('deleted_at', null)
        .single();

      if (credError || !storedCred) {
        return errorResponse(req, 'Credential not found', 400);
      }

      const credential = storedCred as StoredCredential;

      // ── Scoped challenge lookup (#362, API-9) ────────────────────────
      // Extract the challenge from clientDataJSON so we look up by exact
      // value — never "the most recent challenge globally".
      if (!body.response?.clientDataJSON) {
        return errorResponse(req, 'Missing clientDataJSON in response', 400);
      }

      const clientDataBytes = base64urlToBytes(body.response.clientDataJSON);
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
      const submittedChallenge = clientData.challenge as string | undefined;

      if (!submittedChallenge) {
        return errorResponse(req, 'Missing challenge in client data', 400);
      }

      // Look up by exact challenge value + type + not-expired
      const { data: challengeRow, error: challengeError } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('*')
        .eq('challenge', submittedChallenge)
        .eq('type', 'authentication')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (challengeError || !challengeRow) {
        return errorResponse(req, 'Challenge not found, expired, or already used', 400);
      }

      // Delete challenge immediately — one-time use regardless of
      // whether verification succeeds (#362, API-9).
      await supabaseAdmin.from('webauthn_challenges').delete().eq('id', challengeRow.id);

      const expectedChallenge = challengeRow.challenge as string;

      // ── WebAuthn verification ────────────────────────────────────────
      const publicKeyBytes = Uint8Array.from(atob(credential.public_key), (c) => c.charCodeAt(0));

      const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credential.credential_id,
          publicKey: publicKeyBytes,
          counter: credential.counter,
          transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
        },
        requireUserVerification: true,
      });

      if (!verification.verified) {
        return errorResponse(req, 'Authentication verification failed', 401);
      }

      // ── Update credential counter (replay prevention) ────────────────
      await supabaseAdmin
        .from('passkey_credentials')
        .update({
          counter: verification.authenticationInfo.newCounter,
          updated_at: new Date().toISOString(),
        })
        .eq('id', credential.id);

      // ── Mint Supabase JWT session (#362, A-5) ────────────────────────
      // Resolve the auth user so we can generate a session.
      const {
        data: { user: authUser },
        error: userError,
      } = await supabaseAdmin.auth.admin.getUserById(credential.user_id);

      if (userError || !authUser?.email) {
        logger.error('Failed to resolve auth user for session', {
          errorMessage: userError?.message ?? 'Auth user missing email',
        });
        return internalErrorResponse(req);
      }

      // Generate a magic-link token server-side (never sent to the user).
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: authUser.email,
      });

      if (linkError || !linkData?.properties?.hashed_token) {
        logger.error('Failed to generate session link', {
          errorMessage: linkError?.message ?? 'Missing hashed token',
        });
        return internalErrorResponse(req);
      }

      // Exchange the hashed token for a real session containing JWTs.
      const {
        data: { session },
        error: sessionError,
      } = await supabaseAdmin.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      });

      if (sessionError || !session) {
        logger.error('Failed to mint session from OTP exchange', {
          errorMessage: sessionError?.message ?? 'Session missing after OTP exchange',
        });
        return internalErrorResponse(req);
      }

      logger.setUserId(credential.user_id);
      logger.info('Passkey authentication successful', { httpStatus: 200 });

      // Return a standard Supabase session payload — clients can use
      // supabase.auth.setSession() with these tokens.
      return jsonResponse(req, {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: 'bearer',
        user: {
          id: session.user.id,
          email: session.user.email,
          created_at: session.user.created_at,
        },
      });
    } else {
      return new Response(
        JSON.stringify({
          error: 'Invalid step. Use ?step=options or ?step=verify',
        }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        },
      );
    }
  } catch (err) {
    logger.error('Passkey authentication error', { errorMessage: (err as Error).message });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
