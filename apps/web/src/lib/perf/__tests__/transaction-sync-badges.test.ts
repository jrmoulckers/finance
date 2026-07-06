// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { createTransactionSyncBadge, mapTransactionSyncBadges } from '../transaction-sync-badges';

describe('transaction sync badges', () => {
  it('uses calm saved-on-device copy for queued transactions', () => {
    const badge = createTransactionSyncBadge('txn-1', {
      transactionId: 'txn-1',
      state: 'queued',
      queuePosition: 2,
    });

    expect(badge.label).toBe('Queued #2');
    expect(badge.description).toBe('Saved on this device. Will sync when online.');
    expect(badge.ariaLabel).toContain('Saved on this device');
    expect(badge.action).toBeNull();
  });

  it('exposes retry and conflict actions only when available', () => {
    expect(
      createTransactionSyncBadge('txn-2', {
        transactionId: 'txn-2',
        state: 'failed',
        canRetry: true,
      }).action,
    ).toBe('retry-sync');

    expect(
      createTransactionSyncBadge('txn-3', {
        transactionId: 'txn-3',
        state: 'conflicted',
        canResolveConflict: true,
      }).action,
    ).toBe('review-conflict');
  });

  it('maps per-transaction states without creating a second status system', () => {
    const badges = mapTransactionSyncBadges(
      ['txn-1', 'txn-2', 'txn-3'],
      [{ transactionId: 'txn-2', state: 'syncing' }],
      new Set(['txn-3']),
    );

    expect(badges.map((badge) => badge.state)).toEqual(['synced', 'syncing', 'saved-local']);
  });
});
