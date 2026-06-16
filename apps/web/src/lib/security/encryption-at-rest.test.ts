// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptLocalBytes,
  deriveLocalEncryptionKeyFromPassphrase,
  encryptLocalBytes,
  generateLocalEncryptionKey,
  isWebCryptoEncryptionSupported,
} from './encryption-at-rest';

describe('encryption-at-rest helpers', () => {
  it('detects Web Crypto encryption support', () => {
    expect(isWebCryptoEncryptionSupported()).toBe(true);
  });

  it('encrypts and decrypts bytes with AES-GCM additional authenticated data', async () => {
    const key = await generateLocalEncryptionKey();
    const plaintext = new TextEncoder().encode('checking account balance: 123456');
    const additionalData = new TextEncoder().encode('finance.db:v1');

    const envelope = await encryptLocalBytes(plaintext, key, { additionalData });
    const decrypted = await decryptLocalBytes(envelope, key, { additionalData });

    expect(new TextDecoder().decode(decrypted)).toBe('checking account balance: 123456');
    expect(envelope.ciphertextBase64Url).not.toContain('123456');
    expect(envelope.ivBase64Url).toHaveLength(16);
  });

  it('fails decryption when authenticated metadata changes', async () => {
    const key = await generateLocalEncryptionKey();
    const envelope = await encryptLocalBytes(new TextEncoder().encode('secret'), key, {
      additionalData: new TextEncoder().encode('metadata-a'),
    });

    await expect(
      decryptLocalBytes(envelope, key, { additionalData: new TextEncoder().encode('metadata-b') }),
    ).rejects.toThrow();
  });

  it('derives non-extractable keys from passphrases with caller-owned salt', async () => {
    const salt = new Uint8Array(16).fill(7);
    const first = await deriveLocalEncryptionKeyFromPassphrase('correct horse battery staple', {
      salt,
      iterations: 100_000,
    });
    const second = await deriveLocalEncryptionKeyFromPassphrase('correct horse battery staple', {
      salt,
      iterations: 100_000,
    });
    const envelope = await encryptLocalBytes(new TextEncoder().encode('recoverable'), first.key, {
      iv: new Uint8Array(12).fill(3),
    });

    const recovered = await decryptLocalBytes(envelope, second.key);
    expect(new TextDecoder().decode(recovered)).toBe('recoverable');
    expect(first.key.extractable).toBe(false);
    expect(first.algorithm).toBe('PBKDF2-SHA-256');
  });

  it('round-trips base64url bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });
});
