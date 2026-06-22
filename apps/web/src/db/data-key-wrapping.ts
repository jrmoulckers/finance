// SPDX-License-Identifier: BUSL-1.1

/**
 * Envelope wrapping for the SQLite at-rest **data key** (#2806, follow-up to
 * #2727).
 *
 * The core at-rest encryption (`sqlite-at-rest-encryption.ts`) stores a single
 * random 256-bit AES-GCM *data key* and uses it to encrypt the SQLite snapshot
 * envelope. This module adds user-controlled wrapping factors —
 * passphrase, WebAuthn (PRF) and recovery code — that each *re-wrap the very
 * same raw data key* into an independent "key slot".
 *
 * Security invariants:
 *   - The raw data key is **never regenerated** when switching/rotating
 *     factors; only the wrapping changes (envelope re-wrap). This preserves the
 *     on-disk snapshot format and avoids re-encrypting the whole database.
 *   - The raw data key is never persisted in plaintext. Each slot stores only a
 *     KDF descriptor (salt + iterations, non-secret) and an AES-GCM envelope.
 *   - Unwrapping with the wrong passphrase fails closed via the AES-GCM
 *     authentication tag — no partial plaintext and no key material leak.
 *
 * This file is intentionally free of IndexedDB / DOM concerns so it can be unit
 * tested in isolation. Persistence lives in `sqlite-encryption-vault.ts`.
 */

import {
  bytesToBase64Url,
  base64UrlToBytes,
  decryptLocalBytes,
  deriveLocalEncryptionKeyFromPassphrase,
  encryptLocalBytes,
  type LocalEncryptionEnvelope,
} from '../lib/security/encryption-at-rest';

export const DATA_KEY_SLOT_MAGIC = 'finance.sqlite.data-key.slot' as const;
export const DATA_KEY_SLOT_VERSION = 1 as const;

/** Length of the raw AES-256 data key in bytes. */
export const RAW_DATA_KEY_BYTES = 32;

/** Minimum passphrase length (non-whitespace) enforced before wrapping. */
export const MIN_PASSPHRASE_LENGTH = 12;

/** The user-controllable wrapping factors that can protect the data key. */
export type WrappingFactorKind = 'passphrase' | 'webauthn' | 'recovery';

interface BaseDataKeySlot {
  readonly magic: typeof DATA_KEY_SLOT_MAGIC;
  readonly version: typeof DATA_KEY_SLOT_VERSION;
  readonly kind: WrappingFactorKind;
  /** Stable identifier for the slot — reused across in-place rotations. */
  readonly slotId: string;
  readonly label?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** AES-GCM envelope wrapping the raw data key bytes. */
  readonly envelope: LocalEncryptionEnvelope;
}

interface KdfDescriptor {
  readonly algorithm: 'PBKDF2-SHA-256';
  readonly saltBase64Url: string;
  readonly iterations: number;
}

/** Slot wrapped by a user passphrase (PBKDF2-derived key). */
export interface PassphraseDataKeySlot extends BaseDataKeySlot {
  readonly kind: 'passphrase';
  readonly kdf: KdfDescriptor;
}

/** Slot wrapped by a generated recovery code (PBKDF2-derived key). */
export interface RecoveryDataKeySlot extends BaseDataKeySlot {
  readonly kind: 'recovery';
  readonly kdf: KdfDescriptor;
}

/** Slot wrapped by a WebAuthn authenticator-derived PRF secret. */
export interface WebAuthnDataKeySlot extends BaseDataKeySlot {
  readonly kind: 'webauthn';
  readonly credentialIdBase64Url: string;
  readonly prfSaltBase64Url: string;
}

export type DataKeySlot = PassphraseDataKeySlot | RecoveryDataKeySlot | WebAuthnDataKeySlot;

const DEFAULT_PBKDF2_ITERATIONS = 310_000;

/** Raised when a wrapping factor cannot unwrap the data key. */
export class DataKeyUnlockError extends Error {
  readonly factor: WrappingFactorKind;

  constructor(factor: WrappingFactorKind, message: string) {
    super(message);
    this.name = 'DataKeyUnlockError';
    this.factor = factor;
  }
}

/** Raised specifically when a passphrase / recovery code is incorrect. */
export class WrongPassphraseError extends DataKeyUnlockError {
  constructor(factor: 'passphrase' | 'recovery' = 'passphrase') {
    super(
      factor,
      factor === 'recovery'
        ? 'That recovery code is not correct. Check for typos and try again.'
        : 'That passphrase is not correct. Check for typos and try again.',
    );
    this.name = 'WrongPassphraseError';
  }
}

export interface WrapWithPassphraseOptions {
  readonly slotId?: string;
  readonly label?: string;
  readonly iterations?: number;
  readonly createdAt?: string;
  readonly now?: string;
}

// ---------------------------------------------------------------------------
// Passphrase factor
// ---------------------------------------------------------------------------

export async function wrapDataKeyWithPassphrase(
  rawDataKey: Uint8Array,
  passphrase: string,
  options: WrapWithPassphraseOptions = {},
): Promise<PassphraseDataKeySlot> {
  return wrapWithKdf(
    'passphrase',
    rawDataKey,
    passphrase,
    options,
  ) as Promise<PassphraseDataKeySlot>;
}

export async function unwrapDataKeyWithPassphrase(
  slot: PassphraseDataKeySlot,
  passphrase: string,
): Promise<Uint8Array> {
  return unwrapWithKdf(slot, passphrase);
}

// ---------------------------------------------------------------------------
// Recovery-code factor
// ---------------------------------------------------------------------------

export async function wrapDataKeyWithRecoveryCode(
  rawDataKey: Uint8Array,
  recoveryCode: string,
  options: WrapWithPassphraseOptions = {},
): Promise<RecoveryDataKeySlot> {
  return wrapWithKdf(
    'recovery',
    rawDataKey,
    normalizeRecoveryCode(recoveryCode),
    options,
  ) as Promise<RecoveryDataKeySlot>;
}

export async function unwrapDataKeyWithRecoveryCode(
  slot: RecoveryDataKeySlot,
  recoveryCode: string,
): Promise<Uint8Array> {
  return unwrapWithKdf(slot, normalizeRecoveryCode(recoveryCode));
}

// ---------------------------------------------------------------------------
// WebAuthn (PRF) factor
// ---------------------------------------------------------------------------

export interface WrapWithWebAuthnOptions {
  readonly credentialIdBase64Url: string;
  readonly prfSaltBase64Url: string;
  readonly slotId?: string;
  readonly label?: string;
  readonly createdAt?: string;
  readonly now?: string;
}

export async function wrapDataKeyWithWebAuthnSecret(
  rawDataKey: Uint8Array,
  prfSecret: Uint8Array,
  options: WrapWithWebAuthnOptions,
): Promise<WebAuthnDataKeySlot> {
  assertRawDataKey(rawDataKey);
  const key = await importAesGcmKeyFromSecret(prfSecret);
  const slotId = options.slotId ?? randomSlotId();
  const now = options.now ?? new Date().toISOString();
  const envelope = await encryptLocalBytes(rawDataKey, key, {
    additionalData: slotAdditionalData('webauthn', slotId),
  });

  return {
    magic: DATA_KEY_SLOT_MAGIC,
    version: DATA_KEY_SLOT_VERSION,
    kind: 'webauthn',
    slotId,
    ...(options.label ? { label: options.label } : {}),
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    credentialIdBase64Url: options.credentialIdBase64Url,
    prfSaltBase64Url: options.prfSaltBase64Url,
    envelope,
  };
}

export async function unwrapDataKeyWithWebAuthnSecret(
  slot: WebAuthnDataKeySlot,
  prfSecret: Uint8Array,
): Promise<Uint8Array> {
  const key = await importAesGcmKeyFromSecret(prfSecret);
  try {
    const raw = await decryptLocalBytes(slot.envelope, key, {
      additionalData: slotAdditionalData('webauthn', slot.slotId),
    });
    assertRawDataKey(raw);
    return raw;
  } catch (error) {
    if (error instanceof DataKeyUnlockError) {
      throw error;
    }
    throw new DataKeyUnlockError(
      'webauthn',
      'This passkey could not unlock your data. It may be the wrong passkey for this device.',
    );
  }
}

// ---------------------------------------------------------------------------
// Recovery-code generation
// ---------------------------------------------------------------------------

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Crockford-ish, no I/O/0/1 (32 chars = 2^5)
const RECOVERY_GROUPS = 5;
const RECOVERY_GROUP_LENGTH = 5;
// The alphabet length is a power of two, so masking the low bits of a uniform
// random byte selects an index uniformly with no modulo bias. We mask instead
// of using `% length` to make the lack of bias explicit and statically provable.
const RECOVERY_ALPHABET_MASK = RECOVERY_ALPHABET.length - 1;

/**
 * Generate a human-readable, high-entropy recovery code such as
 * `ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2` (25 chars, ~128 bits of entropy).
 */
export function generateRecoveryCode(cryptoImpl: Crypto = globalThis.crypto): string {
  // Guard against a future edit changing the alphabet to a non-power-of-two
  // length, which would reintroduce modulo/masking bias.
  if ((RECOVERY_ALPHABET.length & RECOVERY_ALPHABET_MASK) !== 0) {
    throw new Error('RECOVERY_ALPHABET length must be a power of two for unbiased sampling.');
  }
  const total = RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH;
  const randomValues = cryptoImpl.getRandomValues(new Uint8Array(total));
  const chars: string[] = [];
  for (let index = 0; index < total; index += 1) {
    chars.push(RECOVERY_ALPHABET[randomValues[index] & RECOVERY_ALPHABET_MASK]);
  }
  const groups: string[] = [];
  for (let group = 0; group < RECOVERY_GROUPS; group += 1) {
    groups.push(
      chars.slice(group * RECOVERY_GROUP_LENGTH, (group + 1) * RECOVERY_GROUP_LENGTH).join(''),
    );
  }
  return groups.join('-');
}

/** Strip separators / whitespace and upper-case for stable KDF input. */
export function normalizeRecoveryCode(recoveryCode: string): string {
  return recoveryCode.replace(/[\s-]+/g, '').toUpperCase();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function wrapWithKdf(
  kind: 'passphrase' | 'recovery',
  rawDataKey: Uint8Array,
  secret: string,
  options: WrapWithPassphraseOptions,
): Promise<PassphraseDataKeySlot | RecoveryDataKeySlot> {
  assertRawDataKey(rawDataKey);
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const material = await deriveLocalEncryptionKeyFromPassphrase(secret, { iterations });
  const slotId = options.slotId ?? randomSlotId();
  const now = options.now ?? new Date().toISOString();
  const envelope = await encryptLocalBytes(rawDataKey, material.key, {
    additionalData: slotAdditionalData(kind, slotId),
  });

  return {
    magic: DATA_KEY_SLOT_MAGIC,
    version: DATA_KEY_SLOT_VERSION,
    kind,
    slotId,
    ...(options.label ? { label: options.label } : {}),
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    kdf: {
      algorithm: 'PBKDF2-SHA-256',
      saltBase64Url: bytesToBase64Url(material.salt),
      iterations: material.iterations,
    },
    envelope,
  };
}

async function unwrapWithKdf(
  slot: PassphraseDataKeySlot | RecoveryDataKeySlot,
  secret: string,
): Promise<Uint8Array> {
  const salt = base64UrlToBytes(slot.kdf.saltBase64Url);
  const material = await deriveLocalEncryptionKeyFromPassphrase(secret, {
    salt,
    iterations: slot.kdf.iterations,
  });

  try {
    const raw = await decryptLocalBytes(slot.envelope, material.key, {
      additionalData: slotAdditionalData(slot.kind, slot.slotId),
    });
    assertRawDataKey(raw);
    return raw;
  } catch {
    // AES-GCM tag mismatch (wrong secret) or unexpected payload — fail closed.
    throw new WrongPassphraseError(slot.kind);
  }
}

async function importAesGcmKeyFromSecret(secret: Uint8Array): Promise<CryptoKey> {
  // PRF output is already a uniformly-random secret. Normalise to 32 bytes via
  // SHA-256 (universally supported) so any authenticator PRF length works.
  const material =
    secret.byteLength === RAW_DATA_KEY_BYTES
      ? secret
      : new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(secret)));
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(material),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function slotAdditionalData(kind: WrappingFactorKind, slotId: string): Uint8Array {
  return new TextEncoder().encode(
    `${DATA_KEY_SLOT_MAGIC}:v${DATA_KEY_SLOT_VERSION}:${kind}:${slotId}`,
  );
}

function randomSlotId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertRawDataKey(bytes: Uint8Array): void {
  if (bytes.byteLength !== RAW_DATA_KEY_BYTES) {
    throw new Error('Unexpected SQLite data-key length.');
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function isDataKeySlot(value: unknown): value is DataKeySlot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<BaseDataKeySlot>;
  return (
    record.magic === DATA_KEY_SLOT_MAGIC &&
    record.version === DATA_KEY_SLOT_VERSION &&
    (record.kind === 'passphrase' || record.kind === 'webauthn' || record.kind === 'recovery') &&
    typeof record.slotId === 'string' &&
    typeof record.envelope === 'object'
  );
}
