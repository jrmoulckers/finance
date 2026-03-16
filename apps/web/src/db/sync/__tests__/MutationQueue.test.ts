// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the WebMutationQueue and its IndexedDB persistence layer.
 *
 * Uses `fake-indexeddb` to provide an IndexedDB implementation in the
 * jsdom/Node test environment.
 *
 * References: issue #416
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebMutationQueue, type EnqueueInput } from '../MutationQueue';
import { MUTATION_QUEUE_DB_NAME } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  return {
    tableName: 'transaction',
    recordId: crypto.randomUUID(),
    operation: 'INSERT',
    data: { amount: 1500, payee: 'Test Store' },
    householdId: 'hh-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebMutationQueue', () => {
  let queue: WebMutationQueue;

  beforeEach(() => {
    queue = new WebMutationQueue();
  });

  afterEach(async () => {
    await queue.clear();

    // Delete the database to avoid state leakage.
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(MUTATION_QUEUE_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  // -----------------------------------------------------------------------
  // enqueue
  // -----------------------------------------------------------------------

  it('should enqueue a mutation and assign an id and timestamp', async () => {
    const input = makeInput();
    const mutation = await queue.enqueue(input);

    expect(mutation.id).toBeDefined();
    expect(typeof mutation.id).toBe('string');
    expect(mutation.id.length).toBeGreaterThan(0);
    expect(mutation.tableName).toBe('transaction');
    expect(mutation.recordId).toBe(input.recordId);
    expect(mutation.operation).toBe('INSERT');
    expect(mutation.data).toEqual({ amount: 1500, payee: 'Test Store' });
    expect(mutation.timestamp).toBeGreaterThan(0);
    expect(mutation.retryCount).toBe(0);
    expect(mutation.householdId).toBe('hh-1');
  });

  it('should assign unique IDs to each enqueued mutation', async () => {
    const m1 = await queue.enqueue(makeInput());
    const m2 = await queue.enqueue(makeInput());

    expect(m1.id).not.toBe(m2.id);
  });

  // -----------------------------------------------------------------------
  // dequeue
  // -----------------------------------------------------------------------

  it('should return an empty array when the queue is empty', async () => {
    const result = await queue.dequeue();
    expect(result).toEqual([]);
  });

  it('should return all enqueued mutations in order', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const m2 = await queue.enqueue(makeInput({ recordId: 'r2' }));
    const m3 = await queue.enqueue(makeInput({ recordId: 'r3' }));

    const result = await queue.dequeue();
    expect(result).toHaveLength(3);

    // All three mutations must be present (order may vary when timestamps
    // are identical because Date.now() resolution is limited).
    const ids = new Set(result.map((m) => m.id));
    expect(ids.has(m1.id)).toBe(true);
    expect(ids.has(m2.id)).toBe(true);
    expect(ids.has(m3.id)).toBe(true);
  });

  it('should respect the count parameter', async () => {
    await queue.enqueue(makeInput({ recordId: 'r1' }));
    await queue.enqueue(makeInput({ recordId: 'r2' }));
    await queue.enqueue(makeInput({ recordId: 'r3' }));

    const result = await queue.dequeue(2);
    expect(result).toHaveLength(2);
  });

  it('should not remove mutations on dequeue (peek semantics)', async () => {
    await queue.enqueue(makeInput());

    const first = await queue.dequeue();
    expect(first).toHaveLength(1);

    const second = await queue.dequeue();
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  // -----------------------------------------------------------------------
  // acknowledge
  // -----------------------------------------------------------------------

  it('should remove acknowledged mutations', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const m2 = await queue.enqueue(makeInput({ recordId: 'r2' }));

    await queue.acknowledge([m1.id]);

    const remaining = await queue.dequeue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(m2.id);
  });

  it('should handle acknowledging an empty array gracefully', async () => {
    await queue.enqueue(makeInput());
    await queue.acknowledge([]);

    const count = await queue.getPendingCount();
    expect(count).toBe(1);
  });

  it('should handle acknowledging non-existent IDs gracefully', async () => {
    await queue.enqueue(makeInput());
    await queue.acknowledge(['non-existent-id']);

    const count = await queue.getPendingCount();
    expect(count).toBe(1);
  });

  // -----------------------------------------------------------------------
  // retry
  // -----------------------------------------------------------------------

  it('should increment retry count and re-persist', async () => {
    const mutation = await queue.enqueue(makeInput());

    const result = await queue.retry(mutation);
    expect(result).toBe(true);

    const pending = await queue.dequeue();
    expect(pending).toHaveLength(1);
    expect(pending[0].retryCount).toBe(1);
  });

  it('should dead-letter mutations that exceed max retries', async () => {
    const mutation = await queue.enqueue(makeInput());

    // Simulate reaching max retries (MAX_RETRY_COUNT = 5).
    mutation.retryCount = 5;
    const result = await queue.retry(mutation);

    expect(result).toBe(false);

    const count = await queue.getPendingCount();
    expect(count).toBe(0);
  });

  // -----------------------------------------------------------------------
  // getPendingCount
  // -----------------------------------------------------------------------

  it('should return the correct count', async () => {
    expect(await queue.getPendingCount()).toBe(0);

    await queue.enqueue(makeInput());
    expect(await queue.getPendingCount()).toBe(1);

    await queue.enqueue(makeInput());
    expect(await queue.getPendingCount()).toBe(2);
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  it('should remove all mutations', async () => {
    await queue.enqueue(makeInput());
    await queue.enqueue(makeInput());
    await queue.enqueue(makeInput());

    await queue.clear();

    expect(await queue.getPendingCount()).toBe(0);
    expect(await queue.dequeue()).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Various operations
  // -----------------------------------------------------------------------

  it('should support DELETE operations with null data', async () => {
    const mutation = await queue.enqueue(
      makeInput({
        operation: 'DELETE',
        data: null,
      }),
    );

    expect(mutation.operation).toBe('DELETE');
    expect(mutation.data).toBeNull();

    const pending = await queue.dequeue();
    expect(pending[0].data).toBeNull();
  });

  it('should support UPDATE operations', async () => {
    const mutation = await queue.enqueue(
      makeInput({
        operation: 'UPDATE',
        data: { amount: 2000, payee: 'Updated Store' },
      }),
    );

    expect(mutation.operation).toBe('UPDATE');

    const pending = await queue.dequeue();
    expect(pending[0].data).toEqual({ amount: 2000, payee: 'Updated Store' });
  });

  it('should support different table names', async () => {
    await queue.enqueue(makeInput({ tableName: 'account' }));
    await queue.enqueue(makeInput({ tableName: 'transaction' }));
    await queue.enqueue(makeInput({ tableName: 'budget' }));

    const pending = await queue.dequeue();
    const tableNames = pending.map((m) => m.tableName).sort();
    expect(tableNames).toEqual(['account', 'budget', 'transaction']);
  });

  it('should survive a full enqueue-dequeue-acknowledge cycle', async () => {
    // Simulate the complete offline -> online flow.
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const m2 = await queue.enqueue(makeInput({ recordId: 'r2' }));
    const m3 = await queue.enqueue(makeInput({ recordId: 'r3' }));

    // Verify all three are present.
    expect(await queue.getPendingCount()).toBe(3);

    // Acknowledge m1 (succeeded on server).
    await queue.acknowledge([m1.id]);
    expect(await queue.getPendingCount()).toBe(2);

    // Retry m2 (failed on server).
    await queue.retry(m2);

    // Check state -- m2 (retried) + m3 should remain.
    const remaining = await queue.dequeue();
    expect(remaining).toHaveLength(2);

    const remainingIds = new Set(remaining.map((m) => m.id));
    expect(remainingIds.has(m2.id)).toBe(true);
    expect(remainingIds.has(m3.id)).toBe(true);

    // m2 should have its retry count incremented.
    const retriedM2 = remaining.find((m) => m.id === m2.id);
    expect(retriedM2?.retryCount).toBe(1);

    // m3 should be untouched.
    const untouchedM3 = remaining.find((m) => m.id === m3.id);
    expect(untouchedM3?.retryCount).toBe(0);
  });
});
