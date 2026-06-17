// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildOfflineMutationStatusViewModels,
  deserializeOfflineMutations,
  serializeOfflineMutations,
  shouldStartOfflineReplay,
  type OfflineMutationRecord,
} from '../offline-mutation-status';

function record(index: number): OfflineMutationRecord {
  return {
    id: `mutation-${index}`,
    entity: index % 2 === 0 ? 'account' : 'transaction',
    entityId: `entity-${index}`,
    operation: 'edit',
    state: 'queued',
    createdAt: index,
    updatedAt: index,
  };
}

describe('offline mutation status', () => {
  it('round-trips at least 50 queued edits for browser restart recovery', () => {
    const records = Array.from({ length: 50 }, (_value, index) => record(index));
    const restored = deserializeOfflineMutations(serializeOfflineMutations(records));

    expect(restored).toHaveLength(50);
    expect(buildOfflineMutationStatusViewModels(restored)[49].label).toBe('Queued transaction change #50');
  });

  it('surfaces retry and review affordances from durable queue states', () => {
    const viewModels = buildOfflineMutationStatusViewModels([
      { ...record(1), state: 'failed', errorMessage: 'Network timeout' },
      { ...record(2), state: 'conflicted' },
    ]);

    expect(viewModels[0]).toMatchObject({ canRetry: true, detail: 'Network timeout' });
    expect(viewModels[1]).toMatchObject({ canReview: true, status: 'conflicted' });
  });

  it('autostarts replay within five seconds of reconnect', () => {
    expect(shouldStartOfflineReplay({ pendingCount: 3, cameOnlineAt: 1_000, now: 5_000 })).toBe(true);
    expect(shouldStartOfflineReplay({ pendingCount: 3, cameOnlineAt: 1_000, now: 7_000 })).toBe(false);
    expect(shouldStartOfflineReplay({ pendingCount: 0, cameOnlineAt: 1_000, now: 2_000 })).toBe(false);
  });
});
