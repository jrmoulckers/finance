// SPDX-License-Identifier: BUSL-1.1

// TODO(alpha): STUB — All platform verification functions return
// { valid: false }. Not wired to any client. No tests. Exclude from
// alpha deployment; implement when device attestation is prioritized. (#1390)

/**
 * Edge Function: verify-device-attestation (#331)
 *
 * Server-side verification of device attestation tokens.
 * PRIVACY: No device identifiers stored.
 */

import { requireAuth } from '../_shared/auth.ts';
import { handleCorsPreflightRequest } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/response.ts';

interface AttestationRequest {
  platform: 'android' | 'ios' | 'windows';
  token: string;
  nonce: string;
}

interface AttestationResult {
  valid: boolean;
  deviceIntegrity: boolean;
  appIntegrity: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  try {
    await requireAuth(req);

    if (req.method !== 'POST') {
      return errorResponse(req, 'Method not allowed', 405);
    }

    const body: AttestationRequest = await req.json();

    if (!body.platform || !body.token || !body.nonce) {
      return errorResponse(req, 'Missing required fields: platform, token, nonce', 400);
    }

    if (!['android', 'ios', 'windows'].includes(body.platform)) {
      return errorResponse(req, 'Invalid platform', 400);
    }

    let result: AttestationResult;
    switch (body.platform) {
      case 'android':
        result = await verifyPlayIntegrity(body.token, body.nonce);
        break;
      case 'ios':
        result = await verifyAppAttest(body.token, body.nonce);
        break;
      case 'windows':
        result = await verifyTpmAttestation(body.token, body.nonce);
        break;
    }

    return jsonResponse(req, {
      attested: result.valid,
      deviceIntegrity: result.deviceIntegrity,
      appIntegrity: result.appIntegrity,
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    return errorResponse(req, 'Internal server error', 500);
  }
});

async function verifyPlayIntegrity(
  _token: string,
  _expectedNonce: string,
): Promise<AttestationResult> {
  // TODO: Implement via Google Play Integrity API
  return { valid: false, deviceIntegrity: false, appIntegrity: false };
}

async function verifyAppAttest(_token: string, _expectedNonce: string): Promise<AttestationResult> {
  // TODO: Implement via Apple App Attest verification
  return { valid: false, deviceIntegrity: false, appIntegrity: false };
}

async function verifyTpmAttestation(
  _token: string,
  _expectedNonce: string,
): Promise<AttestationResult> {
  // TODO: Implement via TPM attestation
  return { valid: false, deviceIntegrity: false, appIntegrity: false };
}
