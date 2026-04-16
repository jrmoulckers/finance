// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the sync orchestrator.
 *
 * References: issue #535
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performFullSync, resetSyncOrchestrator, isSyncInProgress } from '../syncOrchestrator';
import type { ReplayResult } from '../replayMutations';

// Mock the sub-modules
vi.mock('../replayMutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../replayMutations')>();
  return {
    ...actual,
    replayMutations: vi.fn().mockResolvedValue({
      syncedCount: 0,
      failedCount: 0,
      conflictCount: 0,
      authError: false,
    }),
  };
});

vi.mock('../pullChanges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../pullChanges')>();
  return {
    ...actual,
    pullChanges: vi.fn().mockResolvedValue({
      appliedCount: 0,
      authError: false,
      skipped: false,
      error: null,
    }),
  };
});

vi.mock('../healthCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../healthCheck')>();
  return {
    ...actual,
    checkSyncHealth: vi.fn().mockResolvedValue({
      reachable: true,
      latencyMs: 50,
      serverTime: null,
      status: 200,
      checkedAt: Date.now(),
    }),
  };
});

vi.mock('../../../auth/token-storage', () => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

import { replayMutations } from '../replayMutations';
import { pullChanges } from '../pullChanges';
import { checkSyncHealth } from '../healthCheck';

describe('performFullSync', () => {
  beforeEach(() => {
    resetSyncOrchestrator();
    vi.clearAllMocks();
    vi.mocked(replayMutations).mockResolvedValue({
      syncedCount: 0,
      failedCount: 0,
      conflictCount: 0,
      authError: false,
    });
    vi.mocked(pullChanges).mockResolvedValue({
      appliedCount: 0,
      authError: false,
      skipped: false,
      error: null,
    });
    vi.mocked(checkSyncHealth).mockResolvedValue({
      reachable: true,
      latencyMs: 50,
      serverTime: null,
      status: 200,
      checkedAt: Date.now(),
    });
  });

  afterEach(() => {
    resetSyncOrchestrator();
  });

  it('should run health check, push, then pull', async () => {
    const result = await performFullSync();

    expect(checkSyncHealth).toHaveBeenCalledTimes(1);
    expect(replayMutations).toHaveBeenCalledTimes(1);
    expect(pullChanges).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(false);
    expect(result.authError).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should skip push and pull when health check fails', async () => {
    vi.mocked(checkSyncHealth).mockResolvedValue({
      reachable: false,
      latencyMs: null,
      serverTime: null,
      status: null,
      checkedAt: Date.now(),
    });

    const result = await performFullSync();

    expect(checkSyncHealth).toHaveBeenCalledTimes(1);
    expect(replayMutations).not.toHaveBeenCalled();
    expect(pullChanges).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
    expect(result.health?.reachable).toBe(false);
  });

  it('should skip health check when option is set', async () => {
    const result = await performFullSync({ skipHealthCheck: true });

    expect(checkSyncHealth).not.toHaveBeenCalled();
    expect(replayMutations).toHaveBeenCalledTimes(1);
    expect(result.health).toBeNull();
  });

  it('should skip pull when option is set', async () => {
    const result = await performFullSync({ skipPull: true });

    expect(replayMutations).toHaveBeenCalledTimes(1);
    expect(pullChanges).not.toHaveBeenCalled();
    expect(result.pull).toBeNull();
  });

  it('should stop at push when push has authError', async () => {
    vi.mocked(replayMutations).mockResolvedValue({
      syncedCount: 0,
      failedCount: 1,
      conflictCount: 0,
      authError: true,
    });

    const result = await performFullSync();

    expect(replayMutations).toHaveBeenCalledTimes(1);
    expect(pullChanges).not.toHaveBeenCalled();
    expect(result.authError).toBe(true);
    expect(result.push?.authError).toBe(true);
  });

  it('should report authError when pull has authError', async () => {
    vi.mocked(pullChanges).mockResolvedValue({
      appliedCount: 0,
      authError: true,
      skipped: false,
      error: null,
    });

    const result = await performFullSync();

    expect(result.authError).toBe(true);
    expect(result.pull?.authError).toBe(true);
  });

  it('should prevent concurrent sync cycles', async () => {
    // Create a promise that we control to simulate a long sync
    let resolveReplay!: (value: ReplayResult | PromiseLike<ReplayResult>) => void;
    vi.mocked(replayMutations).mockReturnValue(
      new Promise((resolve) => {
        resolveReplay = resolve;
      }),
    );

    const first = performFullSync({ skipHealthCheck: true });
    const second = await performFullSync({ skipHealthCheck: true });

    expect(second.skipped).toBe(true);
    expect(isSyncInProgress()).toBe(true);

    // Clean up
    resolveReplay({
      syncedCount: 0,
      failedCount: 0,
      conflictCount: 0,
      authError: false,
    });
    await first;
    expect(isSyncInProgress()).toBe(false);
  });

  it('should aggregate push and pull results', async () => {
    vi.mocked(replayMutations).mockResolvedValue({
      syncedCount: 3,
      failedCount: 1,
      conflictCount: 0,
      authError: false,
    });
    vi.mocked(pullChanges).mockResolvedValue({
      appliedCount: 5,
      authError: false,
      skipped: false,
      error: null,
    });

    const result = await performFullSync();

    expect(result.push?.syncedCount).toBe(3);
    expect(result.push?.failedCount).toBe(1);
    expect(result.pull?.appliedCount).toBe(5);
  });

  it('should pass broadcast function to replayMutations', async () => {
    const broadcast = vi.fn();
    await performFullSync({ broadcast });

    expect(replayMutations).toHaveBeenCalledWith(broadcast);
  });

  it('should pass applyPullChanges to pullChanges', async () => {
    const applyFn = vi.fn();
    await performFullSync({ applyPullChanges: applyFn });

    expect(pullChanges).toHaveBeenCalledWith(applyFn);
  });
});
