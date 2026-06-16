// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  createSavedImportProfile,
  isImportProfileDue,
  planReimportRun,
  recordImportRun,
  summarizeImportHistory,
} from '../scheduled-reimport';

describe('scheduled re-import profiles', () => {
  it('creates a stable profile fingerprint with safe defaults', () => {
    const profile = createSavedImportProfile({
      name: 'Monthly checking CSV',
      sourceFormat: 'csv',
      headers: ['Date', 'Description', 'Amount'],
      mappingKeys: ['date:Date', 'payee:Description', 'amount:Amount'],
      cadence: { kind: 'monthly', dayOfMonth: 15 },
      now: new Date('2024-01-01T00:00:00Z'),
    });

    expect(profile.id).toMatch(/^import-profile-/);
    expect(profile.duplicatePolicy).toBe('skip');
    expect(profile.remindersEnabled).toBe(true);
    expect(profile.mappingFingerprint).toHaveLength(8);
  });

  it('detects profiles due after their cadence elapses', () => {
    const profile = {
      ...createSavedImportProfile({
        name: 'Weekly import',
        sourceFormat: 'ynab',
        headers: ['Date', 'Payee', 'Outflow', 'Inflow'],
        mappingKeys: ['date', 'payee', 'amount'],
        cadence: { kind: 'weekly', interval: 1 },
        now: new Date('2024-01-01T00:00:00Z'),
      }),
      lastRunAt: '2024-01-01T00:00:00.000Z',
    };

    expect(isImportProfileDue(profile, new Date('2024-01-07T23:59:59Z'))).toBe(false);
    expect(isImportProfileDue(profile, new Date('2024-01-08T00:00:00Z'))).toBe(true);
  });

  it('plans a review-required run and records history', () => {
    const profile = createSavedImportProfile({
      name: 'Mint rerun',
      sourceFormat: 'mint',
      headers: ['Date', 'Description', 'Amount'],
      mappingKeys: ['date', 'payee', 'amount'],
      cadence: { kind: 'daily' },
      now: new Date('2024-01-01T00:00:00Z'),
    });

    const plan = planReimportRun({
      profile,
      parsedTransactionCount: 10,
      duplicateCount: 7,
      parserErrorCount: 0,
      now: new Date('2024-01-02T00:00:00Z'),
    });

    expect(plan.status).toBe('needs_review');
    expect(plan.newTransactionCount).toBe(3);
    expect(plan.requiresUserConfirmation).toBe(true);

    const recorded = recordImportRun({
      profile,
      plan,
      importedCount: 3,
      now: new Date('2024-01-02T00:00:00Z'),
    });

    const summary = summarizeImportHistory([recorded.run]);
    expect(recorded.profile.lastRunAt).toBe('2024-01-02T00:00:00.000Z');
    expect(summary.importedCount).toBe(3);
    expect(summary.skippedDuplicateCount).toBe(7);
  });
});
