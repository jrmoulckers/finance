// SPDX-License-Identifier: BUSL-1.1

/**
 * Web Crypto API encryption for the SQLite database at rest.
 *
 * Provides AES-256-GCM encryption/decryption of database snapshots before
 * they are persisted to OPFS or IndexedDB.  The encryption key is derived
 * from a user-supplied secret (e.g. auth token or passphrase) using PBKDF2.
 *
 * Security design:
 *   - AES-256-GCM for authenticated encryption (confidentiality + integrity)
 *   - PBKDF2 with 600,000 iterations + random 16-byte salt for key derivation
 *   - 12-byte random IV per encryption (never reused)
 *   - Salt + IV prepended to ciphertext for self-describing storage
 *   - Key material held only in CryptoKey objects (non-extractable by default)
 *   - All crypto ops use SubtleCrypto — no inline eval, CSP-safe
 *
 * Wire format:  [salt (16 bytes)] [iv (12 bytes)] [ciphertext + auth tag]
 *
 * References: issue #443 (security review — OPFS/IndexedDB unencrypted)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Salt length in bytes for PBKDF2. */
const SALT_LENGTH = 16;

/** Initialisation vector length in bytes for AES-GCM. */
const IV_LENGTH = 12;

/** PBKDF2 iteration count — OWASP 2024 minimum for SHA-256. */
const PBKDF2_ITERATIONS = 600_000;

/** AES key length in bits. */
const AES_KEY_LENGTH = 256;

/** IndexedDB database name for storing the encryption salt. */
const SALT_DB_NAME = 'finance-encryption';

/** IndexedDB object store name. */
const SALT_STORE_NAME = 'keys';

/** IndexedDB key for the persistent salt. */
const SALT_IDB_KEY = 'db-salt';

/** SessionStorage key for the per-tab database encryption passphrase. */
const SESSION_PASSPHRASE_KEY = 'finance.sqliteEncryption.passphrase';

/** SessionStorage key for an additional per-tab passphrase salt. */
const SESSION_PASSPHRASE_SALT_KEY = 'finance.sqliteEncryption.salt';

/** Random byte length for generated session passphrases and salts. */
const SESSION_SECRET_BYTES = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an encryption operation. */
export interface EncryptedPayload {
  /** The encrypted data including salt, IV, and ciphertext. */
  readonly data: Uint8Array;
}

/** Options for key derivation. */
export interface KeyDerivationOptions {
  /** The user secret to derive the key from (e.g. auth token). */
  readonly secret: string;
  /** Optional salt — if not provided, a new random salt is generated. */
  readonly salt?: Uint8Array;
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function randomBase64Url(byteLength: number): string | null {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return null;
  }

  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function getSessionStorageIfAvailable(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    const probeKey = 'finance.sqliteEncryption.probe';
    sessionStorage.setItem(probeKey, '1');
    sessionStorage.removeItem(probeKey);
    return sessionStorage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Key Derivation
// ---------------------------------------------------------------------------

/**
 * Derive an AES-256-GCM CryptoKey from a user secret using PBKDF2.
 *
 * @param secret  The user's secret (auth token, passphrase, etc.)
 * @param salt    A 16-byte salt. Must be the same for encrypt and decrypt.
 * @returns An AES-256-GCM CryptoKey suitable for encrypt/decrypt operations.
 */
export async function deriveEncryptionKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toExactArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt a database snapshot using AES-256-GCM.
 *
 * @param plaintext  The raw database bytes to encrypt.
 * @param secret     The user's secret for key derivation.
 * @returns EncryptedPayload containing salt + IV + ciphertext.
 */
export async function encryptDatabase(
  plaintext: Uint8Array,
  secret: string,
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveEncryptionKey(secret, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toExactArrayBuffer(iv) },
    key,
    toExactArrayBuffer(plaintext),
  );

  // Pack: [salt (16)] [iv (12)] [ciphertext + auth tag]
  const result = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  return { data: result };
}

/**
 * Decrypt a database snapshot that was encrypted with `encryptDatabase`.
 *
 * @param encrypted  The full encrypted payload (salt + IV + ciphertext).
 * @param secret     The user's secret for key derivation.
 * @returns The decrypted raw database bytes.
 * @throws If decryption fails (wrong key, tampered data, etc.)
 */
export async function decryptDatabase(encrypted: Uint8Array, secret: string): Promise<Uint8Array> {
  if (encrypted.byteLength < SALT_LENGTH + IV_LENGTH + 1) {
    throw new Error('Encrypted data is too short to contain valid payload.');
  }

  const salt = encrypted.slice(0, SALT_LENGTH);
  const iv = encrypted.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = encrypted.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveEncryptionKey(secret, salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toExactArrayBuffer(iv) },
      key,
      toExactArrayBuffer(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error(
      'Decryption failed. The encryption key may be incorrect or the data may have been tampered with.',
    );
  }
}

// ---------------------------------------------------------------------------
// Session passphrase fallback
// ---------------------------------------------------------------------------

/**
 * Return a per-tab encryption secret backed by sessionStorage.
 *
 * This fallback keeps the SQLite IndexedDB blob encrypted even before an auth
 * token is available. The generated passphrase is intentionally scoped to the
 * current browser session and is never written to localStorage or IndexedDB.
 */
export function getOrCreateSessionStoragePassphrase(): string | null {
  const storage = getSessionStorageIfAvailable();
  if (!storage) {
    return null;
  }

  let passphrase = storage.getItem(SESSION_PASSPHRASE_KEY);
  let salt = storage.getItem(SESSION_PASSPHRASE_SALT_KEY);

  if (!passphrase || !salt) {
    passphrase = randomBase64Url(SESSION_SECRET_BYTES);
    salt = randomBase64Url(SESSION_SECRET_BYTES);
    if (!passphrase || !salt) {
      return null;
    }
    storage.setItem(SESSION_PASSPHRASE_KEY, passphrase);
    storage.setItem(SESSION_PASSPHRASE_SALT_KEY, salt);
  }

  return salt + ':' + passphrase;
}

/** Clear the per-tab fallback passphrase. */
export function clearSessionStoragePassphrase(): void {
  const storage = getSessionStorageIfAvailable();
  storage?.removeItem(SESSION_PASSPHRASE_KEY);
  storage?.removeItem(SESSION_PASSPHRASE_SALT_KEY);
}

// ---------------------------------------------------------------------------
// Encrypted IndexedDB Persistence
// ---------------------------------------------------------------------------

/**
 * Open the encryption salt IndexedDB store.
 */
function openSaltStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SALT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SALT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist a salt to IndexedDB for consistent key derivation across sessions.
 */
export async function persistSalt(salt: Uint8Array): Promise<void> {
  const db = await openSaltStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SALT_STORE_NAME, 'readwrite');
    tx.objectStore(SALT_STORE_NAME).put(toExactArrayBuffer(salt), SALT_IDB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Load the persisted salt from IndexedDB.
 *
 * @returns The salt, or `null` if none has been stored yet.
 */
export async function loadPersistedSalt(): Promise<Uint8Array | null> {
  const db = await openSaltStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SALT_STORE_NAME, 'readonly');
    const request = tx.objectStore(SALT_STORE_NAME).get(SALT_IDB_KEY);
    request.onsuccess = () => {
      db.close();
      const result = request.result as ArrayBuffer | undefined;
      resolve(result ? new Uint8Array(result) : null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ---------------------------------------------------------------------------
// Encrypted IndexedDB read/write
// ---------------------------------------------------------------------------

/** IndexedDB store for encrypted database snapshots. */
const ENCRYPTED_DB_NAME = 'finance-sqlite-encrypted';
const ENCRYPTED_STORE = 'encrypted';
const ENCRYPTED_KEY = 'db';

function openEncryptedStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ENCRYPTED_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ENCRYPTED_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an encrypted database snapshot to IndexedDB.
 */
export async function saveEncryptedDatabase(plaintext: Uint8Array, secret: string): Promise<void> {
  const { data } = await encryptDatabase(plaintext, secret);
  const idb = await openEncryptedStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(ENCRYPTED_STORE, 'readwrite');
    tx.objectStore(ENCRYPTED_STORE).put(toExactArrayBuffer(data), ENCRYPTED_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}

/**
 * Load and decrypt a database snapshot from IndexedDB.
 *
 * @returns The decrypted database bytes, or `null` if no snapshot exists.
 */
export async function loadEncryptedDatabase(secret: string): Promise<Uint8Array | null> {
  const idb = await openEncryptedStore();
  const encrypted = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
    const tx = idb.transaction(ENCRYPTED_STORE, 'readonly');
    const request = tx.objectStore(ENCRYPTED_STORE).get(ENCRYPTED_KEY);
    request.onsuccess = () => {
      idb.close();
      resolve(request.result as ArrayBuffer | undefined);
    };
    request.onerror = () => {
      idb.close();
      reject(request.error);
    };
  });

  if (!encrypted) {
    return null;
  }

  return decryptDatabase(new Uint8Array(encrypted), secret);
}

/**
 * Check if the Web Crypto API is available in the current context.
 */
export function isEncryptionSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.deriveKey === 'function' &&
    typeof crypto.subtle.encrypt === 'function' &&
    typeof crypto.subtle.decrypt === 'function'
  );
}

/**
 * Clear all encrypted data stores (for logout/account deletion).
 */
export async function clearEncryptedData(): Promise<void> {
  const stores = [ENCRYPTED_DB_NAME, SALT_DB_NAME];
  const promises = stores.map(
    (name) =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve(); // Best-effort
        request.onblocked = () => resolve();
      }),
  );
  await Promise.all(promises);
}
