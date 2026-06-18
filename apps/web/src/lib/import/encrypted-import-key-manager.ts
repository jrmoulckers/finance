// SPDX-License-Identifier: BUSL-1.1

export interface ImportKeyMetadata {
  readonly keyId: string;
  readonly algorithm: 'AES-GCM';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly storage: 'indexeddb' | 'opfs';
}

export interface EncryptedImportKeyRecord {
  readonly metadata: ImportKeyMetadata;
  readonly encryptedKeyMaterial: string;
}

export interface ImportKeyStorageAdapter {
  put(record: EncryptedImportKeyRecord): Promise<void> | void;
  get(keyId: string): Promise<EncryptedImportKeyRecord | null> | EncryptedImportKeyRecord | null;
  delete(keyId: string): Promise<void> | void;
}

export interface WebStorageAuditSource {
  readonly name: string;
  readonly keys: readonly string[];
  getItem(key: string): string | null;
}

export interface ImportKeyMigrationCheckpoint {
  readonly keyId: string;
  readonly status: 'success' | 'failed' | 'wiped';
  readonly message: string;
}

export function createEncryptedImportKeyRecord(input: {
  readonly keyId: string;
  readonly encryptedKeyMaterial: string;
  readonly storage: ImportKeyMetadata['storage'];
  readonly now?: Date;
}): EncryptedImportKeyRecord {
  if (looksLikeRawKeyName(input.keyId) || looksLikeRawKeyMaterial(input.encryptedKeyMaterial)) {
    throw new Error('Import keys must be stored as encrypted envelopes, not raw key material.');
  }
  const now = (input.now ?? new Date()).toISOString();
  return {
    metadata: {
      keyId: input.keyId,
      algorithm: 'AES-GCM',
      createdAt: now,
      updatedAt: now,
      storage: input.storage,
    },
    encryptedKeyMaterial: input.encryptedKeyMaterial,
  };
}

export async function saveEncryptedImportKey(
  adapter: ImportKeyStorageAdapter,
  record: EncryptedImportKeyRecord,
): Promise<void> {
  await adapter.put(record);
}

export async function loadEncryptedImportKey(
  adapter: ImportKeyStorageAdapter,
  keyId: string,
): Promise<EncryptedImportKeyRecord | null> {
  return await adapter.get(keyId);
}

export async function wipeEncryptedImportKey(
  adapter: ImportKeyStorageAdapter,
  keyId: string,
): Promise<void> {
  await adapter.delete(keyId);
}

export function auditWebStorageForRawImportKeys(
  sources: readonly WebStorageAuditSource[],
): readonly string[] {
  const violations: string[] = [];
  for (const source of sources) {
    for (const key of source.keys) {
      const value = source.getItem(key) ?? '';
      if (looksLikeRawKeyName(key) || looksLikeRawKeyMaterial(value)) {
        violations.push(`${source.name}:${key}`);
      }
    }
  }
  return violations;
}

export async function migrateEncryptedImportKeys(input: {
  readonly records: readonly EncryptedImportKeyRecord[];
  readonly target: ImportKeyStorageAdapter;
  readonly source?: ImportKeyStorageAdapter;
  readonly wipeSource?: boolean;
}): Promise<readonly ImportKeyMigrationCheckpoint[]> {
  const checkpoints: ImportKeyMigrationCheckpoint[] = [];
  for (const record of input.records) {
    try {
      await input.target.put(record);
      checkpoints.push({
        keyId: record.metadata.keyId,
        status: 'success',
        message: 'Migrated encrypted key envelope.',
      });
      if (input.wipeSource && input.source) {
        await input.source.delete(record.metadata.keyId);
        checkpoints.push({
          keyId: record.metadata.keyId,
          status: 'wiped',
          message: 'Removed source key envelope after migration.',
        });
      }
    } catch (error) {
      checkpoints.push({
        keyId: record.metadata.keyId,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Unknown migration failure',
      });
    }
  }
  return checkpoints;
}

function looksLikeRawKeyName(value: string): boolean {
  return /(^|[._-])(raw|plain|secret)(key|material)?($|[._-])/i.test(value);
}

function looksLikeRawKeyMaterial(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/-----BEGIN (?:PRIVATE|SECRET|RAW) KEY-----/.test(trimmed)) return true;
  if (/"(?:rawKey|plainTextKey|secretKey)"\s*:/.test(trimmed)) return true;
  return /^([A-Za-z0-9+/]{43,}={0,2}|[a-f0-9]{64,})$/i.test(trimmed) && !trimmed.startsWith('enc:');
}
