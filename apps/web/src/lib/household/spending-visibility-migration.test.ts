// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  migrateAccountSharingToSpendingVisibility,
  summarizeSpendingVisibilityMigration,
} from './spending-visibility-migration';

describe('migrateAccountSharingToSpendingVisibility', () => {
  it('converts legacy shared accounts to detailed granular rules', () => {
    const result = migrateAccountSharingToSpendingVisibility([
      {
        id: 'share-1',
        accountId: 'acct-1',
        ownerId: 'member-1',
        sharingMode: 'SHARED',
        updatedAt: '2025-05-01T00:00:00Z',
      },
    ]);

    expect(result.rules).toEqual([
      {
        id: 'visibility:share-1',
        accountId: 'acct-1',
        ownerMemberId: 'member-1',
        level: 'SHARED_TRANSACTIONS',
        updatedAt: '2025-05-01T00:00:00Z',
      },
    ]);
    expect(result.previewCopy).toContain('granular spending visibility rules');
  });

  it('converts legacy private accounts to hidden granular rules and summarizes the save preview', () => {
    const result = migrateAccountSharingToSpendingVisibility([
      {
        id: 'share-1',
        accountId: 'acct-1',
        ownerId: 'member-1',
        sharingMode: 'PRIVATE',
        updatedAt: '2025-05-01T00:00:00Z',
      },
      {
        id: 'share-2',
        accountId: 'acct-2',
        ownerId: 'member-1',
        sharingMode: 'SHARED',
        updatedAt: '2025-05-01T00:00:00Z',
      },
    ]);

    expect(result.rules.map((rule) => rule.level)).toEqual(['PRIVATE', 'SHARED_TRANSACTIONS']);
    expect(summarizeSpendingVisibilityMigration(result)).toBe(
      '2 account visibility settings ready: 1 shared with details, 1 private.',
    );
  });
});
