// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the replayMutations orchestrator.
 *
 * References: issue #416, #535
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebMutationQueue, type EnqueueInput } from '../MutationQueue';
import {
  configureSyncEndpoint,
  replayMutations,
  resetSyncConfig,
  getSyncConfig,
} from '../replayMutations';
import { MUTATION_QUEUE_DB_NAME, type SwToClientMessage } from '../types';
import { CONFLICT_DB_NAME, getUnresolvedConflicts } from '../sync-conflict';

vi.mock('../../../auth/token-storage', () => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

import { getAccessToken } from '../../../auth/token-storage';

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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('replayMutations', () => {
  let queue: WebMutationQueue;

  beforeEach(() => {
    queue = new WebMutationQueue();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(getAccessToken).mockResolvedValue(null);
    resetSyncConfig();
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
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(CONFLICT_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  it('should return zero counts when the queue is empty', async () => {
    const result = await replayMutations();
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.conflictCount).toBe(0);
    expect(result.authError).toBe(false);
  });

  it('should acknowledge all mutations on success', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const m2 = await queue.enqueue(makeInput({ recordId: 'r2' }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ acknowledged: [m1.id, m2.id] }));
    const result = await replayMutations();
    expect(result.syncedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.authError).toBe(false);
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('should retry mutations not acknowledged', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    await queue.enqueue(makeInput({ recordId: 'r2' }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ acknowledged: [m1.id] }));
    const result = await replayMutations();
    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    const remaining = await queue.dequeue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].retryCount).toBe(1);
  });

  it('should treat network error as all failed', async () => {
    await queue.enqueue(makeInput());
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await replayMutations();
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(await queue.getPendingCount()).toBe(2);
  });

  it('should treat 500 as all failed', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server Error', { status: 500 }));
    const result = await replayMutations();
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
  });

  it('should report authError on 401', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const result = await replayMutations();
    expect(result.authError).toBe(true);
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(await queue.getPendingCount()).toBe(1);
    const pending = await queue.dequeue();
    expect(pending[0].retryCount).toBe(0);
  });

  it('should report authError on 403', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    const result = await replayMutations();
    expect(result.authError).toBe(true);
  });

  it('should broadcast SYNC_FAILED with authError on 401', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    const messages: SwToClientMessage[] = [];
    await replayMutations((msg) => messages.push(msg));
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ type: 'SYNC_FAILED', authError: true });
  });
  it('should handle 429 rate limiting', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '0' } }),
    );
    const result = await replayMutations();
    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.authError).toBe(false);
    expect(await queue.getPendingCount()).toBe(1);
  });

  it('should store conflicts on 409 response', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const conflict = {
      mutationId: m1.id,
      tableName: 'transaction',
      recordId: 'r1',
      clientData: { amount: 1500 },
      serverData: { amount: 2000 },
      resolvedAt: null,
      resolution: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ acknowledged: [], conflicts: [conflict] }, 409),
    );
    const result = await replayMutations();
    expect(result.conflictCount).toBe(1);
    expect(result.authError).toBe(false);
    const conflicts = await getUnresolvedConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].mutationId).toBe(m1.id);
  });

  it('should acknowledge conflict mutations from queue', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const m2 = await queue.enqueue(makeInput({ recordId: 'r2' }));
    const conflict = {
      mutationId: m1.id,
      tableName: 'transaction',
      recordId: 'r1',
      clientData: { amount: 1500 },
      serverData: { amount: 2000 },
      resolvedAt: null,
      resolution: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ acknowledged: [m2.id], conflicts: [conflict] }, 409),
    );
    const result = await replayMutations();
    expect(result.syncedCount).toBe(1);
    expect(result.conflictCount).toBe(1);
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('should include Authorization header when token exists', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('test-jwt-token');
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    await replayMutations();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-jwt-token');
  });

  it('should omit Authorization header when token is null', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    await replayMutations();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('should include apikey header when configured', async () => {
    configureSyncEndpoint({ apiKey: 'test-anon-key' });
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    await replayMutations();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['apikey']).toBe('test-anon-key');
  });

  it('should not include apikey header by default', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    await replayMutations();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['apikey']).toBeUndefined();
  });

  it('should use configured endpoint URL', async () => {
    configureSyncEndpoint({
      baseUrl: 'https://test.supabase.co/functions/v1',
      pushEndpoint: '/sync-push',
    });
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    await replayMutations();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://test.supabase.co/functions/v1/sync-push');
  });

  it('should use default endpoint when not configured', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    await replayMutations();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/api/sync/push');
  });

  it('should reset configuration with resetSyncConfig', () => {
    configureSyncEndpoint({ baseUrl: 'https://custom.example.com' });
    expect(getSyncConfig().baseUrl).toBe('https://custom.example.com');
    resetSyncConfig();
    expect(getSyncConfig().baseUrl).not.toBe('https://custom.example.com');
  });

  it('should broadcast lifecycle messages', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    const messages: SwToClientMessage[] = [];
    await replayMutations((msg) => messages.push(msg));
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: 'SYNC_STARTED' });
    expect(messages[1]).toMatchObject({ type: 'SYNC_COMPLETED' });
  });

  it('should broadcast SYNC_COMPLETED with conflictCount', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1' }));
    const conflict = {
      mutationId: m1.id,
      tableName: 'transaction',
      recordId: 'r1',
      clientData: { amount: 1500 },
      serverData: { amount: 2000 },
      resolvedAt: null,
      resolution: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ acknowledged: [], conflicts: [conflict] }, 409),
    );
    const messages: SwToClientMessage[] = [];
    await replayMutations((msg) => messages.push(msg));
    const completed = messages.find((m) => m.type === 'SYNC_COMPLETED');
    expect(completed).toMatchObject({ type: 'SYNC_COMPLETED', conflictCount: 1 });
  });

  it('should broadcast failures on network error', async () => {
    await queue.enqueue(makeInput());
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network down'));
    const messages: SwToClientMessage[] = [];
    await replayMutations((msg) => messages.push(msg));
    expect(messages[1]).toMatchObject({ type: 'SYNC_COMPLETED', syncedCount: 0, failedCount: 1 });
  });

  it('should send mutations as JSON in request body', async () => {
    const m1 = await queue.enqueue(makeInput({ recordId: 'r1', data: { amount: 42 } }));
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ acknowledged: [m1.id] }));
    await replayMutations();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.mutations).toBeInstanceOf(Array);
    expect(body.mutations).toHaveLength(1);
    expect(body.mutations[0].recordId).toBe('r1');
  });
});
