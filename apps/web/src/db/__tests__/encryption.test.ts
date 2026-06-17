// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  clearEncryptedData,
  decryptDatabase,
  deriveEncryptionKey,
  encryptDatabase,
  isEncryptionSupported,
  loadEncryptedDatabase,
  saveEncryptedDatabase,
} from '../encryption';

describe('encryption', () => {
  const testSecret = 'test-auth-token-abc123';
  const testData = new TextEncoder().encode('SQLite format 3\0 — test database content');

  beforeAll(() => {
    expect(typeof crypto).toBe('object');
    expect(typeof crypto.subtle).toBe('object');
  });

  afterEach(async () => {
    await clearEncryptedData();
  });

  describe('isEncryptionSupported', () => {
    it('returns true when Web Crypto API is available', () => {
      expect(isEncryptionSupported()).toBe(true);
    });
  });

  describe('deriveEncryptionKey', () => {
    it('derives a CryptoKey from a secret and salt', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveEncryptionKey(testSecret, salt);

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
      expect(key.extractable).toBe(false);
    });

    it('derives different keys for different salts', async () => {
      const salt1 = crypto.getRandomValues(new Uint8Array(16));
      const salt2 = crypto.getRandomValues(new Uint8Array(16));

      const key1 = await deriveEncryptionKey(testSecret, salt1);
      const key2 = await deriveEncryptionKey(testSecret, salt2);

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, testData);
      const ct2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key2, testData);

      expect(new Uint8Array(ct1)).not.toEqual(new Uint8Array(ct2));
    });
  });

  describe('encryptDatabase / decryptDatabase', () => {
    it('round-trips data through encryption and decryption', async () => {
      const encrypted = await encryptDatabase(testData, testSecret);
      expect(encrypted.data.byteLength).toBeGreaterThan(testData.byteLength);

      const decrypted = await decryptDatabase(encrypted.data, testSecret);
      expect(Array.from(decrypted)).toEqual(Array.from(testData));
    });

    it('produces different ciphertext on each call (random IV)', async () => {
      const encrypted1 = await encryptDatabase(testData, testSecret);
      const encrypted2 = await encryptDatabase(testData, testSecret);

      expect(encrypted1.data).not.toEqual(encrypted2.data);
    });

    it('fails to decrypt with wrong secret', async () => {
      const encrypted = await encryptDatabase(testData, testSecret);

      await expect(decryptDatabase(encrypted.data, 'wrong-secret')).rejects.toThrow(
        /[Dd]ecryption failed/,
      );
    });

    it('fails to decrypt tampered data', async () => {
      const encrypted = await encryptDatabase(testData, testSecret);
      const tampered = new Uint8Array(encrypted.data);
      tampered[tampered.length - 1] ^= 0xff;

      await expect(decryptDatabase(tampered, testSecret)).rejects.toThrow(
        /[Dd]ecryption failed|tampered/,
      );
    });

    it('rejects payloads that are too short', async () => {
      const tooShort = new Uint8Array(10);

      await expect(decryptDatabase(tooShort, testSecret)).rejects.toThrow(/too short/);
    });

    it('handles empty plaintext', async () => {
      const emptyData = new Uint8Array(0);
      const encrypted = await encryptDatabase(emptyData, testSecret);
      const decrypted = await decryptDatabase(encrypted.data, testSecret);
      expect(Array.from(decrypted)).toEqual(Array.from(emptyData));
    });

    it('handles large data (64 KB)', async () => {
      // jsdom limits crypto.getRandomValues to 65,536 bytes
      const largeData = crypto.getRandomValues(new Uint8Array(65_536));
      const encrypted = await encryptDatabase(largeData, testSecret);
      const decrypted = await decryptDatabase(encrypted.data, testSecret);
      expect(Array.from(decrypted)).toEqual(Array.from(largeData));
    });

    it('round-trips persisted IndexedDB snapshots without storing plaintext', async () => {
      await saveEncryptedDatabase(testData, testSecret);

      const raw = await readRawEncryptedSnapshot();
      expect(raw?.byteLength).toBeGreaterThan(testData.byteLength);
      expect(new TextDecoder().decode(raw!)).not.toContain('SQLite format 3');

      const restored = await loadEncryptedDatabase(testSecret);
      expect(Array.from(restored ?? [])).toEqual(Array.from(testData));
    });
  });
});

async function readRawEncryptedSnapshot(): Promise<ArrayBuffer | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('finance-sqlite-encrypted', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return new Promise((resolve, reject) => {
    const tx = db.transaction('encrypted', 'readonly');
    const request = tx.objectStore('encrypted').get('db');
    request.onsuccess = () => {
      db.close();
      resolve(request.result as ArrayBuffer | undefined);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
