// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createBackgroundSyncQaMatrix,
  getDisabledOfflineActionCopy,
  getOfflineActionCoverage,
  listUnsupportedOfflineWrites,
} from '../offline-action-coverage';

describe('offline action coverage', () => {
  it('keeps supported account and transaction writes queueable', () => {
    expect(getOfflineActionCoverage('account', 'edit')).toMatchObject({ supportedOffline: true });
    expect(getOfflineActionCoverage('transaction', 'categorize')).toMatchObject({ supportedOffline: true });
  });

  it('returns helpful disabled copy before unsupported writes submit', () => {
    expect(getDisabledOfflineActionCopy('budget', 'edit')).toContain('Reconnect to edit budgets');
    expect(getDisabledOfflineActionCopy('receipt', 'upload')).toContain('Receipt images are not queued');
    expect(listUnsupportedOfflineWrites().map((rule) => rule.entity)).toEqual(['budget', 'receipt', 'settings']);
  });

  it('documents browser fallback expectations without Background Sync', () => {
    expect(
      createBackgroundSyncQaMatrix([
        { browser: 'Chromium', hasBackgroundSync: true },
        { browser: 'Firefox', hasBackgroundSync: false },
      ]),
    ).toEqual([
      { browser: 'Chromium', hasBackgroundSync: true, expectedFallback: 'automatic-replay' },
      { browser: 'Firefox', hasBackgroundSync: false, expectedFallback: 'manual-sync-button' },
    ]);
  });
});
