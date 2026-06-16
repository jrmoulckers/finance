// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  mergeNonOverlappingChanges,
  shouldEmitSyncProgress,
  summarizeReplay,
} from '../sync-conflict-feedback';

describe('sync conflict feedback', () => {
  it('auto-merges non-overlapping field edits', () => {
    const result = mergeNonOverlappingChanges({
      base: { categoryId: 'food', note: 'lunch', cleared: false },
      local: { categoryId: 'groceries', note: 'lunch', cleared: false },
      remote: { categoryId: 'food', note: 'team lunch', cleared: false },
    });

    expect(result.mode).toBe('auto-merged');
    expect(result.merged).toEqual({ categoryId: 'groceries', note: 'team lunch', cleared: false });
    expect(result.autoMergedFields).toEqual(['categoryId']);
    expect(result.conflicts).toEqual([]);
  });

  it('requires review when local and remote edit the same field differently', () => {
    const result = mergeNonOverlappingChanges({
      base: { note: 'lunch', updatedBy: 'phone' },
      local: { note: 'client lunch', updatedBy: 'desktop' },
      remote: { note: 'team lunch', updatedBy: 'web' },
      protectedFields: ['updatedBy'],
    });

    expect(result.mode).toBe('needs-review');
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts.map((conflict) => conflict.field)).toEqual(['note', 'updatedBy']);
  });

  it('creates replay summary copy with synced, merged, failed, and conflicted counts', () => {
    expect(
      summarizeReplay({ syncedCount: 10, mergedCount: 2, failedCount: 0, conflictCount: 1 }),
    ).toEqual({
      severity: 'warning',
      title: 'Sync needs review',
      detail: '10 synced, 2 merged, 0 failed, 1 need review.',
    });
  });

  it('emits progress every two seconds for larger replays', () => {
    expect(shouldEmitSyncProgress({ pendingCount: 11, lastEmittedAt: null, now: 1_000 })).toBe(
      true,
    );
    expect(shouldEmitSyncProgress({ pendingCount: 11, lastEmittedAt: 1_000, now: 2_000 })).toBe(
      false,
    );
    expect(shouldEmitSyncProgress({ pendingCount: 11, lastEmittedAt: 1_000, now: 3_100 })).toBe(
      true,
    );
    expect(shouldEmitSyncProgress({ pendingCount: 10, lastEmittedAt: null, now: 1_000 })).toBe(
      false,
    );
  });
});
