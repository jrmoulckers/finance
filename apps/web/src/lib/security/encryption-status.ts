// SPDX-License-Identifier: BUSL-1.1

import { isWebCryptoEncryptionSupported } from './encryption-at-rest';

export type EncryptionCategory =
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'goals'
  | 'memos'
  | 'attachments'
  | 'settings'
  | 'audit-log';

export type EncryptionKeyState = 'not_configured' | 'locked' | 'unlocked' | 'unavailable';
export type EncryptionStatus =
  | 'encrypted'
  | 'partially_encrypted'
  | 'not_encrypted'
  | 'locked'
  | 'not_applicable'
  | 'unavailable';

export interface EncryptionCategorySnapshot {
  readonly category: EncryptionCategory;
  readonly label: string;
  readonly applicable: boolean;
  readonly totalRecords: number;
  readonly encryptedRecords: number;
  readonly keyState: EncryptionKeyState;
  readonly lastEncryptedAt?: string;
}

export interface EncryptionStatusEnvironment {
  readonly crypto?: Crypto;
  readonly indexedDbAvailable: boolean;
  readonly persistentStorageAvailable: boolean;
}

export interface EncryptionStatusRow {
  readonly category: EncryptionCategory;
  readonly label: string;
  readonly status: EncryptionStatus;
  readonly detail: string;
  readonly recoveryConsequence: string;
  readonly action: 'set_up' | 'unlock' | 'review' | 'none';
}

export interface EncryptionStatusDashboard {
  readonly webCryptoAvailable: boolean;
  readonly storageAvailable: boolean;
  readonly firstRunSetupRequired: boolean;
  readonly rows: readonly EncryptionStatusRow[];
}

const RECOVERY_COPY =
  'If the recovery secret is lost, encrypted local data cannot be decrypted and must be reset from the last trusted sync or deleted.';

export function buildEncryptionStatusDashboard(
  snapshots: readonly EncryptionCategorySnapshot[],
  environment: EncryptionStatusEnvironment,
): EncryptionStatusDashboard {
  const webCryptoAvailable = isWebCryptoEncryptionSupported(environment.crypto);
  const storageAvailable = environment.indexedDbAvailable || environment.persistentStorageAvailable;
  const rows = snapshots.map((snapshot) => buildEncryptionStatusRow(snapshot, webCryptoAvailable, storageAvailable));

  return {
    webCryptoAvailable,
    storageAvailable,
    firstRunSetupRequired: rows.some((row) => row.action === 'set_up'),
    rows,
  };
}

export function buildEncryptionStatusRow(
  snapshot: EncryptionCategorySnapshot,
  webCryptoAvailable: boolean,
  storageAvailable: boolean,
): EncryptionStatusRow {
  if (!snapshot.applicable || snapshot.totalRecords === 0) {
    return row(snapshot, 'not_applicable', 'No local sensitive records are stored for this category.', 'none');
  }
  if (!webCryptoAvailable || !storageAvailable || snapshot.keyState === 'unavailable') {
    return row(
      snapshot,
      'unavailable',
      'Browser encryption is unavailable; keep this data out of shared devices or use a supported browser.',
      'review',
    );
  }
  if (snapshot.keyState === 'not_configured') {
    return row(snapshot, 'not_encrypted', 'Encryption has not been set up for this category.', 'set_up');
  }
  if (snapshot.keyState === 'locked') {
    return row(snapshot, 'locked', 'Encrypted data is present but locked until the recovery secret is provided.', 'unlock');
  }
  if (snapshot.encryptedRecords >= snapshot.totalRecords) {
    return row(snapshot, 'encrypted', 'All local records in this category are encrypted at rest.', 'none');
  }
  if (snapshot.encryptedRecords === 0) {
    return row(snapshot, 'not_encrypted', 'Local records in this category are not encrypted yet.', 'set_up');
  }
  return row(
    snapshot,
    'partially_encrypted',
    `${snapshot.encryptedRecords} of ${snapshot.totalRecords} local records are encrypted; finish migration before relying on protection.`,
    'review',
  );
}

export function summarizeEncryptionRecovery(status: EncryptionStatus): string {
  if (status === 'not_applicable') return 'No recovery action is required for categories with no local sensitive data.';
  if (status === 'unavailable') return 'Recovery is unavailable until Web Crypto and persistent browser storage are available.';
  return RECOVERY_COPY;
}

function row(
  snapshot: EncryptionCategorySnapshot,
  status: EncryptionStatus,
  detail: string,
  action: EncryptionStatusRow['action'],
): EncryptionStatusRow {
  return {
    category: snapshot.category,
    label: snapshot.label,
    status,
    detail,
    recoveryConsequence: summarizeEncryptionRecovery(status),
    action,
  };
}
