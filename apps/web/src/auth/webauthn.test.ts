// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { getWebAuthnFunctionUrl } from './webauthn';

describe('getWebAuthnFunctionUrl', () => {
  it('uses the same-origin Edge Functions route so Vite can proxy local dev traffic', () => {
    expect(getWebAuthnFunctionUrl('passkey-authenticate', 'options')).toBe(
      '/functions/v1/passkey-authenticate?step=options',
    );
  });

  it('encodes the step query parameter', () => {
    expect(getWebAuthnFunctionUrl('passkey-register', 'verify next')).toBe(
      '/functions/v1/passkey-register?step=verify%20next',
    );
  });
});
