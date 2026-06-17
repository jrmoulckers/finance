// SPDX-License-Identifier: BUSL-1.1

/** Canonical browser backup package schema. Mirrors packages/core ExportData.kt. */
export const BACKUP_PACKAGE_VERSION = 1 as const;

export type BackupPackageVersion = typeof BACKUP_PACKAGE_VERSION;
export type BackupEntityRecord = Readonly<Record<string, unknown>> & { readonly id?: string };
export type BackupKeyValueRecord = Readonly<{
  key: string;
  value: string | null;
}>;

export interface BackupPackageMetadata {
  readonly generatedAt: string;
  readonly appVersion: string | null;
  readonly source: 'web';
}

export interface BackupPackage {
  readonly version: BackupPackageVersion;
  readonly metadata: BackupPackageMetadata;

  /** Supporting ownership tables required for a clean restore with FK checks on. */
  readonly users: readonly BackupEntityRecord[];
  readonly households: readonly BackupEntityRecord[];
  readonly householdMembers: readonly BackupEntityRecord[];

  readonly accounts: readonly BackupEntityRecord[];
  readonly transactions: readonly BackupEntityRecord[];
  readonly categories: readonly BackupEntityRecord[];
  readonly budgets: readonly BackupEntityRecord[];
  readonly goals: readonly BackupEntityRecord[];
  readonly recurringTemplates: readonly BackupEntityRecord[];
  readonly preferences: readonly BackupKeyValueRecord[];
  readonly settings: readonly BackupKeyValueRecord[];
  readonly consentRecords: readonly BackupKeyValueRecord[];
}

export type BackupEntityKey = Exclude<keyof BackupPackage, 'version' | 'metadata'>;

export interface BackupEntityPreview {
  readonly entity: BackupEntityKey;
  readonly total: number;
  readonly imported: number;
  readonly skippedDuplicates: number;
}

export interface BackupRestorePreview {
  readonly version: BackupPackageVersion;
  readonly wipeLocalDataFirst: boolean;
  readonly entities: readonly BackupEntityPreview[];
}

export interface BackupRestoreResult extends BackupRestorePreview {
  readonly restoredAt: string;
}
