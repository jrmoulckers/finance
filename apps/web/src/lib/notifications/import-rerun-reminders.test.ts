// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createSavedImportProfile } from '../import/scheduled-reimport';
import {
  buildImportProfileReminderNotifications,
  canCommitReimportPlan,
  planManualReimport,
} from './import-rerun-reminders';

const profile = createSavedImportProfile({
  name: 'Checking CSV',
  sourceFormat: 'csv',
  headers: ['Date', 'Payee', 'Amount'],
  mappingKeys: ['date:Date', 'payee:Payee', 'amount:Amount'],
  cadence: { kind: 'weekly' },
  now: new Date('2025-01-01T00:00:00Z'),
});

describe('import rerun reminders', () => {
  it('builds due-profile reminders without committing transactions', () => {
    const dueProfile = { ...profile, lastRunAt: '2025-01-01T00:00:00.000Z' };
    const notifications = buildImportProfileReminderNotifications([dueProfile], {
      now: new Date('2025-01-08T00:00:00Z'),
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.actionLabel).toBe('Review import');
    expect(notifications[0]?.message).toContain('before any new transactions are committed');
  });

  it('blocks manual reruns when remembered mappings no longer match', () => {
    const intent = planManualReimport({
      profile,
      parsedTransactionCount: 4,
      duplicateCount: 1,
      parserErrorCount: 0,
      mappingFingerprint: 'different',
      now: new Date('2025-01-08T00:00:00Z'),
    });

    expect(intent.allowed).toBe(false);
    expect(intent.duplicateProtected).toBe(true);
    expect(intent.blockReasons).toContain('saved mapping does not match this file');
  });

  it('requires confirmation before committing newly detected transactions', () => {
    const intent = planManualReimport({
      profile,
      parsedTransactionCount: 4,
      duplicateCount: 1,
      parserErrorCount: 0,
      mappingFingerprint: profile.mappingFingerprint,
      now: new Date('2025-01-08T00:00:00Z'),
    });

    expect(intent.requiresUserConfirmation).toBe(true);
    expect(canCommitReimportPlan(intent.plan, false)).toBe(false);
    expect(canCommitReimportPlan(intent.plan, true)).toBe(true);
  });
});
