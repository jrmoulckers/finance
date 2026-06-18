// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createSavedImportProfile, recordImportRun, planReimportRun } from '../scheduled-reimport';
import {
  appendImportHistoryEntry,
  exportImportDiagnostics,
  loadImportHistory,
  loadImportProfiles,
  saveImportProfile,
  type BrowserStorageLike,
} from '../import-profile-store';

class MemoryStorage implements BrowserStorageLike {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('import profile store', () => {
  it('persists profiles and run history in browser storage', () => {
    const store = new MemoryStorage();
    const profile = createSavedImportProfile({
      name: 'Mint monthly',
      sourceFormat: 'mint',
      headers: ['Date', 'Amount'],
      mappingKeys: ['date', 'amount'],
      now: new Date('2024-01-01T00:00:00Z'),
    });
    const plan = planReimportRun({
      profile,
      parsedTransactionCount: 2,
      duplicateCount: 1,
      parserErrorCount: 0,
    });
    const recorded = recordImportRun({
      profile,
      plan,
      importedCount: 1,
      now: new Date('2024-01-02T00:00:00Z'),
    });

    saveImportProfile(store, profile);
    appendImportHistoryEntry(store, recorded.run);

    expect(loadImportProfiles(store)).toEqual([profile]);
    expect(loadImportHistory(store, profile.id)).toEqual([recorded.run]);
  });

  it('exports privacy-safe diagnostics', () => {
    const exported = exportImportDiagnostics({
      profiles: [
        createSavedImportProfile({
          name: 'Private account',
          sourceFormat: 'csv',
          headers: ['Date'],
          mappingKeys: ['date'],
          now: new Date('2024-01-01T00:00:00Z'),
        }),
      ],
      history: [
        {
          runId: 'run-1',
          profileId: 'profile-1',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:00:01Z',
          status: 'failed',
          importedCount: 0,
          skippedDuplicateCount: 0,
          errorCount: 1,
          diagnostics: ['owner test@example.com account: ABC-123 card 4111111111111111'],
        },
      ],
    });

    expect(exported).toContain('[email]');
    expect(exported).toContain('[number]');
    expect(exported).not.toContain('test@example.com');
    expect(exported).not.toContain('ABC-123');
  });
});
