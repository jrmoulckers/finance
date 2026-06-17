// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildEncryptionStatusDashboard, summarizeEncryptionRecovery } from './encryption-status';

const supportedCrypto = { subtle: { encrypt: () => undefined }, getRandomValues: () => new Uint8Array(1) } as unknown as Crypto;

describe('encryption status dashboard helpers', () => {
  it('reports first-run setup, unlock, encrypted, and not-applicable states', () => {
    const dashboard = buildEncryptionStatusDashboard(
      [
        {
          category: 'accounts',
          label: 'Accounts',
          applicable: true,
          totalRecords: 2,
          encryptedRecords: 0,
          keyState: 'not_configured',
        },
        {
          category: 'transactions',
          label: 'Transactions',
          applicable: true,
          totalRecords: 5,
          encryptedRecords: 5,
          keyState: 'unlocked',
        },
        {
          category: 'memos',
          label: 'Memos',
          applicable: true,
          totalRecords: 1,
          encryptedRecords: 1,
          keyState: 'locked',
        },
        {
          category: 'attachments',
          label: 'Attachments',
          applicable: false,
          totalRecords: 0,
          encryptedRecords: 0,
          keyState: 'not_configured',
        },
      ],
      { crypto: supportedCrypto, indexedDbAvailable: true, persistentStorageAvailable: false },
    );

    expect(dashboard.firstRunSetupRequired).toBe(true);
    expect(dashboard.rows.map((row) => row.status)).toEqual([
      'not_encrypted',
      'encrypted',
      'locked',
      'not_applicable',
    ]);
    expect(dashboard.rows[0]?.action).toBe('set_up');
    expect(dashboard.rows[2]?.action).toBe('unlock');
  });

  it('uses unavailable fallback copy when Web Crypto or storage is missing', () => {
    const dashboard = buildEncryptionStatusDashboard(
      [
        {
          category: 'budgets',
          label: 'Budgets',
          applicable: true,
          totalRecords: 1,
          encryptedRecords: 0,
          keyState: 'not_configured',
        },
      ],
      { crypto: {} as Crypto, indexedDbAvailable: false, persistentStorageAvailable: false },
    );

    expect(dashboard.webCryptoAvailable).toBe(false);
    expect(dashboard.rows[0]).toMatchObject({ status: 'unavailable', action: 'review' });
    expect(summarizeEncryptionRecovery('unavailable')).toContain('Web Crypto');
  });

  it('flags partially encrypted migrations for review', () => {
    const dashboard = buildEncryptionStatusDashboard(
      [
        {
          category: 'audit-log',
          label: 'Audit log',
          applicable: true,
          totalRecords: 3,
          encryptedRecords: 2,
          keyState: 'unlocked',
        },
      ],
      { crypto: supportedCrypto, indexedDbAvailable: true, persistentStorageAvailable: true },
    );

    expect(dashboard.rows[0]).toMatchObject({ status: 'partially_encrypted', action: 'review' });
    expect(dashboard.rows[0]?.detail).toContain('2 of 3');
  });
});
