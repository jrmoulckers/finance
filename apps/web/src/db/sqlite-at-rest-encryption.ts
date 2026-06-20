// SPDX-License-Identifier: BUSL-1.1

import {
  decryptLocalBytes,
  encryptLocalBytes,
  generateLocalEncryptionKey,
  isWebCryptoEncryptionSupported,
  type LocalEncryptionEnvelope,
} from '../lib/security/encryption-at-rest';

const ENCRYPTION_FLAG_OVERRIDE_KEY = 'finance.sqliteAtRestEncryption.enabled';
const ENCRYPTION_ENV_FLAG = 'VITE_SQLITE_AT_REST_ENCRYPTION';

const KEY_DB_NAME = 'finance-encryption';
const KEY_STORE_NAME = 'keys';
const DEVICE_WRAPPING_KEY_ID = 'sqlite-device-wrapping-key:v1';
const WRAPPED_DATA_KEY_ID = 'sqlite-data-key:v1';

const ENCRYPTED_DB_NAME = 'finance-sqlite-encrypted';
const ENCRYPTED_STORE_NAME = 'encrypted';
const ENCRYPTED_DB_KEY = 'db';
const ENCRYPTED_DB_PENDING_KEY = 'db:pending';

const SNAPSHOT_MAGIC = 'finance.sqlite.snapshot.encrypted';
const WRAPPED_KEY_MAGIC = 'finance.sqlite.data-key.wrapped';
const FORMAT_VERSION = 1;
const RAW_AES_KEY_BYTES = 32;

interface EncryptedSqliteSnapshotRecord {
  readonly magic: typeof SNAPSHOT_MAGIC;
  readonly version: typeof FORMAT_VERSION;
  readonly databaseName: string;
  readonly keyId: typeof WRAPPED_DATA_KEY_ID;
  readonly encryptedAt: string;
  readonly envelope: LocalEncryptionEnvelope;
}

interface WrappedDataKeyRecord {
  readonly magic: typeof WRAPPED_KEY_MAGIC;
  readonly version: typeof FORMAT_VERSION;
  readonly keyId: typeof WRAPPED_DATA_KEY_ID;
  readonly wrappingKeyId: typeof DEVICE_WRAPPING_KEY_ID;
  readonly createdAt: string;
  readonly envelope: LocalEncryptionEnvelope;
}

/**
 * Device-local encryption-at-rest for the sql.js IndexedDB fallback.
 *
 * Threat model for #2727 core: when the opt-in flag is enabled, raw SQLite
 * bytes are never persisted to the legacy plaintext IndexedDB store. A
 * non-extractable device wrapping key is stored by the browser as a CryptoKey,
 * then used to wrap a random SQLite data key. This protects against casual
 * at-rest inspection of the SQLite blob and preserves automatic unlock on the
 * same browser profile. It does not protect against XSS running in this origin
 * or a fully-compromised/unlocked browser profile; a passphrase/WebAuthn unlock
 * flow should wrap this data key in a follow-up without changing the snapshot
 * format.
 */

export function isSqliteAtRestEncryptionEnabled(): boolean {
  const override = readLocalStorageFlag();
  if (override !== null) {
    return override;
  }

  return import.meta.env[ENCRYPTION_ENV_FLAG] === 'true';
}

export function isSqliteAtRestEncryptionSupported(): boolean {
  return typeof indexedDB !== 'undefined' && isWebCryptoEncryptionSupported();
}

export async function hasEncryptedSqliteSnapshot(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }
  return (await readEncryptedSnapshotRecord()) !== null;
}

export async function loadEncryptedSqliteSnapshot(
  databaseName: string,
): Promise<Uint8Array | null> {
  const record = await readEncryptedSnapshotRecord();
  if (!record) {
    return null;
  }
  validateSnapshotRecord(record, databaseName);

  const dataKey = await getOrCreateSqliteDataKey();
  return decryptLocalBytes(record.envelope, dataKey, {
    additionalData: snapshotAdditionalData(databaseName, record.keyId),
  });
}

export async function persistEncryptedSqliteSnapshot(
  databaseName: string,
  plaintext: Uint8Array,
): Promise<void> {
  const dataKey = await getOrCreateSqliteDataKey();
  const record: EncryptedSqliteSnapshotRecord = {
    magic: SNAPSHOT_MAGIC,
    version: FORMAT_VERSION,
    databaseName,
    keyId: WRAPPED_DATA_KEY_ID,
    encryptedAt: new Date().toISOString(),
    envelope: await encryptLocalBytes(plaintext, dataKey, {
      additionalData: snapshotAdditionalData(databaseName, WRAPPED_DATA_KEY_ID),
    }),
  };

  await writeEncryptedSnapshotRecord(ENCRYPTED_DB_PENDING_KEY, record);
  const persisted = await readEncryptedSnapshotRecord(ENCRYPTED_DB_PENDING_KEY);
  if (!persisted) {
    throw new Error('Encrypted SQLite snapshot verification failed before commit.');
  }

  validateSnapshotRecord(persisted, databaseName);
  const verified = await decryptLocalBytes(persisted.envelope, dataKey, {
    additionalData: snapshotAdditionalData(databaseName, persisted.keyId),
  });
  if (!bytesEqual(verified, plaintext)) {
    throw new Error('Encrypted SQLite snapshot verification produced different bytes.');
  }

  await commitEncryptedSnapshotRecord(record);
}

export async function clearSqliteAtRestEncryptionStores(): Promise<void> {
  await Promise.all([
    deleteDatabaseBestEffort(ENCRYPTED_DB_NAME),
    deleteDatabaseBestEffort(KEY_DB_NAME),
  ]);
}

export const __sqliteAtRestEncryptionForTesting = {
  encryptedDbName: ENCRYPTED_DB_NAME,
  encryptedStoreName: ENCRYPTED_STORE_NAME,
  encryptedDbKey: ENCRYPTED_DB_KEY,
  flagOverrideKey: ENCRYPTION_FLAG_OVERRIDE_KEY,
  keyDbName: KEY_DB_NAME,
  clearStores: clearSqliteAtRestEncryptionStores,
};

function readLocalStorageFlag(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const value = localStorage.getItem(ENCRYPTION_FLAG_OVERRIDE_KEY);
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  } catch {
    return null;
  }
  return null;
}

async function getOrCreateSqliteDataKey(): Promise<CryptoKey> {
  const keyStore = await openKeyStore();
  try {
    const wrappingKey = await getOrCreateDeviceWrappingKey(keyStore);
    const wrapped = await readValue<WrappedDataKeyRecord>(keyStore, WRAPPED_DATA_KEY_ID);
    if (wrapped) {
      validateWrappedDataKeyRecord(wrapped);
      const rawKey = await decryptLocalBytes(wrapped.envelope, wrappingKey, {
        additionalData: dataKeyAdditionalData(wrapped.keyId, wrapped.wrappingKeyId),
      });
      const dataKey = await importAesGcmDataKey(rawKey, false);
      rawKey.fill(0);
      return dataKey;
    }

    const rawKey = crypto.getRandomValues(new Uint8Array(RAW_AES_KEY_BYTES));
    const dataKey = await importAesGcmDataKey(rawKey, false);
    const wrappedRecord: WrappedDataKeyRecord = {
      magic: WRAPPED_KEY_MAGIC,
      version: FORMAT_VERSION,
      keyId: WRAPPED_DATA_KEY_ID,
      wrappingKeyId: DEVICE_WRAPPING_KEY_ID,
      createdAt: new Date().toISOString(),
      envelope: await encryptLocalBytes(rawKey, wrappingKey, {
        additionalData: dataKeyAdditionalData(WRAPPED_DATA_KEY_ID, DEVICE_WRAPPING_KEY_ID),
      }),
    };
    await writeValue(keyStore, WRAPPED_DATA_KEY_ID, wrappedRecord);
    rawKey.fill(0);
    return dataKey;
  } finally {
    keyStore.close();
  }
}

async function getOrCreateDeviceWrappingKey(keyStore: IDBDatabase): Promise<CryptoKey> {
  const existing = await readValue<CryptoKey>(keyStore, DEVICE_WRAPPING_KEY_ID);
  if (existing) {
    return existing;
  }

  const key = await generateLocalEncryptionKey();
  await writeValue(keyStore, DEVICE_WRAPPING_KEY_ID, key);
  return key;
}

function importAesGcmDataKey(rawKey: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toExactArrayBuffer(rawKey),
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

function openKeyStore(): Promise<IDBDatabase> {
  return openDatabase(KEY_DB_NAME, KEY_STORE_NAME);
}

function openEncryptedStore(): Promise<IDBDatabase> {
  return openDatabase(ENCRYPTED_DB_NAME, ENCRYPTED_STORE_NAME);
}

function openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
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

async function readEncryptedSnapshotRecord(
  key = ENCRYPTED_DB_KEY,
): Promise<EncryptedSqliteSnapshotRecord | null> {
  const db = await openEncryptedStore();
  try {
    return (await readValue<EncryptedSqliteSnapshotRecord>(db, key)) ?? null;
  } finally {
    db.close();
  }
}

async function writeEncryptedSnapshotRecord(
  key: string,
  record: EncryptedSqliteSnapshotRecord,
): Promise<void> {
  const db = await openEncryptedStore();
  try {
    await writeValue(db, key, record);
  } finally {
    db.close();
  }
}

async function commitEncryptedSnapshotRecord(record: EncryptedSqliteSnapshotRecord): Promise<void> {
  const db = await openEncryptedStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ENCRYPTED_STORE_NAME, 'readwrite');
      const store = tx.objectStore(ENCRYPTED_STORE_NAME);
      store.put(record, ENCRYPTED_DB_KEY);
      store.delete(ENCRYPTED_DB_PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function readValue<T>(db: IDBDatabase, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(db.objectStoreNames[0], 'readonly');
    const request = tx.objectStore(db.objectStoreNames[0]).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}

function writeValue(db: IDBDatabase, key: IDBValidKey, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(db.objectStoreNames[0], 'readwrite');
    tx.objectStore(db.objectStoreNames[0]).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validateSnapshotRecord(record: EncryptedSqliteSnapshotRecord, databaseName: string): void {
  if (
    record.magic !== SNAPSHOT_MAGIC ||
    record.version !== FORMAT_VERSION ||
    record.databaseName !== databaseName ||
    record.keyId !== WRAPPED_DATA_KEY_ID
  ) {
    throw new Error('Unsupported encrypted SQLite snapshot format.');
  }
}

function validateWrappedDataKeyRecord(record: WrappedDataKeyRecord): void {
  if (
    record.magic !== WRAPPED_KEY_MAGIC ||
    record.version !== FORMAT_VERSION ||
    record.keyId !== WRAPPED_DATA_KEY_ID ||
    record.wrappingKeyId !== DEVICE_WRAPPING_KEY_ID
  ) {
    throw new Error('Unsupported SQLite data-key wrapping format.');
  }
}

function snapshotAdditionalData(databaseName: string, keyId: string): Uint8Array {
  return new TextEncoder().encode(`${SNAPSHOT_MAGIC}:v${FORMAT_VERSION}:${databaseName}:${keyId}`);
}

function dataKeyAdditionalData(keyId: string, wrappingKeyId: string): Uint8Array {
  return new TextEncoder().encode(
    `${WRAPPED_KEY_MAGIC}:v${FORMAT_VERSION}:${keyId}:${wrappingKeyId}`,
  );
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function deleteDatabaseBestEffort(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
