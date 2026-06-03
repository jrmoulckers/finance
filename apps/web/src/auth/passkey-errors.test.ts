// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { getPasskeyErrorMessage } from './passkey-errors';

describe('getPasskeyErrorMessage', () => {
  it('maps fetch failures to a passkey service message', () => {
    expect(getPasskeyErrorMessage(new TypeError('Failed to fetch'))).toBe(
      "Your browser couldn't reach the passkey service. Check your connection and try again.",
    );
  });

  it('maps unsupported browsers to an actionable fallback', () => {
    expect(getPasskeyErrorMessage(new Error('WebAuthn is not supported in this browser.'))).toBe(
      "Your browser or device doesn't support passkeys. Sign in with email and password instead.",
    );
  });

  it('maps missing credentials to a no-passkey message', () => {
    expect(getPasskeyErrorMessage(new Error('Credential not found'))).toBe(
      'No passkey was found for this account or device. Sign in with email and password, then add a passkey from Settings.',
    );
  });

  it('maps browser cancellation differently for registration', () => {
    const error = new DOMException('The operation was aborted', 'AbortError');

    expect(getPasskeyErrorMessage(error, 'registration')).toBe(
      'Passkey setup was cancelled or blocked by your browser. Try again when you are ready.',
    );
  });

  it('keeps specific server messages when no friendly mapping applies', () => {
    expect(getPasskeyErrorMessage(new Error('Rate limit exceeded'))).toBe('Rate limit exceeded');
  });
});
