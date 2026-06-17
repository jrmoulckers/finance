// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  decideOfflineAction,
  describeQueuedAction,
  shouldStartReplayOnOnline,
} from '../offline-first-actions';

describe('offline first actions', () => {
  it('allows transaction categorization to be queued offline', () => {
    const decision = decideOfflineAction({
      entity: 'transaction',
      operation: 'categorize',
      hasLocalReplica: true,
    });

    expect(decision).toEqual({
      supported: true,
      status: 'queued',
      reason: null,
      shouldPersistMutation: true,
    });
  });

  it('disables unsupported offline writes with helpful copy', () => {
    const decision = decideOfflineAction({
      entity: 'budget',
      operation: 'edit',
      hasLocalReplica: true,
    });

    expect(decision.supported).toBe(false);
    expect(decision.status).toBe('disabled');
    expect(decision.reason).toContain('read-only offline');
  });

  it('describes statuses for user-facing sync feedback', () => {
    expect(describeQueuedAction('queued', 3).label).toBe('Queued offline #3');
    expect(describeQueuedAction('needs-review').canReview).toBe(true);
    expect(describeQueuedAction('failed').canRetry).toBe(true);
  });

  it('starts replay inside the online recovery window only when work is pending', () => {
    expect(shouldStartReplayOnOnline({ cameOnlineAt: 1_000, now: 4_000, pendingCount: 2 })).toBe(
      true,
    );
    expect(shouldStartReplayOnOnline({ cameOnlineAt: 1_000, now: 7_000, pendingCount: 2 })).toBe(
      false,
    );
    expect(shouldStartReplayOnOnline({ cameOnlineAt: 1_000, now: 2_000, pendingCount: 0 })).toBe(
      false,
    );
  });
});
