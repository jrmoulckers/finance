// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import {
  DATA_ACCESS_SCHEMA_VERSION,
  buildDataAccessPackage,
  shouldAutoDeletePackage,
  shouldWarnPackageExpiresSoon,
  summarizeDataAccessDomains,
} from './data-access-package';

describe('data-access-package', () => {
  it('defaults to a redacted package with every GDPR picker domain and no binaries', () => {
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
    expect(names).toContain('data/consent_records.json');
    expect(names).toContain('data/audit_log.json');
    expect(names).toContain('data/sync_metadata.json');
    expect(names).not.toContain('attachments/receipt-1-receipt.txt');
    expect(result.manifest.schema_version).toBe(DATA_ACCESS_SCHEMA_VERSION);
    expect(result.manifest.privacy.redaction_profile).toBe('redacted');
    expect(result.manifest.privacy.protected_categories_included).toBe(false);
    expect(result.manifest.privacy.notes_included).toBe(false);
    expect(result.manifest.privacy.attachment_binaries_included).toBe(false);
  });

  it('includes only selected domains and records manifest omissions', () => {
    const result = buildDataAccessPackage(sampleInput(), {
      appVersion: '0.1.0',
      selectedDomains: ['accounts', 'transactions'],
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });
    const names = listZipNames(result.zipBytes);
    const transactions = readZipJson(result.zipBytes, 'data/transactions.json') as {
      records: Array<Record<string, unknown>>;
    };

    expect(names).toContain('data/accounts.json');
    expect(names).toContain('data/transactions.json');
    expect(names).not.toContain('data/budgets.json');
    expect(result.manifest.privacy.selected_domains).toEqual(['accounts', 'transactions']);
    expect(result.manifest.privacy.omitted_domains).toContain('audit_log');
    expect(transactions.records[0]).not.toHaveProperty('note');
  });

  it('rejects empty category selections', () => {
    expect(() =>
      buildDataAccessPackage(sampleInput(), {
        appVersion: '0.1.0',
        selectedDomains: [],
      }),
    ).toThrow(/Select at least one data category/i);
  });

  it('supports explicit full export opt-in for protected categories, notes, mood tags, and binaries', () => {
    const result = buildDataAccessPackage(sampleInput(), {
      appVersion: '0.1.0',
      selectedDomains: ['categories', 'transactions', 'attachments'],
      includeProtectedCategories: true,
      includeMoodTags: true,
      includeNotes: true,
      includeAttachmentBinaries: true,
      redactionProfile: 'full',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });
    const categories = readZipJson(result.zipBytes, 'data/categories.json') as { records: unknown[] };
    const transactions = readZipJson(result.zipBytes, 'data/transactions.json') as {
      records: Array<Record<string, unknown>>;
    };

    expect(listZipNames(result.zipBytes)).toContain('attachments/receipt-1-receipt.txt');
    expect(result.manifest.privacy.mood_tags_included).toBe(true);
    expect(result.manifest.privacy.redaction_profile).toBe('full');
    expect(categories.records).toHaveLength(2);
    expect(transactions.records[0]).toHaveProperty('note', 'private memo');
  });

  it('summarizes record counts and sensitivity warnings for the picker', () => {
    const summaries = summarizeDataAccessDomains(sampleInput());

    expect(summaries.find((item) => item.domain === 'accounts')).toMatchObject({
      label: 'Accounts',
      recordCount: 1,
    });
    expect(summaries.find((item) => item.domain === 'audit_log')?.warning).toMatch(/sensitive/i);
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
    transactions: [{ id: 'txn-1', tags: ['food'], isSynced: false, note: 'private memo' }],
    budgets: [],
    goals: [],
    categories: [
      { id: 'cat-1', name: 'Food' },
      { id: 'cat-2', name: 'Medical', sensitive: true },
    ],
    recurringRules: [{ id: 'rule-1' }],
    preferences: [{ key: 'finance-currency', value: 'USD' }],
    settings: [{ key: 'theme', value: 'system' }],
    consentRecords: [{ type: 'gdpr_consent_record' }],
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
  return readZipEntries(bytes).map((entry) => entry.name);
}

function readZipJson(bytes: Uint8Array, name: string): unknown {
  const entry = readZipEntries(bytes).find((item) => item.name === name);
  if (!entry) throw new Error('Missing ZIP entry: ' + name);
  return JSON.parse(new TextDecoder().decode(entry.bytes));
}

function readZipEntries(bytes: Uint8Array): Array<{ name: string; bytes: Uint8Array }> {
  const entries: Array<{ name: string; bytes: Uint8Array }> = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset <= bytes.length - 4) {
    if (readUInt32(bytes, offset) === 0x04034b50) {
      const compressedSize = readUInt32(bytes, offset + 18);
      const nameLength = readUInt16(bytes, offset + 26);
      const extraLength = readUInt16(bytes, offset + 28);
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      entries.push({
        name: decoder.decode(bytes.slice(nameStart, nameStart + nameLength)),
        bytes: bytes.slice(dataStart, dataStart + compressedSize),
      });
      offset = dataStart + compressedSize;
    } else {
      offset += 1;
    }
  }
  return entries;
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
