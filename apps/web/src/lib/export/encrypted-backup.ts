// SPDX-License-Identifier: BUSL-1.1

import type { FullJsonExport } from './simple-export';
import { buildDatedExportFileName } from './simple-export';

export const ENCRYPTED_BACKUP_FORMAT = 'finance.encrypted-backup';
export const ENCRYPTED_BACKUP_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 1;

export interface EncryptedBackupManifest {
  readonly format: typeof ENCRYPTED_BACKUP_FORMAT;
  readonly version: typeof ENCRYPTED_BACKUP_VERSION;
  readonly schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly appVersion: string | null;
  readonly counts: Record<string, number>;
}

export interface EncryptedBackupEnvelope {
  readonly manifest: EncryptedBackupManifest;
  readonly crypto: {
    readonly algorithm: 'AES-GCM';
    readonly kdf: 'PBKDF2-SHA256';
    readonly iterations: number;
    readonly salt: string;
    readonly iv: string;
  };
  readonly ciphertext: string;
}

export interface BuildEncryptedBackupOptions {
  readonly appVersion?: string | null;
  readonly generatedAt?: Date;
  readonly iterations?: number;
  readonly salt?: Uint8Array;
  readonly iv?: Uint8Array;
}

export interface EncryptedBackupResult {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly manifest: EncryptedBackupManifest;
}

export interface RestoredBackupPreview {
  readonly manifest: EncryptedBackupManifest;
  readonly payload: FullJsonExport;
  readonly counts: Record<string, number>;
  readonly warnings: readonly string[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DEFAULT_ITERATIONS = 210_000;

export async function buildEncryptedBackup(
  exportData: FullJsonExport,
  passphrase: string,
  options: BuildEncryptedBackupOptions = {},
): Promise<EncryptedBackupResult> {
  assertPassphrase(passphrase);
  const generatedAt = options.generatedAt ?? new Date();
  const manifest = buildBackupManifest(exportData, {
    appVersion: options.appVersion ?? exportData.appVersion,
    generatedAt,
  });
  const salt = options.salt ?? randomBytes(16);
  const iv = options.iv ?? randomBytes(12);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const key = await deriveAesKey(passphrase, salt, iterations);
  const plaintext = toArrayBufferView(
    encoder.encode(JSON.stringify({ manifest, payload: exportData })),
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBufferView(iv) },
    key,
    plaintext,
  );
  const envelope: EncryptedBackupEnvelope = {
    manifest,
    crypto: {
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };

  return {
    fileName: buildDatedExportFileName('finance-backup', 'fbackup', generatedAt),
    bytes: encoder.encode(`${JSON.stringify(envelope, null, 2)}\n`),
    manifest,
  };
}

export async function decryptBackupPreview(
  backupBytes: Uint8Array,
  passphrase: string,
): Promise<RestoredBackupPreview> {
  assertPassphrase(passphrase);
  const envelope = parseEnvelope(backupBytes);
  validateManifest(envelope.manifest);
  const salt = base64ToBytes(envelope.crypto.salt);
  const iv = base64ToBytes(envelope.crypto.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveAesKey(passphrase, salt, envelope.crypto.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBufferView(iv) },
      key,
      toArrayBufferView(ciphertext),
    );
  } catch (error) {
    throw new Error('Unable to decrypt backup. Check the passphrase or backup integrity.', {
      cause: error,
    });
  }

  const decoded = JSON.parse(decoder.decode(plaintext)) as unknown;
  if (!isBackupPayload(decoded)) {
    throw new Error('Backup payload is corrupted or incomplete.');
  }
  validateManifest(decoded.manifest);
  const counts = countEntities(decoded.payload);
  return {
    manifest: decoded.manifest,
    payload: decoded.payload,
    counts,
    warnings: buildRestoreWarnings(envelope.manifest, decoded.manifest, counts),
  };
}

export function buildBackupManifest(
  exportData: FullJsonExport,
  options: { readonly appVersion?: string | null; readonly generatedAt?: Date } = {},
): EncryptedBackupManifest {
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    generatedAt: (options.generatedAt ?? new Date(exportData.generatedAt)).toISOString(),
    appVersion: options.appVersion ?? exportData.appVersion,
    counts: countEntities(exportData),
  };
}

export function validateManifest(manifest: EncryptedBackupManifest): void {
  if (
    manifest.format !== ENCRYPTED_BACKUP_FORMAT ||
    manifest.version !== ENCRYPTED_BACKUP_VERSION
  ) {
    throw new Error('Unsupported backup format.');
  }
  if (manifest.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(`Backup schema ${manifest.schemaVersion} is newer than this app supports.`);
  }
}

function parseEnvelope(bytes: Uint8Array): EncryptedBackupEnvelope {
  try {
    const parsed = JSON.parse(decoder.decode(bytes)) as unknown;
    if (!isEnvelope(parsed)) throw new Error('Invalid encrypted backup envelope.');
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes('encrypted backup')) throw error;
    throw new Error('Backup file is corrupted or not valid JSON.', { cause: error });
  }
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBufferView(salt), iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function countEntities(exportData: FullJsonExport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(exportData)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

function buildRestoreWarnings(
  envelopeManifest: EncryptedBackupManifest,
  payloadManifest: EncryptedBackupManifest,
  counts: Record<string, number>,
): string[] {
  const warnings: string[] = [];
  if (envelopeManifest.generatedAt !== payloadManifest.generatedAt) {
    warnings.push('Envelope metadata differs from decrypted payload metadata.');
  }
  if (Object.values(counts).every((count) => count === 0)) {
    warnings.push('Backup contains no entity rows; restoring will create an empty profile.');
  }
  return warnings;
}

function isEnvelope(value: unknown): value is EncryptedBackupEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EncryptedBackupEnvelope>;
  return (
    isManifest(candidate.manifest) &&
    typeof candidate.ciphertext === 'string' &&
    typeof candidate.crypto === 'object' &&
    candidate.crypto !== null &&
    candidate.crypto.algorithm === 'AES-GCM' &&
    candidate.crypto.kdf === 'PBKDF2-SHA256' &&
    typeof candidate.crypto.iterations === 'number' &&
    typeof candidate.crypto.salt === 'string' &&
    typeof candidate.crypto.iv === 'string'
  );
}

function isBackupPayload(
  value: unknown,
): value is { manifest: EncryptedBackupManifest; payload: FullJsonExport } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { manifest?: unknown; payload?: unknown };
  return (
    isManifest(candidate.manifest) &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}

function isManifest(value: unknown): value is EncryptedBackupManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EncryptedBackupManifest>;
  return (
    candidate.format === ENCRYPTED_BACKUP_FORMAT &&
    candidate.version === ENCRYPTED_BACKUP_VERSION &&
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.counts === 'object' &&
    candidate.counts !== null
  );
}

function assertPassphrase(passphrase: string): void {
  if (passphrase.trim().length < 8) {
    throw new Error('Backup passphrase must be at least 8 characters.');
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
