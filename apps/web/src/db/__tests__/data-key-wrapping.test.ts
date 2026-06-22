// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DataKeyUnlockError,
  WrongPassphraseError,
  RAW_DATA_KEY_BYTES,
  generateRecoveryCode,
  normalizeRecoveryCode,
  unwrapDataKeyWithPassphrase,
  unwrapDataKeyWithRecoveryCode,
  unwrapDataKeyWithWebAuthnSecret,
  wrapDataKeyWithPassphrase,
  wrapDataKeyWithRecoveryCode,
  wrapDataKeyWithWebAuthnSecret,
} from '../data-key-wrapping';

const PASSPHRASE = 'correct horse battery staple';
const OTHER_PASSPHRASE = 'totally-different-secret';

function makeDataKey(seed = 7): Uint8Array {
  const bytes = new Uint8Array(RAW_DATA_KEY_BYTES);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (seed * 31 + index * 13) % 256;
  }
  return bytes;
}

function toArray(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

describe('data-key-wrapping (#2806)', () => {
  it('wraps and unwraps the data key with the same passphrase', async () => {
    const dataKey = makeDataKey();
    const slot = await wrapDataKeyWithPassphrase(dataKey, PASSPHRASE, { iterations: 100_000 });

    const unwrapped = await unwrapDataKeyWithPassphrase(slot, PASSPHRASE);

    expect(toArray(unwrapped)).toEqual(toArray(dataKey));
  });

  it('keeps the snapshot/envelope wrapping format stable', async () => {
    const slot = await wrapDataKeyWithPassphrase(makeDataKey(), PASSPHRASE, {
      iterations: 100_000,
    });

    expect(slot.magic).toBe('finance.sqlite.data-key.slot');
    expect(slot.version).toBe(1);
    expect(slot.kind).toBe('passphrase');
    expect(slot.kdf.algorithm).toBe('PBKDF2-SHA-256');
    expect(slot.envelope.version).toBe(1);
    expect(slot.envelope.algorithm).toBe('AES-GCM');
    // The wrapped key material must never be present in plaintext.
    expect(JSON.stringify(slot)).not.toContain(toArray(makeDataKey()).join(','));
  });

  it('rejects the wrong passphrase without leaking key material', async () => {
    const dataKey = makeDataKey();
    const slot = await wrapDataKeyWithPassphrase(dataKey, PASSPHRASE, { iterations: 100_000 });

    await expect(unwrapDataKeyWithPassphrase(slot, OTHER_PASSPHRASE)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await expect(unwrapDataKeyWithPassphrase(slot, OTHER_PASSPHRASE)).rejects.toMatchObject({
      factor: 'passphrase',
    });
  });

  it('rotates the passphrase in place while preserving the same data key', async () => {
    const dataKey = makeDataKey(3);
    const original = await wrapDataKeyWithPassphrase(dataKey, PASSPHRASE, { iterations: 100_000 });

    // Re-wrap: recover the same key with the old passphrase, wrap with the new.
    const recovered = await unwrapDataKeyWithPassphrase(original, PASSPHRASE);
    const rotated = await wrapDataKeyWithPassphrase(recovered, OTHER_PASSPHRASE, {
      slotId: original.slotId,
      createdAt: original.createdAt,
      iterations: 100_000,
    });

    expect(rotated.slotId).toBe(original.slotId);
    const afterRotation = await unwrapDataKeyWithPassphrase(rotated, OTHER_PASSPHRASE);
    expect(toArray(afterRotation)).toEqual(toArray(dataKey));
    // Old passphrase no longer unwraps the rotated slot.
    await expect(unwrapDataKeyWithPassphrase(rotated, PASSPHRASE)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('switches wrapping modes (passphrase -> recovery -> webauthn) on the same key', async () => {
    const dataKey = makeDataKey(11);

    const passphraseSlot = await wrapDataKeyWithPassphrase(dataKey, PASSPHRASE, {
      iterations: 100_000,
    });
    const viaPassphrase = await unwrapDataKeyWithPassphrase(passphraseSlot, PASSPHRASE);

    const code = generateRecoveryCode();
    const recoverySlot = await wrapDataKeyWithRecoveryCode(viaPassphrase, code, {
      iterations: 100_000,
    });
    const viaRecovery = await unwrapDataKeyWithRecoveryCode(recoverySlot, code);

    const prfSecret = makeDataKey(99);
    const webauthnSlot = await wrapDataKeyWithWebAuthnSecret(viaRecovery, prfSecret, {
      credentialIdBase64Url: 'cred-id',
      prfSaltBase64Url: 'salt',
    });
    const viaWebauthn = await unwrapDataKeyWithWebAuthnSecret(webauthnSlot, prfSecret);

    // Every factor unwraps to the identical original data key.
    expect(toArray(viaPassphrase)).toEqual(toArray(dataKey));
    expect(toArray(viaRecovery)).toEqual(toArray(dataKey));
    expect(toArray(viaWebauthn)).toEqual(toArray(dataKey));
  });

  it('rejects an incorrect recovery code', async () => {
    const slot = await wrapDataKeyWithRecoveryCode(makeDataKey(), generateRecoveryCode(), {
      iterations: 100_000,
    });

    await expect(
      unwrapDataKeyWithRecoveryCode(slot, 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'),
    ).rejects.toMatchObject({ factor: 'recovery' });
  });

  it('rejects a wrong WebAuthn PRF secret', async () => {
    const slot = await wrapDataKeyWithWebAuthnSecret(makeDataKey(), makeDataKey(1), {
      credentialIdBase64Url: 'cred-id',
      prfSaltBase64Url: 'salt',
    });

    await expect(unwrapDataKeyWithWebAuthnSecret(slot, makeDataKey(2))).rejects.toBeInstanceOf(
      DataKeyUnlockError,
    );
  });

  it('generates and normalises a recovery code', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/);
    expect(normalizeRecoveryCode(code)).toHaveLength(25);
    expect(normalizeRecoveryCode('abcde-fghjk')).toBe('ABCDEFGHJK');
  });

  it('refuses to wrap with a too-short passphrase', async () => {
    await expect(wrapDataKeyWithPassphrase(makeDataKey(), 'short')).rejects.toThrow();
  });
});
