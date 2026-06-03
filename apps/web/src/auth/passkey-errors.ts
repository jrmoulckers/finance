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

  if (
    normalizedMessage.includes('internal server error') ||
    normalizedMessage.includes('edge function error') ||
    normalizedMessage.includes('function not found')
  ) {
    return 'The passkey service is unavailable. Try again in a few minutes or sign in with email and password.';
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
