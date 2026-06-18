// SPDX-License-Identifier: BUSL-1.1

/**
 * Web Crypto helpers for browser-local encryption at rest.
 *
 * These helpers intentionally do not persist raw keys. Callers should keep
 * `CryptoKey` objects in memory and persist only non-secret metadata plus
 * ciphertext envelopes.
 */

export const LOCAL_ENCRYPTION_VERSION = 1;
export const LOCAL_ENCRYPTION_ALGORITHM = 'AES-GCM' as const;
export const LOCAL_KEY_DERIVATION_ALGORITHM = 'PBKDF2-SHA-256' as const;
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;
export const AES_GCM_IV_BYTES = 12;
export const PBKDF2_SALT_BYTES = 16;

export interface LocalEncryptionEnvelope {
  readonly version: typeof LOCAL_ENCRYPTION_VERSION;
  readonly algorithm: typeof LOCAL_ENCRYPTION_ALGORITHM;
  readonly ivBase64Url: string;
  readonly ciphertextBase64Url: string;
  readonly additionalDataBase64Url?: string;
}

export interface PassphraseDerivedKeyMaterial {
  readonly key: CryptoKey;
  readonly salt: Uint8Array;
  readonly iterations: number;
  readonly algorithm: typeof LOCAL_KEY_DERIVATION_ALGORITHM;
}

export interface DeriveLocalEncryptionKeyOptions {
  readonly salt?: Uint8Array;
  readonly iterations?: number;
  readonly crypto?: Crypto;
}

export interface EncryptLocalBytesOptions {
  readonly iv?: Uint8Array;
  readonly additionalData?: Uint8Array;
  readonly crypto?: Crypto;
}

export interface DecryptLocalBytesOptions {
  readonly additionalData?: Uint8Array;
  readonly crypto?: Crypto;
}

export function isWebCryptoEncryptionSupported(
  cryptoImpl: Crypto | undefined = globalThis.crypto,
): boolean {
  return (
    typeof cryptoImpl?.subtle?.encrypt === 'function' &&
    typeof cryptoImpl.getRandomValues === 'function'
  );
}

export function generateLocalEncryptionSalt(
  cryptoImpl: Crypto | undefined = globalThis.crypto,
): Uint8Array {
  return getCrypto(cryptoImpl).getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
}

export function generateLocalEncryptionIv(
  cryptoImpl: Crypto | undefined = globalThis.crypto,
): Uint8Array {
  return getCrypto(cryptoImpl).getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
}

export async function deriveLocalEncryptionKeyFromPassphrase(
  passphrase: string,
  options: DeriveLocalEncryptionKeyOptions = {},
): Promise<PassphraseDerivedKeyMaterial> {
  if (passphrase.trim().length < 12) {
    throw new Error('Local encryption passphrase must be at least 12 non-whitespace characters.');
  }

  const cryptoImpl = getCrypto(options.crypto);
  const salt = options.salt ?? generateLocalEncryptionSalt(cryptoImpl);
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  if (iterations < 100_000) {
    throw new Error('Local encryption PBKDF2 iterations must be at least 100000.');
  }

  const keyMaterial = await cryptoImpl.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await cryptoImpl.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: LOCAL_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { key, salt, iterations, algorithm: LOCAL_KEY_DERIVATION_ALGORITHM };
}

export async function generateLocalEncryptionKey(
  cryptoImpl: Crypto | undefined = globalThis.crypto,
): Promise<CryptoKey> {
  return getCrypto(cryptoImpl).subtle.generateKey(
    { name: LOCAL_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptLocalBytes(
  plaintext: Uint8Array,
  key: CryptoKey,
  options: EncryptLocalBytesOptions = {},
): Promise<LocalEncryptionEnvelope> {
  const cryptoImpl = getCrypto(options.crypto);
  const iv = options.iv ?? generateLocalEncryptionIv(cryptoImpl);
  const ciphertext = await cryptoImpl.subtle.encrypt(
    {
      name: LOCAL_ENCRYPTION_ALGORITHM,
      iv: toArrayBuffer(iv),
      additionalData: toOptionalArrayBuffer(options.additionalData),
    },
    key,
    toArrayBuffer(plaintext),
  );

  return {
    version: LOCAL_ENCRYPTION_VERSION,
    algorithm: LOCAL_ENCRYPTION_ALGORITHM,
    ivBase64Url: bytesToBase64Url(iv),
    ciphertextBase64Url: bytesToBase64Url(new Uint8Array(ciphertext)),
    ...(options.additionalData
      ? { additionalDataBase64Url: bytesToBase64Url(options.additionalData) }
      : {}),
  };
}

export async function decryptLocalBytes(
  envelope: LocalEncryptionEnvelope,
  key: CryptoKey,
  options: DecryptLocalBytesOptions = {},
): Promise<Uint8Array> {
  if (
    envelope.version !== LOCAL_ENCRYPTION_VERSION ||
    envelope.algorithm !== LOCAL_ENCRYPTION_ALGORITHM
  ) {
    throw new Error('Unsupported local encryption envelope.');
  }

  const cryptoImpl = getCrypto(options.crypto);
  const additionalData = options.additionalData ?? decodeOptionalAdditionalData(envelope);
  const plaintext = await cryptoImpl.subtle.decrypt(
    {
      name: LOCAL_ENCRYPTION_ALGORITHM,
      iv: toArrayBuffer(base64UrlToBytes(envelope.ivBase64Url)),
      additionalData: toOptionalArrayBuffer(additionalData),
    },
    key,
    toArrayBuffer(base64UrlToBytes(envelope.ciphertextBase64Url)),
  );

  return new Uint8Array(plaintext);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeOptionalAdditionalData(envelope: LocalEncryptionEnvelope): Uint8Array | undefined {
  return envelope.additionalDataBase64Url
    ? base64UrlToBytes(envelope.additionalDataBase64Url)
    : undefined;
}

function getCrypto(cryptoImpl: Crypto | undefined): Crypto {
  const activeCrypto = cryptoImpl ?? globalThis.crypto;
  if (!isWebCryptoEncryptionSupported(activeCrypto)) {
    throw new Error('Web Crypto AES-GCM encryption is not available in this browser.');
  }
  return activeCrypto;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toOptionalArrayBuffer(bytes: Uint8Array | undefined): ArrayBuffer | undefined {
  return bytes ? toArrayBuffer(bytes) : undefined;
}
