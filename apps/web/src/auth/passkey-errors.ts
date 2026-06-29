// SPDX-License-Identifier: BUSL-1.1

export type PasskeyErrorContext = 'authentication' | 'registration';

const PASSKEY_SERVICE_UNREACHABLE =
  "Your browser couldn't reach the passkey service. Check your connection and try again.";

const PASSKEY_NOT_FOUND =
  'No passkey was found for this account or device. Sign in with email and password, then add a passkey from Settings.';

const PASSKEY_NOT_SUPPORTED =
  "Your browser or device doesn't support passkeys. Sign in with email and password instead.";

const PASSKEY_ORIGIN_UNAVAILABLE =
  'Passkeys are not available from this browser origin. Use localhost or HTTPS, then try again.';

const PASSKEY_REGISTRATION_CANCELLED =
  'Passkey setup was cancelled or blocked by your browser. Try again when you are ready.';

const PASSKEY_AUTHENTICATION_CANCELLED =
  'The passkey request was cancelled, timed out, or blocked by your browser. Try again or sign in with email and password.';

const PASSKEY_REGISTRATION_FAILED =
  'Passkey setup failed. Try again, or continue using email and password.';

const PASSKEY_AUTHENTICATION_FAILED =
  'Passkey sign-in failed. Try again, or sign in with email and password.';

/**
 * Shown when the passkey backend is unconfigured or unavailable — e.g. the
 * Edge Functions are not provisioned in this environment (404/501), the
 * gateway is down (502/503), the WebAuthn client never received its config,
 * or the server returned an opaque body that decoded to "Unknown error".
 * Tells the user passkeys aren't an option right now and points them to the
 * always-available email/password path instead of surfacing a dead end (#3111).
 */
export const PASSKEY_UNAVAILABLE_MESSAGE =
  "Passkey sign-in isn't available right now — use email/password.";

export function getPasskeyErrorMessage(
  error: unknown,
  context: PasskeyErrorContext = 'authentication',
): string {
  const message = getErrorMessage(error);
  const normalizedMessage = message.toLowerCase();
  const errorName = getErrorName(error);

  if (isNetworkError(error, normalizedMessage)) {
    return PASSKEY_SERVICE_UNREACHABLE;
  }

  if (
    errorName === 'NotSupportedError' ||
    normalizedMessage.includes('webauthn is not supported') ||
    normalizedMessage.includes('not supported in this browser')
  ) {
    return PASSKEY_NOT_SUPPORTED;
  }

  if (
    errorName === 'SecurityError' ||
    normalizedMessage.includes('relying party') ||
    normalizedMessage.includes('origin')
  ) {
    return PASSKEY_ORIGIN_UNAVAILABLE;
  }

  if (isNoPasskeyError(normalizedMessage)) {
    return PASSKEY_NOT_FOUND;
  }

  if (
    errorName === 'NotAllowedError' ||
    errorName === 'AbortError' ||
    normalizedMessage.includes('cancelled') ||
    normalizedMessage.includes('canceled') ||
    normalizedMessage.includes('denied') ||
    normalizedMessage.includes('timed out')
  ) {
    return context === 'registration'
      ? PASSKEY_REGISTRATION_CANCELLED
      : PASSKEY_AUTHENTICATION_CANCELLED;
  }

  if (normalizedMessage.includes('unauthorized') && context === 'registration') {
    return 'Sign in again before setting up a passkey.';
  }

  if (isServiceUnavailableError(normalizedMessage)) {
    return PASSKEY_UNAVAILABLE_MESSAGE;
  }

  return (
    message ||
    (context === 'registration' ? PASSKEY_REGISTRATION_FAILED : PASSKEY_AUTHENTICATION_FAILED)
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function getErrorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

function isNetworkError(error: unknown, normalizedMessage: string): boolean {
  return (
    (error instanceof TypeError && normalizedMessage.includes('failed to fetch')) ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed')
  );
}

function isNoPasskeyError(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes('credential not found') ||
    normalizedMessage.includes('no credential') ||
    normalizedMessage.includes('no passkey') ||
    normalizedMessage.includes('not registered')
  );
}

/**
 * Detect an unconfigured or unavailable passkey backend. Covers the generic
 * "Unknown error" the WebAuthn client emits when an unprovisioned endpoint
 * returns a non-JSON body, the explicit "Edge Function error (NNN)" wrapper,
 * 404/5xx gateway statuses, "function not found"/"not implemented", and the
 * "still initialising" guard from a client that never got its config (#3111).
 */
function isServiceUnavailableError(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes('unknown error') ||
    normalizedMessage.includes('internal server error') ||
    normalizedMessage.includes('edge function error') ||
    normalizedMessage.includes('function not found') ||
    normalizedMessage.includes('not implemented') ||
    normalizedMessage.includes('service unavailable') ||
    normalizedMessage.includes('bad gateway') ||
    normalizedMessage.includes('still initialising') ||
    normalizedMessage.includes('still initializing') ||
    /\b(?:404|500|501|502|503|504)\b/.test(normalizedMessage)
  );
}
