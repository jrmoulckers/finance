// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createSyncReplayProgressMessage,
  createSyncReplayToastSummary,
  shouldApplyReplayMutation,
  shouldBroadcastReplayProgress,
} from '../sync-replay-progress';

describe('sync replay progress', () => {
  it('broadcasts progress every two seconds only for long replays', () => {
    expect(
      shouldBroadcastReplayProgress({ totalCount: 100, completedCount: 1, mergedCount: 0, failedCount: 0, conflictCount: 0, now: 1_000, lastBroadcastAt: null }),
    ).toBe(true);
    expect(
      shouldBroadcastReplayProgress({ totalCount: 100, completedCount: 2, mergedCount: 0, failedCount: 0, conflictCount: 0, now: 2_000, lastBroadcastAt: 1_000 }),
    ).toBe(false);
    expect(
      shouldBroadcastReplayProgress({ totalCount: 10, completedCount: 2, mergedCount: 0, failedCount: 0, conflictCount: 0, now: 3_000, lastBroadcastAt: null }),
    ).toBe(false);
  });

  it('creates cross-tab replay messages with counts and percentages', () => {
    expect(
      createSyncReplayProgressMessage({ totalCount: 100, completedCount: 25, mergedCount: 3, failedCount: 1, conflictCount: 2, now: 5_000, lastBroadcastAt: null }),
    ).toEqual({
      type: 'sync-replay-progress',
      totalCount: 100,
      completedCount: 25,
      remainingCount: 75,
      percentComplete: 25,
      mergedCount: 3,
      failedCount: 1,
      conflictCount: 2,
      emittedAt: 5_000,
    });
  });

  it('summarizes synced, merged, failed, and conflicted replay results', () => {
    expect(createSyncReplayToastSummary({ syncedCount: 8, mergedCount: 2, failedCount: 0, conflictCount: 1 })).toEqual({
      tone: 'warning',
      message: '8 synced, 2 merged, 0 failed, 1 conflicted.',
    });
  });

  it('keeps mutation replay idempotent by skipping already applied ids', () => {
    expect(shouldApplyReplayMutation('m-1', new Set(['m-1']))).toBe(false);
    expect(shouldApplyReplayMutation('m-2', new Set(['m-1']))).toBe(true);
  });
});
