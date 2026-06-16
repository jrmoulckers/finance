// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  BACKUP_SCHEMA_VERSION,
  buildEncryptedBackup,
  decryptBackupPreview,
  validateManifest,
  type EncryptedBackupEnvelope,
} from './encrypted-backup';
import type { FullJsonExport } from './simple-export';

function exportData(): FullJsonExport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-26T12:00:00.000Z',
    appVersion: '0.1.0',
    accounts: [{ id: 'acc-1', householdId: 'hh-1', name: 'Checking' }],
    transactions: [
      {
        id: 'txn-1',
        householdId: 'hh-1',
        accountId: 'acc-1',
        date: '2024-01-15',
        payee: 'Store',
        amount: { amount: -1234 },
        currency: { code: 'USD', decimalPlaces: 2 },
      },
    ],
    categories: [],
    budgets: [],
    goals: [],
    bills: [],
    investments: [],
    investmentLots: [],
    households: [],
    householdMembers: [],
    householdInvitations: [],
    accountSharings: [],
    sharedBudgets: [],
    budgetContributions: [],
    sharedGoals: [],
    goalContributions: [],
    preferences: [{ key: 'theme', value: 'dark' }],
    settings: [],
  } as unknown as FullJsonExport;
}

describe('encrypted-backup', () => {
  it('round-trips a full export with AES-GCM encryption', async () => {
    const backup = await buildEncryptedBackup(exportData(), 'correct horse battery staple', {
      generatedAt: new Date('2026-05-26T12:00:00Z'),
      salt: new Uint8Array(16).fill(1),
      iv: new Uint8Array(12).fill(2),
      iterations: 1_000,
    });

    const envelopeText = new TextDecoder().decode(backup.bytes);
    expect(envelopeText).toContain('finance.encrypted-backup');
    expect(envelopeText).not.toContain('Coffee');
    expect(backup.fileName).toBe('finance-backup-2026-05-26.fbackup');

    const preview = await decryptBackupPreview(backup.bytes, 'correct horse battery staple');
    expect(preview.counts.transactions).toBe(1);
    expect(preview.payload.transactions[0]).toMatchObject({ id: 'txn-1', payee: 'Store' });
  });

  it('rejects a wrong passphrase', async () => {
    const backup = await buildEncryptedBackup(exportData(), 'correct horse battery staple', {
      salt: new Uint8Array(16).fill(1),
      iv: new Uint8Array(12).fill(2),
      iterations: 1_000,
    });

    await expect(decryptBackupPreview(backup.bytes, 'incorrect passphrase')).rejects.toThrow(
      /Unable to decrypt/,
    );
  });

  it('rejects corrupted backup data', async () => {
    await expect(
      decryptBackupPreview(new TextEncoder().encode('{"manifest":'), 'correct horse battery staple'),
    ).rejects.toThrow(/corrupted|not valid JSON/);
  });

  it('rejects newer backup schemas before restore', () => {
    expect(() =>
      validateManifest({
        format: 'finance.encrypted-backup',
        version: 1,
        schemaVersion: (BACKUP_SCHEMA_VERSION + 1) as 1,
        generatedAt: '2026-05-26T12:00:00.000Z',
        appVersion: '0.1.0',
        counts: {},
      }),
    ).toThrow(/newer/);
  });

  it('detects manifest/payload metadata mismatch as a restore warning', async () => {
    const backup = await buildEncryptedBackup(exportData(), 'correct horse battery staple', {
      salt: new Uint8Array(16).fill(1),
      iv: new Uint8Array(12).fill(2),
      iterations: 1_000,
    });
    const envelope = JSON.parse(new TextDecoder().decode(backup.bytes)) as EncryptedBackupEnvelope;
    const tampered = new TextEncoder().encode(
      JSON.stringify({
        ...envelope,
        manifest: { ...envelope.manifest, generatedAt: '2030-01-01T00:00:00.000Z' },
      }),
    );

    const preview = await decryptBackupPreview(tampered, 'correct horse battery staple');
    expect(preview.warnings).toContain('Envelope metadata differs from decrypted payload metadata.');
  });
});
