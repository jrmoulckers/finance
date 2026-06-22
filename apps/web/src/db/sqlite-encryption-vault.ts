// SPDX-License-Identifier: BUSL-1.1

/**
 * SQLite data-key vault (#2806).
 *
 * Persists the user-controlled wrapping factors (passphrase, WebAuthn, recovery
 * code) alongside the existing device-local wrapping in the encryption key
 * store. Every factor wraps the **same** raw data key, so enabling, rotating or
 * switching a factor only re-wraps the key — it never regenerates it and never
 * touches the encrypted snapshot blob.
 *
 * Storage layout (IndexedDB `finance-encryption` / `keys`):
 *   - `sqlite-device-wrapping-key:v1`  — device CryptoKey (unchanged, #2727)
 *   - `sqlite-data-key:v1`             — device-wrapped data key (unchanged)
 *   - `sqlite-data-key-vault:v1`       — this vault: extra factor slots (new)
 *
 * The device slot is retained so automatic same-device unlock keeps working
 * and users are never locked out. Passphrase / passkey / recovery slots add a
 * portable, user-controlled way to unlock and recover the same key.
 */

import {
  generateRecoveryCode,
  unwrapDataKeyWithPassphrase,
  unwrapDataKeyWithRecoveryCode,
  unwrapDataKeyWithWebAuthnSecret,
  wrapDataKeyWithPassphrase,
  wrapDataKeyWithRecoveryCode,
  wrapDataKeyWithWebAuthnSecret,
  type DataKeySlot,
  type PassphraseDataKeySlot,
  type RecoveryDataKeySlot,
  type WebAuthnDataKeySlot,
  type WrappingFactorKind,
} from './data-key-wrapping';
import {
  deleteEncryptionKeyStoreRecord,
  ensureSqliteDataKeyBytes,
  isSqliteAtRestEncryptionSupported,
  readDeviceWrappedDataKeyBytes,
  readEncryptionKeyStoreRecord,
  writeEncryptionKeyStoreRecord,
} from './sqlite-at-rest-encryption';
import {
  createWebAuthnPrfCredential,
  evaluateWebAuthnPrf,
  isWebAuthnPrfSupported,
} from './webauthn-prf';

const VAULT_RECORD_ID = 'sqlite-data-key-vault:v1';
const VAULT_MAGIC = 'finance.sqlite.data-key.vault';
const VAULT_VERSION = 1;

interface DataKeyVaultRecord {
  readonly magic: typeof VAULT_MAGIC;
  readonly version: typeof VAULT_VERSION;
  readonly updatedAt: string;
  readonly slots: readonly DataKeySlot[];
}

/** Snapshot of which wrapping factors currently protect the data key. */
export interface EncryptionFactorStatus {
  /** Web Crypto + IndexedDB available for at-rest encryption. */
  readonly supported: boolean;
  /** WebAuthn available for the passkey factor. */
  readonly webAuthnSupported: boolean;
  /** Device-local automatic unlock is provisioned. */
  readonly deviceUnlock: boolean;
  /** A passphrase factor is configured. */
  readonly passphrase: boolean;
  /** A recovery code factor is configured. */
  readonly recovery: boolean;
  /** Passkey factor configuration. */
  readonly webauthn: { readonly enabled: boolean; readonly label?: string };
  /** Number of user-controlled factors (passphrase + recovery + passkey). */
  readonly factorCount: number;
}

// In-memory unlocked-key cache for the current tab session. Used to confirm an
// unlock succeeded without persisting plaintext. Cleared on lock / reload.
let sessionUnlocked = false;

export function isEncryptionSessionUnlocked(): boolean {
  return sessionUnlocked;
}

export function lockEncryptionSession(): void {
  sessionUnlocked = false;
}

export async function getEncryptionFactorStatus(): Promise<EncryptionFactorStatus> {
  const supported = isSqliteAtRestEncryptionSupported();
  if (!supported) {
    return {
      supported: false,
      webAuthnSupported: false,
      deviceUnlock: false,
      passphrase: false,
      recovery: false,
      webauthn: { enabled: false },
      factorCount: 0,
    };
  }

  const [deviceBytes, vault] = await Promise.all([
    readDeviceWrappedDataKeyBytes().catch(() => null),
    readVault(),
  ]);
  if (deviceBytes) {
    deviceBytes.fill(0);
  }

  const passphraseSlot = findSlot(vault, 'passphrase');
  const recoverySlot = findSlot(vault, 'recovery');
  const webauthnSlot = findSlot(vault, 'webauthn') as WebAuthnDataKeySlot | undefined;
  const factorCount = [passphraseSlot, recoverySlot, webauthnSlot].filter(Boolean).length;

  return {
    supported: true,
    webAuthnSupported: isWebAuthnPrfSupported(),
    deviceUnlock: deviceBytes !== null,
    passphrase: Boolean(passphraseSlot),
    recovery: Boolean(recoverySlot),
    webauthn: {
      enabled: Boolean(webauthnSlot),
      ...(webauthnSlot?.label ? { label: webauthnSlot.label } : {}),
    },
    factorCount,
  };
}

// ---------------------------------------------------------------------------
// Passphrase factor
// ---------------------------------------------------------------------------

export async function setPassphrase(passphrase: string): Promise<void> {
  const raw = await ensureSqliteDataKeyBytes();
  try {
    const existing = findSlot(await readVault(), 'passphrase') as PassphraseDataKeySlot | undefined;
    const slot = await wrapDataKeyWithPassphrase(raw, passphrase, {
      slotId: existing?.slotId,
      createdAt: existing?.createdAt,
      label: 'Passphrase',
    });
    await upsertSlot(slot);
    sessionUnlocked = true;
  } finally {
    raw.fill(0);
  }
}

export async function changePassphrase(current: string, next: string): Promise<void> {
  const slot = findSlot(await readVault(), 'passphrase') as PassphraseDataKeySlot | undefined;
  if (!slot) {
    throw new Error('No passphrase is set on this device yet.');
  }
  // Verifies the current passphrase (throws WrongPassphraseError on mismatch)
  // and recovers the *same* raw data key to re-wrap with the new passphrase.
  const raw = await unwrapDataKeyWithPassphrase(slot, current);
  try {
    const rotated = await wrapDataKeyWithPassphrase(raw, next, {
      slotId: slot.slotId,
      createdAt: slot.createdAt,
      label: slot.label ?? 'Passphrase',
    });
    await upsertSlot(rotated);
    sessionUnlocked = true;
  } finally {
    raw.fill(0);
  }
}

export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  const slot = findSlot(await readVault(), 'passphrase') as PassphraseDataKeySlot | undefined;
  if (!slot) {
    throw new Error('No passphrase is set on this device yet.');
  }
  const raw = await unwrapDataKeyWithPassphrase(slot, passphrase);
  raw.fill(0);
  sessionUnlocked = true;
}

export async function removePassphrase(): Promise<void> {
  await removeFactor('passphrase');
}

// ---------------------------------------------------------------------------
// Recovery-code factor
// ---------------------------------------------------------------------------

/** Provision (or rotate) the recovery code. Returns the plaintext code once. */
export async function createRecoveryCode(): Promise<string> {
  const raw = await ensureSqliteDataKeyBytes();
  try {
    const code = generateRecoveryCode();
    const existing = findSlot(await readVault(), 'recovery') as RecoveryDataKeySlot | undefined;
    const slot = await wrapDataKeyWithRecoveryCode(raw, code, {
      slotId: existing?.slotId,
      createdAt: existing?.createdAt,
      label: 'Recovery code',
    });
    await upsertSlot(slot);
    return code;
  } finally {
    raw.fill(0);
  }
}

export async function unlockWithRecoveryCode(recoveryCode: string): Promise<void> {
  const slot = findSlot(await readVault(), 'recovery') as RecoveryDataKeySlot | undefined;
  if (!slot) {
    throw new Error('No recovery code is set on this device yet.');
  }
  const raw = await unwrapDataKeyWithRecoveryCode(slot, recoveryCode);
  raw.fill(0);
  sessionUnlocked = true;
}

export async function removeRecoveryCode(): Promise<void> {
  await removeFactor('recovery');
}

// ---------------------------------------------------------------------------
// WebAuthn (passkey) factor
// ---------------------------------------------------------------------------

export async function enrollWebAuthn(label = 'Passkey'): Promise<void> {
  const raw = await ensureSqliteDataKeyBytes();
  let prfSecret: Uint8Array | null = null;
  try {
    const enrollment = await createWebAuthnPrfCredential(label);
    prfSecret = enrollment.prfSecret;
    const slot = await wrapDataKeyWithWebAuthnSecret(raw, prfSecret, {
      credentialIdBase64Url: enrollment.credentialIdBase64Url,
      prfSaltBase64Url: enrollment.prfSaltBase64Url,
      label: enrollment.label,
    });
    await upsertSlot(slot);
    sessionUnlocked = true;
  } finally {
    raw.fill(0);
    prfSecret?.fill(0);
  }
}

export async function unlockWithWebAuthn(): Promise<void> {
  const slot = findSlot(await readVault(), 'webauthn') as WebAuthnDataKeySlot | undefined;
  if (!slot) {
    throw new Error('No passkey is enrolled on this device yet.');
  }
  const secret = await evaluateWebAuthnPrf(slot.credentialIdBase64Url, slot.prfSaltBase64Url);
  try {
    const raw = await unwrapDataKeyWithWebAuthnSecret(slot, secret);
    raw.fill(0);
    sessionUnlocked = true;
  } finally {
    secret.fill(0);
  }
}

export async function removeWebAuthn(): Promise<void> {
  await removeFactor('webauthn');
}

// ---------------------------------------------------------------------------
// Vault persistence helpers
// ---------------------------------------------------------------------------

async function readVault(): Promise<DataKeyVaultRecord> {
  const record = await readEncryptionKeyStoreRecord<DataKeyVaultRecord>(VAULT_RECORD_ID);
  if (!record || record.magic !== VAULT_MAGIC || record.version !== VAULT_VERSION) {
    return { magic: VAULT_MAGIC, version: VAULT_VERSION, updatedAt: '', slots: [] };
  }
  return record;
}

async function writeVault(slots: readonly DataKeySlot[]): Promise<void> {
  if (slots.length === 0) {
    await deleteEncryptionKeyStoreRecord(VAULT_RECORD_ID);
    return;
  }
  const record: DataKeyVaultRecord = {
    magic: VAULT_MAGIC,
    version: VAULT_VERSION,
    updatedAt: new Date().toISOString(),
    slots,
  };
  await writeEncryptionKeyStoreRecord(VAULT_RECORD_ID, record);
}

async function upsertSlot(slot: DataKeySlot): Promise<void> {
  const vault = await readVault();
  const next = vault.slots.filter((existing) => existing.kind !== slot.kind);
  next.push(slot);
  await writeVault(next);
}

async function removeFactor(kind: WrappingFactorKind): Promise<void> {
  const vault = await readVault();
  const next = vault.slots.filter((slot) => slot.kind !== kind);
  if (next.length !== vault.slots.length) {
    await writeVault(next);
  }
}

function findSlot(vault: DataKeyVaultRecord, kind: WrappingFactorKind): DataKeySlot | undefined {
  return vault.slots.find((slot) => slot.kind === kind);
}

export const __sqliteEncryptionVaultForTesting = {
  vaultRecordId: VAULT_RECORD_ID,
  readVault,
};
