// SPDX-License-Identifier: BUSL-1.1

import type { ImportRunHistoryEntry, SavedImportProfile } from './scheduled-reimport';

export interface BrowserStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ImportProfileStoreSnapshot {
  readonly profiles: readonly SavedImportProfile[];
  readonly history: readonly ImportRunHistoryEntry[];
}

const PROFILE_PREFIX = 'finance.import.profile.';
const HISTORY_PREFIX = 'finance.import.history.';

export function saveImportProfile(store: BrowserStorageLike, profile: SavedImportProfile): void {
  store.setItem(`${PROFILE_PREFIX}${profile.id}`, JSON.stringify(profile));
}

export function loadImportProfiles(store: BrowserStorageLike): readonly SavedImportProfile[] {
  return loadValues<SavedImportProfile>(store, PROFILE_PREFIX).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function deleteImportProfile(store: BrowserStorageLike, profileId: string): void {
  store.removeItem(`${PROFILE_PREFIX}${profileId}`);
}

export function appendImportHistoryEntry(store: BrowserStorageLike, entry: ImportRunHistoryEntry): void {
  store.setItem(`${HISTORY_PREFIX}${entry.runId}`, JSON.stringify(entry));
}

export function loadImportHistory(
  store: BrowserStorageLike,
  profileId?: string,
): readonly ImportRunHistoryEntry[] {
  return loadValues<ImportRunHistoryEntry>(store, HISTORY_PREFIX)
    .filter((entry) => profileId === undefined || entry.profileId === profileId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function exportImportDiagnostics(snapshot: ImportProfileStoreSnapshot): string {
  return JSON.stringify(
    {
      profiles: snapshot.profiles.map((profile) => ({
        id: profile.id,
        sourceFormat: profile.sourceFormat,
        duplicatePolicy: profile.duplicatePolicy,
        cadence: profile.cadence.kind,
        mappingFingerprint: profile.mappingFingerprint,
        accountRoutingFingerprint: profile.accountRoutingFingerprint,
        lastRunAt: profile.lastRunAt,
      })),
      history: snapshot.history.map((entry) => ({
        runId: entry.runId,
        profileId: entry.profileId,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
        status: entry.status,
        importedCount: entry.importedCount,
        skippedDuplicateCount: entry.skippedDuplicateCount,
        errorCount: entry.errorCount,
        diagnostics: entry.diagnostics.map(redactDiagnostic),
      })),
    },
    null,
    2,
  );
}

function loadValues<T>(store: BrowserStorageLike, prefix: string): T[] {
  const values: T[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = store.getItem(key);
    if (!raw) continue;
    try {
      values.push(JSON.parse(raw) as T);
    } catch {
      store.removeItem(key);
    }
  }
  return values;
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{12,19}\b/g, '[number]')
    .replace(/\b(?:acct|account)\s*[:#-]?\s*[A-Z0-9-]+\b/gi, 'account [redacted]');
}
