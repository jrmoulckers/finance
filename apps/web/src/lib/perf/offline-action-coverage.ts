// SPDX-License-Identifier: BUSL-1.1

export type OfflineCoverageEntity = 'account' | 'transaction' | 'budget' | 'receipt' | 'settings';
export type OfflineCoverageOperation =
  | 'create'
  | 'edit'
  | 'delete'
  | 'categorize'
  | 'add-note'
  | 'upload'
  | 'change-preference';

export interface OfflineActionCoverageRule {
  readonly entity: OfflineCoverageEntity;
  readonly operation: OfflineCoverageOperation;
  readonly supportedOffline: boolean;
  readonly requiresOpenedOnlineFirst: boolean;
  readonly disabledCopy: string;
}

export interface BrowserOfflineCapability {
  readonly browser: string;
  readonly hasBackgroundSync: boolean;
  readonly expectedFallback: 'automatic-replay' | 'manual-sync-button';
}

export const OFFLINE_ACTION_COVERAGE: readonly OfflineActionCoverageRule[] = [
  supported('account', 'create'),
  supported('account', 'edit'),
  supported('account', 'delete'),
  supported('transaction', 'create'),
  supported('transaction', 'edit'),
  supported('transaction', 'delete'),
  supported('transaction', 'categorize'),
  supported('transaction', 'add-note'),
  unsupported(
    'budget',
    'edit',
    'Reconnect to edit budgets. Budget rules must be opened online before offline writes are available.',
  ),
  unsupported(
    'receipt',
    'upload',
    'Reconnect to upload receipts. Receipt images are not queued until the receipt service is available.',
  ),
  unsupported(
    'settings',
    'change-preference',
    'Reconnect to change settings so all devices receive the same preference.',
  ),
];

export function getOfflineActionCoverage(
  entity: OfflineCoverageEntity,
  operation: OfflineCoverageOperation,
): OfflineActionCoverageRule | null {
  return (
    OFFLINE_ACTION_COVERAGE.find(
      (rule) => rule.entity === entity && rule.operation === operation,
    ) ?? null
  );
}

export function getDisabledOfflineActionCopy(
  entity: OfflineCoverageEntity,
  operation: OfflineCoverageOperation,
): string | null {
  const rule = getOfflineActionCoverage(entity, operation);
  if (rule === null || rule.supportedOffline) return null;
  return rule.disabledCopy;
}

export function listUnsupportedOfflineWrites(): readonly OfflineActionCoverageRule[] {
  return OFFLINE_ACTION_COVERAGE.filter((rule) => !rule.supportedOffline);
}

export function createBackgroundSyncQaMatrix(
  browsers: readonly { readonly browser: string; readonly hasBackgroundSync: boolean }[],
): readonly BrowserOfflineCapability[] {
  return browsers.map((browser) => ({
    ...browser,
    expectedFallback: browser.hasBackgroundSync ? 'automatic-replay' : 'manual-sync-button',
  }));
}

function supported(
  entity: OfflineCoverageEntity,
  operation: OfflineCoverageOperation,
): OfflineActionCoverageRule {
  return {
    entity,
    operation,
    supportedOffline: true,
    requiresOpenedOnlineFirst: operation !== 'create',
    disabledCopy: '',
  };
}

function unsupported(
  entity: OfflineCoverageEntity,
  operation: OfflineCoverageOperation,
  disabledCopy: string,
): OfflineActionCoverageRule {
  return {
    entity,
    operation,
    supportedOffline: false,
    requiresOpenedOnlineFirst: true,
    disabledCopy,
  };
}
