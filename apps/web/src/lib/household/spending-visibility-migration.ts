// SPDX-License-Identifier: BUSL-1.1

import type { AccountSharing, AccountSharingMode } from '../../kmp/bridge';
import type { SpendingVisibilityLevel, SpendingVisibilityRule } from './spending-visibility';

export interface LegacyAccountSharingInput {
  readonly id: string;
  readonly accountId: string;
  readonly ownerId: string;
  readonly sharingMode: AccountSharingMode;
  readonly updatedAt: string;
}

export interface SpendingVisibilityMigrationResult {
  readonly rules: readonly SpendingVisibilityRule[];
  readonly migratedCount: number;
  readonly previewCopy: string;
}

function levelForSharingMode(mode: AccountSharingMode): SpendingVisibilityLevel {
  return mode === 'SHARED' ? 'SHARED_TRANSACTIONS' : 'PRIVATE';
}

export function migrateAccountSharingToSpendingVisibility(
  accountSharings: readonly (LegacyAccountSharingInput | AccountSharing)[],
): SpendingVisibilityMigrationResult {
  const rules = accountSharings.map((sharing) => ({
    id: `visibility:${sharing.id}`,
    accountId: sharing.accountId,
    ownerMemberId: sharing.ownerId,
    level: levelForSharingMode(sharing.sharingMode),
    updatedAt: sharing.updatedAt,
  }));

  return {
    rules,
    migratedCount: rules.length,
    previewCopy:
      'Legacy private/shared account settings were converted to granular spending visibility rules before saving.',
  };
}

export function summarizeSpendingVisibilityMigration(result: SpendingVisibilityMigrationResult): string {
  const sharedCount = result.rules.filter((rule) => rule.level === 'SHARED_TRANSACTIONS').length;
  const privateCount = result.rules.filter((rule) => rule.level === 'PRIVATE').length;
  return `${result.migratedCount} account visibility settings ready: ${sharedCount} shared with details, ${privateCount} private.`;
}
