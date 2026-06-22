// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WebAuthn PRF is browser/hardware dependent — stub it deterministically so the
// vault's enroll/unlock orchestration can be exercised in jsdom.
const PRF_SECRET = new Uint8Array(32).fill(42);
vi.mock('../webauthn-prf', () => ({
  isWebAuthnPrfSupported: () => true,
  createWebAuthnPrfCredential: vi.fn(async (label = 'Passkey') => ({
    credentialIdBase64Url: 'test-credential',
    prfSaltBase64Url: 'test-salt',
    prfSecret: new Uint8Array(PRF_SECRET),
    label,
  })),
  evaluateWebAuthnPrf: vi.fn(async () => new Uint8Array(PRF_SECRET)),
}));

import { WrongPassphraseError, unwrapDataKeyWithPassphrase } from '../data-key-wrapping';
import {
  __sqliteAtRestEncryptionForTesting,
  clearSqliteAtRestEncryptionStores,
  loadEncryptedSqliteSnapshot,
  persistEncryptedSqliteSnapshot,
  readDeviceWrappedDataKeyBytes,
} from '../sqlite-at-rest-encryption';
import {
  __sqliteEncryptionVaultForTesting,
  changePassphrase,
  createRecoveryCode,
  enrollWebAuthn,
  getEncryptionFactorStatus,
  removePassphrase,
  setPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  unlockWithWebAuthn,
} from '../sqlite-encryption-vault';

const DB_NAME = 'finance.db';
const PASSPHRASE = 'super-secret-passphrase';
const NEW_PASSPHRASE = 'another-strong-passphrase';
const sampleBytes = new TextEncoder().encode('SQLite format 3\0 vault test data');

async function openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readEncryptedSnapshotRecord(): Promise<unknown> {
  const { encryptedDbName, encryptedStoreName, encryptedDbKey } =
    __sqliteAtRestEncryptionForTesting;
  const db = await openDatabase(encryptedDbName, encryptedStoreName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(encryptedStoreName, 'readonly');
      const request = tx.objectStore(encryptedStoreName).get(encryptedDbKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function toArray(bytes: Uint8Array | null): number[] {
  return bytes ? Array.from(bytes) : [];
}

describe('sqlite-encryption-vault (#2806)', () => {
  beforeEach(() => {
    localStorage.setItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey, 'true');
  });

  afterEach(async () => {
    localStorage.removeItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey);
    await clearSqliteAtRestEncryptionStores();
  });

  it('wraps the same data key under a passphrase and unlocks with it', async () => {
    await persistEncryptedSqliteSnapshot(DB_NAME, sampleBytes);
    const deviceKey = await readDeviceWrappedDataKeyBytes();

    await setPassphrase(PASSPHRASE);

    const vault = await __sqliteEncryptionVaultForTesting.readVault();
    const slot = vault.slots.find((entry) => entry.kind === 'passphrase');
    expect(slot).toBeDefined();
    if (!slot || slot.kind !== 'passphrase') {
      throw new Error('expected a passphrase slot');
    }

    const viaPassphrase = await unwrapDataKeyWithPassphrase(slot, PASSPHRASE);
    // The passphrase slot must unwrap to exactly the same key as the device slot.
    expect(toArray(viaPassphrase)).toEqual(toArray(deviceKey));

    // Unlocking succeeds with the correct passphrase, rejects the wrong one.
    await expect(unlockWithPassphrase(PASSPHRASE)).resolves.toBeUndefined();
    await expect(unlockWithPassphrase('the-wrong-passphrase')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('rotates the passphrase in place without changing the data key', async () => {
    await persistEncryptedSqliteSnapshot(DB_NAME, sampleBytes);
    const deviceKeyBefore = await readDeviceWrappedDataKeyBytes();

    await setPassphrase(PASSPHRASE);
    await changePassphrase(PASSPHRASE, NEW_PASSPHRASE);

    const deviceKeyAfter = await readDeviceWrappedDataKeyBytes();
    expect(toArray(deviceKeyAfter)).toEqual(toArray(deviceKeyBefore));

    await expect(unlockWithPassphrase(NEW_PASSPHRASE)).resolves.toBeUndefined();
    await expect(unlockWithPassphrase(PASSPHRASE)).rejects.toBeInstanceOf(WrongPassphraseError);
    // Rejecting the old passphrase during rotation also fails closed.
    await expect(changePassphrase('not-the-passphrase', 'irrelevant-value')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('recovers the data key with a generated recovery code', async () => {
    await persistEncryptedSqliteSnapshot(DB_NAME, sampleBytes);

    const code = await createRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/);

    await expect(unlockWithRecoveryCode(code)).resolves.toBeUndefined();
    await expect(unlockWithRecoveryCode('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE')).rejects.toMatchObject({
      factor: 'recovery',
    });
  });

  it('enrolls and unlocks with a WebAuthn passkey factor', async () => {
    await persistEncryptedSqliteSnapshot(DB_NAME, sampleBytes);

    await enrollWebAuthn('My passkey');
    const status = await getEncryptionFactorStatus();
    expect(status.webauthn.enabled).toBe(true);
    expect(status.webauthn.label).toBe('My passkey');

    await expect(unlockWithWebAuthn()).resolves.toBeUndefined();
  });

  it('does NOT change the encrypted snapshot format when factors are added', async () => {
    await persistEncryptedSqliteSnapshot(DB_NAME, sampleBytes);
    const snapshotBefore = JSON.stringify(await readEncryptedSnapshotRecord());

    await setPassphrase(PASSPHRASE);
    await createRecoveryCode();

    const snapshotAfter = JSON.stringify(await readEncryptedSnapshotRecord());
    // The snapshot blob (and its envelope) is byte-for-byte unchanged.
    expect(snapshotAfter).toBe(snapshotBefore);

    // The data still decrypts after re-wrapping the key under new factors.
    const restored = await loadEncryptedSqliteSnapshot(DB_NAME);
    expect(toArray(restored)).toEqual(Array.from(sampleBytes));
  });

  it('reports and clears factor status', async () => {
    await persistEncryptedSqliteSnapshot(DB_NAME, sampleBytes);

    let status = await getEncryptionFactorStatus();
    expect(status.supported).toBe(true);
    expect(status.deviceUnlock).toBe(true);
    expect(status.passphrase).toBe(false);
    expect(status.factorCount).toBe(0);

    await setPassphrase(PASSPHRASE);
    status = await getEncryptionFactorStatus();
    expect(status.passphrase).toBe(true);
    expect(status.factorCount).toBe(1);

    await removePassphrase();
    status = await getEncryptionFactorStatus();
    expect(status.passphrase).toBe(false);
    expect(status.factorCount).toBe(0);
  });
});
