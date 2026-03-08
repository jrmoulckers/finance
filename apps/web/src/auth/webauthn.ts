// SPDX-License-Identifier: BUSL-1.1

/**
 * WebAuthn Passkey Authentication (#97)
 *
 * Client-side WebAuthn registration and authentication ceremonies
 * that communicate with the Supabase Edge Functions:
 *   - passkey-register (registration ceremony)
 *   - passkey-authenticate (authentication ceremony)
 *
 * Uses the Web Authentication API (navigator.credentials) directly
 * for maximum control and minimal bundle size.
 *
 * @see https://w3c.github.io/webauthn/
 * @see services/api/supabase/functions/passkey-register/index.ts
 * @see services/api/supabase/functions/passkey-authenticate/index.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the WebAuthn client. */
export interface WebAuthnConfig {
  /** Supabase project URL (e.g. "https://<project>.supabase.co"). */
  supabaseUrl: string;
  /** Supabase anon/public API key. */
  supabaseAnonKey: string;
}

/** Result of a successful passkey registration. */
export interface RegistrationResult {
  verified: boolean;
  credentialId: string;
  deviceType: string;
}

/** Result of a successful passkey authentication. */
export interface AuthenticationResult {
  verified: boolean;
  userId: string;
}

/** Registration options returned by the server (PublicKeyCredentialCreationOptionsJSON). */
interface ServerRegistrationOptions {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ alg: number; type: string }>;
  timeout?: number;
  excludeCredentials?: Array<{
    id: string;
    type: string;
    transports?: string[];
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
  attestation?: string;
}

/** Authentication options returned by the server (PublicKeyCredentialRequestOptionsJSON). */
interface ServerAuthenticationOptions {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{
    id: string;
    type: string;
    transports?: string[];
  }>;
  userVerification?: string;
}

// ---------------------------------------------------------------------------
// Helpers -- Base64URL encoding/decoding
// ---------------------------------------------------------------------------

/**
 * Decode a Base64URL string to an ArrayBuffer.
 * WebAuthn challenges and credential IDs use Base64URL encoding.
 */
function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encode an ArrayBuffer to a Base64URL string.
 */
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------

/**
 * Check if WebAuthn is supported in the current browser.
 *
 * @returns `true` if the Web Authentication API is available.
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

/**
 * Check if the platform supports conditional UI (autofill-assisted passkeys).
 *
 * @returns `true` if conditional mediation is available.
 */
export async function isConditionalMediationAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    if (
      typeof PublicKeyCredential.isConditionalMediationAvailable === 'function'
    ) {
      return await PublicKeyCredential.isConditionalMediationAvailable();
    }
  } catch {
    // Not supported
  }

  return false;
}

// ---------------------------------------------------------------------------
// API Communication
// ---------------------------------------------------------------------------

let config: WebAuthnConfig | null = null;

/**
 * Initialize the WebAuthn module with Supabase connection details.
 * Must be called before `registerPasskey` or `authenticateWithPasskey`.
 */
export function initWebAuthn(cfg: WebAuthnConfig): void {
  config = cfg;
}

/**
 * Make an authenticated request to a Supabase Edge Function.
 *
 * @param functionName Edge Function name (e.g. "passkey-register").
 * @param step Query parameter step ("options" | "verify").
 * @param body Request body (JSON-serialisable).
 * @param accessToken Optional JWT for authenticated requests.
 */
async function callEdgeFunction<T>(
  functionName: string,
  step: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  if (!config) {
    throw new Error('WebAuthn not initialised. Call initWebAuthn() first.');
  }

  const url = `${config.supabaseUrl}/functions/v1/${functionName}?step=${step}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: config.supabaseAnonKey,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new Error(
      (error as { error?: string }).error ??
        `Edge Function error (${response.status})`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Registration Ceremony
// ---------------------------------------------------------------------------

/**
 * Register a new passkey for the authenticated user.
 *
 * Implements the full WebAuthn registration ceremony:
 *   1. Request registration options (challenge) from the server.
 *   2. Call `navigator.credentials.create()` to generate a credential.
 *   3. Send the attestation response back to the server for verification.
 *
 * @param accessToken A valid access token for the authenticated user.
 * @returns The registration result including credential ID and device type.
 * @throws If WebAuthn is not supported or the ceremony fails.
 */
export async function registerPasskey(
  accessToken: string,
): Promise<RegistrationResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  // Step 1: Get registration options from the server
  const options = await callEdgeFunction<ServerRegistrationOptions>(
    'passkey-register',
    'options',
    {},
    accessToken,
  );

  // Step 2: Convert server options to Web API format
  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToBuffer(options.challenge),
    rp: {
      name: options.rp.name,
      id: options.rp.id,
    },
    user: {
      id: base64UrlToBuffer(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((param) => ({
      alg: param.alg,
      type: param.type as PublicKeyCredentialType,
    })),
    timeout: options.timeout ?? 60_000,
    attestation:
      (options.attestation as AttestationConveyancePreference) ?? 'none',
    authenticatorSelection: options.authenticatorSelection
      ? {
          authenticatorAttachment: options.authenticatorSelection
            .authenticatorAttachment as AuthenticatorAttachment | undefined,
          residentKey: options.authenticatorSelection
            .residentKey as ResidentKeyRequirement | undefined,
          requireResidentKey:
            options.authenticatorSelection.requireResidentKey ?? false,
          userVerification:
            (options.authenticatorSelection
              .userVerification as UserVerificationRequirement) ?? 'preferred',
        }
      : undefined,
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      id: base64UrlToBuffer(cred.id),
      type: cred.type as PublicKeyCredentialType,
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  // Step 3: Create the credential via the browser WebAuthn API
  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Credential creation was cancelled or failed.');
  }

  const attestationResponse =
    credential.response as AuthenticatorAttestationResponse;

  // Step 4: Build the attestation response for the server
  const attestationBody = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(attestationResponse.clientDataJSON),
      attestationObject: bufferToBase64Url(
        attestationResponse.attestationObject,
      ),
      transports:
        typeof attestationResponse.getTransports === 'function'
          ? attestationResponse.getTransports()
          : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };

  // Step 5: Send attestation to server for verification
  const result = await callEdgeFunction<{
    verified: boolean;
    credential_id: string;
    device_type: string;
  }>('passkey-register', 'verify', attestationBody, accessToken);

  if (!result.verified) {
    throw new Error('Server rejected the registration.');
  }

  return {
    verified: result.verified,
    credentialId: result.credential_id,
    deviceType: result.device_type,
  };
}

// ---------------------------------------------------------------------------
// Authentication Ceremony
// ---------------------------------------------------------------------------

/**
 * Authenticate using a registered passkey.
 *
 * Implements the full WebAuthn authentication ceremony:
 *   1. Request authentication options (challenge) from the server.
 *   2. Call `navigator.credentials.get()` to sign the challenge.
 *   3. Send the assertion response back to the server for verification.
 *
 * Supports both username-based and usernameless (discoverable credential) flows.
 *
 * @param email Optional email to restrict credentials to a specific user.
 * @returns The authentication result including the user ID.
 * @throws If WebAuthn is not supported or the ceremony fails.
 */
export async function authenticateWithPasskey(
  email?: string,
): Promise<AuthenticationResult> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  // Step 1: Get authentication options from the server
  const requestBody = email ? { email } : {};
  const options = await callEdgeFunction<ServerAuthenticationOptions>(
    'passkey-authenticate',
    'options',
    requestBody,
  );

  // Step 2: Convert server options to Web API format
  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBuffer(options.challenge),
    timeout: options.timeout ?? 60_000,
    rpId: options.rpId,
    userVerification:
      (options.userVerification as UserVerificationRequirement) ?? 'preferred',
    allowCredentials: options.allowCredentials?.map((cred) => ({
      id: base64UrlToBuffer(cred.id),
      type: cred.type as PublicKeyCredentialType,
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  // Step 3: Get the assertion from the browser WebAuthn API
  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Authentication was cancelled or failed.');
  }

  const assertionResponse =
    credential.response as AuthenticatorAssertionResponse;

  // Step 4: Build the assertion response for the server
  const assertionBody = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(assertionResponse.clientDataJSON),
      authenticatorData: bufferToBase64Url(
        assertionResponse.authenticatorData,
      ),
      signature: bufferToBase64Url(assertionResponse.signature),
      userHandle: assertionResponse.userHandle
        ? bufferToBase64Url(assertionResponse.userHandle)
        : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };

  // Step 5: Send assertion to server for verification
  const result = await callEdgeFunction<{
    verified: boolean;
    user_id: string;
  }>('passkey-authenticate', 'verify', assertionBody);

  if (!result.verified) {
    throw new Error('Server rejected the authentication.');
  }

  return {
    verified: result.verified,
    userId: result.user_id,
  };
}
