// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createSyncConflictReviewItems,
  resolveSyncConflict,
  summarizeConflictReview,
} from '../sync-conflict-review';

describe('sync conflict review', () => {
  it('builds review rows with local and remote audit metadata', () => {
    const [item] = createSyncConflictReviewItems([
      {
        entityId: 'txn-1',
        field: 'note',
        local: { value: 'client lunch', timestamp: 2_000, sourceDevice: 'Laptop' },
        remote: { value: 'team lunch', timestamp: 2_500, sourceDevice: 'Phone' },
      },
    ]);

    expect(item.id).toBe('txn-1:note');
    expect(item.auditLabel).toContain('Laptop');
    expect(item.auditLabel).toContain('Phone');
    expect(item.status).toBe('needs-review');
  });

  it('resolves each conflict by local or server value and updates counts', () => {
    const items = createSyncConflictReviewItems([
      {
        entityId: 'txn-1',
        field: 'note',
        local: { value: 'client lunch', timestamp: 2_000 },
        remote: { value: 'team lunch', timestamp: 2_500 },
      },
      {
        entityId: 'txn-1',
        field: 'categoryId',
        local: { value: 'food', timestamp: 2_000 },
        remote: { value: 'travel', timestamp: 2_500 },
      },
    ]);

    const resolution = resolveSyncConflict(items[0], 'remote', 3_000);

    expect(resolution).toMatchObject({ conflictId: 'txn-1:note', resolvedValue: 'team lunch' });
    expect(summarizeConflictReview(items, [resolution])).toEqual({ pending: 1, resolved: 1 });
  });
});
