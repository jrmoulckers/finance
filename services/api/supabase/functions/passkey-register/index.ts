// SPDX-License-Identifier: BUSL-1.1

/**
 * Passkey Registration Edge Function (#69)
 *
 * Implements the WebAuthn registration ceremony:
 *   1. POST /passkey-register?step=options  → Generate registration options (challenge)
 *   2. POST /passkey-register?step=verify   → Validate attestation and store credential
 *
 * Uses @simplewebauthn/server for WebAuthn ceremony logic.
 *
 * Environment Variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key
 *   WEBAUTHN_RP_NAME          — Relying Party name (e.g. "Finance App")
 *   WEBAUTHN_RP_ID            — Relying Party ID (e.g. "finance.example.com")
 *   WEBAUTHN_ORIGIN           — Expected origin (e.g. "https://app.finance.example.com")
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from 'https://esm.sh/@simplewebauthn/server@9.0.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '../_shared/rate-limit.ts';
import { validateEnv, requireEnv } from '../_shared/env.ts';
import type {
  GenerateRegistrationOptionsOpts,
  VerifiedRegistrationResponse,
} from 'https://esm.sh/@simplewebauthn/server@9.0.3';

/**
 * Extract and verify the authenticated user from the JWT.
 */
async function getAuthenticatedUser(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return { id: user.id, email: user.email ?? '' };
}

export const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  // Validate required environment variables (#616)
  const envError = validateEnv('passkey-register', req);
  if (envError) return envError;

  const logger = createLogger('passkey-register');
  logger.info('Request received', { method: req.method });

  if (req.method !== 'POST') {
    logger.warn('Method not allowed', { method: req.method, httpStatus: 405 });
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Authenticate user
  const user = await getAuthenticatedUser(req);
  if (!user) {
    logger.warn('Authentication failed', { httpStatus: 401 });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  logger.setUserId(user.id);

  const url = new URL(req.url);
  const step = url.searchParams.get('step');

  logger.info('Processing registration step', { step: step ?? 'unknown' });

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const rpName = requireEnv('WEBAUTHN_RP_NAME');
  const rpID = requireEnv('WEBAUTHN_RP_ID');
  const origin = requireEnv('WEBAUTHN_ORIGIN');

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Rate limiting (user-based, #614)
  const rateLimitResult = await checkRateLimit(
    supabaseAdmin,
    user.id,
    RATE_LIMITS['passkey-register'],
  );
  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { httpStatus: 429 });
    return rateLimitResponse(req, rateLimitResult, RATE_LIMITS['passkey-register']);
  }

  try {
    if (step === 'options') {
      // Step 1: Generate registration options

      // Fetch existing credentials to exclude
      const { data: existingCreds } = await supabaseAdmin
        .from('passkey_credentials')
        .select('credential_id')
        .eq('user_id', user.id)
        .is('deleted_at', null);

      const excludeCredentials = (existingCreds ?? []).map((cred: { credential_id: string }) => ({
        id: cred.credential_id,
        type: 'public-key' as const,
      }));

      const options: GenerateRegistrationOptionsOpts = {
        rpName,
        rpID,
        userName: user.email,
        userID: new TextEncoder().encode(user.id),
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'platform',
        },
        supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      };

      const registrationOptions = await generateRegistrationOptions(options);

      // Store challenge for verification
      const challengeExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min
      await supabaseAdmin.from('webauthn_challenges').insert({
        user_id: user.id,
        challenge: registrationOptions.challenge,
        type: 'registration',
        expires_at: challengeExpiry.toISOString(),
      });

      logger.info('Registration options generated', { httpStatus: 200 });

      return new Response(JSON.stringify(registrationOptions), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    } else if (step === 'verify') {
      // Step 2: Verify registration response

      const body = await req.json();

      // ── Scoped challenge lookup (#1310, API-9) ─────────────────────
      // Extract the challenge from clientDataJSON so we look up by exact
      // value — never "the most recent challenge for this user".
      if (!body.response?.clientDataJSON) {
        return new Response(JSON.stringify({ error: 'Missing clientDataJSON in response' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      const clientDataBytes = Uint8Array.from(
        atob(
          body.response.clientDataJSON
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(
              body.response.clientDataJSON.length +
                ((4 - (body.response.clientDataJSON.length % 4)) % 4),
              '=',
            ),
        ),
        (c: string) => c.charCodeAt(0),
      );
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
      const submittedChallenge = clientData.challenge as string | undefined;

      if (!submittedChallenge) {
        return new Response(JSON.stringify({ error: 'Missing challenge in client data' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      // Look up by exact challenge value + user + type + not-expired
      const { data: challengeRow, error: challengeError } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('*')
        .eq('challenge', submittedChallenge)
        .eq('user_id', user.id)
        .eq('type', 'registration')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (challengeError || !challengeRow) {
        return new Response(
          JSON.stringify({ error: 'Challenge not found, expired, or already used' }),
          {
            status: 400,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          },
        );
      }

      // Delete challenge immediately — one-time use regardless of
      // whether verification succeeds (#1310, API-9).
      await supabaseAdmin.from('webauthn_challenges').delete().eq('id', challengeRow.id);

      const expectedChallenge = challengeRow.challenge as string;

      const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return new Response(JSON.stringify({ error: 'Registration verification failed' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;

      // Store the credential
      const { error: insertError } = await supabaseAdmin.from('passkey_credentials').insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: btoa(String.fromCharCode(...new Uint8Array(credential.publicKey))),
        counter: credential.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        transports: credential.transports ?? [],
      });

      if (insertError) {
        logger.error('Failed to store credential', { errorMessage: insertError.message });
        return new Response(JSON.stringify({ error: 'Failed to store credential' }), {
          status: 500,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      logger.info('Passkey registration verified', {
        httpStatus: 201,
        deviceType: credentialDeviceType,
      });

      return new Response(
        JSON.stringify({
          verified: true,
          credential_id: credential.id,
          device_type: credentialDeviceType,
        }),
        {
          status: 201,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        },
      );
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
    logger.error('Passkey registration error', { errorMessage: (err as Error).message });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
};

if (import.meta.main) Deno.serve(handler);
