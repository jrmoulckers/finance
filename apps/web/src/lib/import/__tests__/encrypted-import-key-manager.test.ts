// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { auditWebStorageForRawImportKeys, createEncryptedImportKeyRecord, loadEncryptedImportKey, migrateEncryptedImportKeys, saveEncryptedImportKey, type EncryptedImportKeyRecord, type ImportKeyStorageAdapter } from '../encrypted-import-key-manager';

class MemoryKeyStore implements ImportKeyStorageAdapter {
  readonly records = new Map<string, EncryptedImportKeyRecord>();

  put(record: EncryptedImportKeyRecord): void {
    this.records.set(record.metadata.keyId, record);
  }

  get(keyId: string): EncryptedImportKeyRecord | null {
    return this.records.get(keyId) ?? null;
  }

  delete(keyId: string): void {
    this.records.delete(keyId);
  }
}

describe('encrypted import key manager', () => {
  it('stores only encrypted key envelopes', async () => {
    const store = new MemoryKeyStore();
    const record = createEncryptedImportKeyRecord({
      keyId: 'import-key-1',
      encryptedKeyMaterial: 'enc:v1:ciphertext',
      storage: 'indexeddb',
      now: new Date('2024-01-01T00:00:00Z'),
    });

    await saveEncryptedImportKey(store, record);

    await expect(loadEncryptedImportKey(store, 'import-key-1')).resolves.toEqual(record);
    expect(() => createEncryptedImportKeyRecord({ keyId: 'raw-key', encryptedKeyMaterial: 'enc:v1:x', storage: 'opfs' })).toThrow();
  });

  it('audits web storage for raw key material', () => {
    const violations = auditWebStorageForRawImportKeys([
      { name: 'localStorage', keys: ['finance.import.profile.safe'], getItem: () => 'enc:v1:ciphertext' },
      { name: 'sessionStorage', keys: ['finance.rawKey'], getItem: () => 'abcdef'.repeat(12) },
    ]);

    expect(violations).toEqual(['sessionStorage:finance.rawKey']);
  });

  it('creates rollback-safe migration checkpoints and wipes source envelopes', async () => {
    const source = new MemoryKeyStore();
    const target = new MemoryKeyStore();
    const record = createEncryptedImportKeyRecord({ keyId: 'import-key-2', encryptedKeyMaterial: 'enc:v1:abc', storage: 'opfs' });
    source.put(record);

    const checkpoints = await migrateEncryptedImportKeys({ records: [record], source, target, wipeSource: true });

    expect(checkpoints.map((checkpoint) => checkpoint.status)).toEqual(['success', 'wiped']);
    expect(target.get('import-key-2')).toEqual(record);
    expect(source.get('import-key-2')).toBeNull();
  });
});
