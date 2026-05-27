// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import {
  DATA_ACCESS_SCHEMA_VERSION,
  buildDataAccessPackage,
  shouldAutoDeletePackage,
  shouldWarnPackageExpiresSoon,
} from './data-access-package';

describe('data-access-package', () => {
  it('creates a ZIP-shaped package with manifest and every required domain', () => {
    const result = buildDataAccessPackage(sampleInput(), {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });
    const names = listZipNames(result.zipBytes);

    expect(names).toContain('manifest.json');
    expect(names).toContain('README.md');
    expect(names).toContain('data/transactions.json');
    expect(names).toContain('data/accounts.json');
    expect(names).toContain('data/budgets.json');
    expect(names).toContain('data/goals.json');
    expect(names).toContain('data/recurring_rules.json');
    expect(names).toContain('data/categories.json');
    expect(names).toContain('data/tags.json');
    expect(names).toContain('data/attachments.json');
    expect(names).toContain('data/preferences.json');
    expect(names).toContain('data/settings.json');
    expect(names).toContain('data/audit_log.json');
    expect(names).toContain('data/sync_metadata.json');
    expect(names).toContain('attachments/receipt-1-receipt.txt');
    expect(result.manifest.schema_version).toBe(DATA_ACCESS_SCHEMA_VERSION);
  });

  it('records protected category and mood tag request choices', () => {
    const result = buildDataAccessPackage(sampleInput(), {
      appVersion: '0.1.0',
      includeProtectedCategories: false,
      includeMoodTags: true,
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });

    expect(result.manifest.privacy.protected_categories_included).toBe(false);
    expect(result.manifest.privacy.mood_tags_included).toBe(true);
    expect(result.manifest.contents.some((entry) => entry.path === 'data/mood_tags.json')).toBe(
      true,
    );
    expect(result.manifest.coordination_notes.join('\n')).toContain('#1719');
  });

  it('supports 7-day auto-delete with 24-hour warning', () => {
    const expiresAt = '2026-06-02T12:00:00.000Z';

    expect(shouldWarnPackageExpiresSoon(new Date('2026-06-01T11:59:59Z'), expiresAt)).toBe(false);
    expect(shouldWarnPackageExpiresSoon(new Date('2026-06-01T12:00:00Z'), expiresAt)).toBe(true);
    expect(shouldAutoDeletePackage(new Date('2026-06-02T11:59:59Z'), expiresAt)).toBe(false);
    expect(shouldAutoDeletePackage(new Date('2026-06-02T12:00:00Z'), expiresAt)).toBe(true);
  });

  it('does not use browser network APIs while generating', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network blocked')));
    vi.stubGlobal('fetch', fetchSpy);

    const result = buildDataAccessPackage(sampleInput(), {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });

    expect(result.zipBytes.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function sampleInput() {
  return {
    accounts: [{ id: 'acc-1', name: 'Checking', syncVersion: 3 }],
    transactions: [{ id: 'txn-1', tags: ['food'], isSynced: false }],
    budgets: [],
    goals: [],
    categories: [{ id: 'cat-1', name: 'Food' }],
    recurringRules: [{ id: 'rule-1' }],
    preferences: [{ key: 'finance-currency', value: 'USD' }],
    settings: [{ key: 'theme', value: 'system' }],
    auditLog: [{ event: 'export_requested' }],
    syncMetadata: [{ device: 'browser' }],
    attachments: [
      {
        id: 'receipt-1',
        fileName: 'receipt.txt',
        contentType: 'text/plain',
        bytes: new TextEncoder().encode('receipt'),
      },
    ],
    moodTags: [{ id: 'mood-1', mood_tag: 'calm' }],
  };
}

function listZipNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset <= bytes.length - 4) {
    if (readUInt32(bytes, offset) === 0x04034b50) {
      const compressedSize = readUInt32(bytes, offset + 18);
      const nameLength = readUInt16(bytes, offset + 26);
      const extraLength = readUInt16(bytes, offset + 28);
      const nameStart = offset + 30;
      names.push(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)));
      offset = nameStart + nameLength + extraLength + compressedSize;
    } else {
      offset += 1;
    }
  }
  return names;
}

function readUInt16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}
