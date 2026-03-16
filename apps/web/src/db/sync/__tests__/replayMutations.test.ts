// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the replayMutations orchestrator.
 *
 * These tests mock `fetch()` to simulate server responses and verify
 * that mutations are acknowledged, retried, or dead-lettered correctly.
 *
 * References: issue #416
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebMutationQueue, type EnqueueInput } from '../MutationQueue';
import { replayMutations } from '../replayMutations';
import { MUTATION_QUEUE_DB_NAME, type SwToClientMessage } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    tableName: 'transaction',
    recordId: crypto.randomUUID(),
    operation: 'INSERT',
    data: { amount: 1500 },
    householdId: 'hh-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('replayMutations', () => {
  let queue: WebMutationQueue;

  beforeEach(() => {
    queue = new WebMutationQueue();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    await queue.clear();
    vi.restoreAllMocks();

    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(MUTATION_QUEUE_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it('should return zero counts when the queue is empty', async () => {
    const result = await replayMutations();

    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('should acknowledge all mutations on a successful server response', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const m2 = await queue.enqueue(makeInput({ recordId: 'r2' }));

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ acknowledged: [m1.id, m2.id] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await replayMutations();

    expect(result.syncedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('should retry mutations that the server did not acknowledge', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    await queue.enqueue(makeInput({ recordId: 'r2' }));

    // Server only acknowledges m1.
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ acknowledged: [m1.id] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await replayMutations();

    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(1);

    // m2 should still be in the queue with incremented retry count.
    const remaining = await queue.dequeue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].retryCount).toBe(1);
  });

  it('should treat a network error as all mutations failed', async () => {
    await queue.enqueue(makeInput({ recordId: 'r1' }));
    await queue.enqueue(makeInput({ recordId: 'r2' }));

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await replayMutations();

    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(2);

    // Both should still be in the queue.
    expect(await queue.getPendingCount()).toBe(2);
  });

  it('should treat a non-OK response as all mutations failed', async () => {
    await queue.enqueue(makeInput());

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const result = await replayMutations();

    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
  });

  it('should broadcast lifecycle messages when a callback is provided', async () => {
    await queue.enqueue(makeInput());

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const messages: SwToClientMessage[] = [];
    await replayMutations((msg) => messages.push(msg));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'SYNC_STARTED' });
    expect(messages[1]).toMatchObject({ type: 'SYNC_COMPLETED' });
  });

  it('should broadcast SYNC_COMPLETED with failures on network error', async () => {
    await queue.enqueue(makeInput());

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network down'));

    const messages: SwToClientMessage[] = [];
    await replayMutations((msg) => messages.push(msg));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'SYNC_STARTED' });
    // pushToServer catches the error internally and returns [] (no
    // acknowledged IDs), so replayMutations treats all as failed.
    expect(messages[1]).toMatchObject({
      type: 'SYNC_COMPLETED',
      syncedCount: 0,
      failedCount: 1,
    });
  });
});
