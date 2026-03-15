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

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from 'https://esm.sh/@simplewebauthn/server@9.0.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // Authenticate user
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const step = url.searchParams.get('step');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rpName = Deno.env.get('WEBAUTHN_RP_NAME') ?? 'Finance App';
  const rpID = Deno.env.get('WEBAUTHN_RP_ID') ?? 'finance.example.com';
  const origin = Deno.env.get('WEBAUTHN_ORIGIN') ?? 'https://app.finance.example.com';

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

      return new Response(JSON.stringify(registrationOptions), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    } else if (step === 'verify') {
      // Step 2: Verify registration response

      const body = await req.json();

      // Retrieve stored challenge
      const { data: challenges, error: challengeError } = await supabaseAdmin
        .from('webauthn_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'registration')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (challengeError || !challenges || challenges.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid challenge found' }), {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      const expectedChallenge = challenges[0].challenge;

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
        console.error('Failed to store credential:', insertError.message);
        return new Response(JSON.stringify({ error: 'Failed to store credential' }), {
          status: 500,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      // Clean up used challenge
      await supabaseAdmin.from('webauthn_challenges').delete().eq('id', challenges[0].id);

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
    console.error('Passkey registration error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
