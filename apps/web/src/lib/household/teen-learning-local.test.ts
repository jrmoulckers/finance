// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildTeenLearningPayload,
  buildTeenLearningRecordFromChild,
  upsertTeenLearningRecord,
} from './teen-learning-local';

const NOW = '2025-05-01T12:00:00Z';

describe('buildTeenLearningRecordFromChild', () => {
  it('seeds practice balances from allowance balance and completed chores', () => {
    const record = buildTeenLearningRecordFromChild(
      'household-1',
      {
        id: 'child-1',
        name: ' Taylor ',
        age: 14,
        balance: 22.5,
        chores: [
          { id: 'chore-1', value: 3.25, completedThisWeek: true },
          { id: 'chore-2', value: 10, completedThisWeek: false },
        ],
      },
      NOW,
    );

    expect(record.childProfileId).toBe('child-1');
    expect(record.account.displayName).toBe('Taylor');
    expect(record.account.learningBalanceCents).toBe(2_575);
  });

  it('stores only the child profile id instead of duplicating the child profile', () => {
    const record = buildTeenLearningRecordFromChild(
      'household-1',
      {
        id: 'child-1',
        name: 'Taylor',
        age: 14,
        balance: 10,
        chores: [],
      },
      NOW,
    );

    expect(record).not.toHaveProperty('childProfile');
    expect(record.account).not.toHaveProperty('adultAccounts');
    expect(record.account).not.toHaveProperty('adultTransactions');
    expect(record.account.privacyNotice).toContain('adult household finances stay hidden');
  });
});

describe('upsertTeenLearningRecord', () => {
  it('replaces an existing record for the same child instead of duplicating it', () => {
    const first = buildTeenLearningRecordFromChild(
      'household-1',
      {
        id: 'child-1',
        name: 'Taylor',
        age: 14,
        balance: 10,
        chores: [],
      },
      NOW,
    );
    const next = buildTeenLearningRecordFromChild(
      'household-1',
      {
        id: 'child-1',
        name: 'Taylor',
        age: 14,
        balance: 12,
        chores: [],
      },
      '2025-05-02T12:00:00Z',
    );

    const records = upsertTeenLearningRecord([first], next);

    expect(records).toHaveLength(1);
    expect(records[0].account.learningBalanceCents).toBe(1_200);
  });
});

describe('buildTeenLearningPayload', () => {
  it('filters local-first persistence to one household and excludes adult finance fields', () => {
    const record = buildTeenLearningRecordFromChild(
      'household-1',
      {
        id: 'child-1',
        name: 'Taylor',
        age: 14,
        balance: 10,
        chores: [],
      },
      NOW,
    );
    const otherRecord = {
      ...record,
      id: 'teen-learning:household-2:child-1',
      householdId: 'household-2',
    };

    const payload = buildTeenLearningPayload('household-1', [record, otherRecord]);

    expect(payload.records).toEqual([record]);
    expect(payload).not.toHaveProperty('adultNetWorthCents');
    expect(payload.privacyNotice).toContain(
      'adult accounts, transactions, and net worth are excluded',
    );
  });
});
