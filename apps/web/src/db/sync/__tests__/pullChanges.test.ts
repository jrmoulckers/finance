// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for pullChanges — server-to-client sync.
 *
 * References: issue #535
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pullChanges,
  getPullCursor,
  setPullCursor,
  resetPullCursor,
  type PullChange,
  type PullResponse,
} from '../pullChanges';
import { configureSyncEndpoint, resetSyncConfig } from '../replayMutations';

// Mock auth module
vi.mock('../../../auth/token-storage', () => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

import { getAccessToken } from '../../../auth/token-storage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePullResponse(overrides: Partial<PullResponse> = {}): PullResponse {
  return {
    changes: [],
    cursor: 'cursor-abc',
    hasMore: false,
    ...overrides,
  };
}

function makeChange(overrides: Partial<PullChange> = {}): PullChange {
  return {
    tableName: 'transaction',
    recordId: 'r1',
    operation: 'INSERT',
    data: { amount: 1500 },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('pullChanges', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(getAccessToken).mockResolvedValue(null);
    resetSyncConfig();
    resetPullCursor();

    // Ensure navigator.onLine is true for tests
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPullCursor();
  });

  it('should return empty result when no changes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePullResponse()));

    const result = await pullChanges();
    expect(result.appliedCount).toBe(0);
    expect(result.authError).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.error).toBeNull();
  });

  it('should apply changes when callback provided', async () => {
    const changes = [makeChange({ recordId: 'r1' }), makeChange({ recordId: 'r2' })];
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(makePullResponse({ changes, cursor: 'new-cursor' })),
    );

    const appliedChanges: PullChange[] = [];
    const result = await pullChanges(async (batch) => {
      appliedChanges.push(...batch);
    });

    expect(result.appliedCount).toBe(2);
    expect(appliedChanges).toHaveLength(2);
    expect(appliedChanges[0].recordId).toBe('r1');
  });

  it('should persist cursor after successful pull', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(makePullResponse({ cursor: 'new-cursor-123' })),
    );

    await pullChanges();
    expect(getPullCursor()).toBe('new-cursor-123');
  });

  it('should send current cursor in request', async () => {
    setPullCursor('existing-cursor');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePullResponse()));

    await pullChanges();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.cursor).toBe('existing-cursor');
  });

  it('should return authError on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const result = await pullChanges();
    expect(result.authError).toBe(true);
    expect(result.appliedCount).toBe(0);
  });

  it('should return authError on 403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

    const result = await pullChanges();
    expect(result.authError).toBe(true);
  });

  it('should return error on 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    const result = await pullChanges();
    expect(result.error).toContain('500');
    expect(result.appliedCount).toBe(0);
  });

  it('should return error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await pullChanges();
    expect(result.error).toContain('Failed to fetch');
    expect(result.appliedCount).toBe(0);
  });

  it('should skip when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    const result = await pullChanges();
    expect(result.skipped).toBe(true);
    expect(result.appliedCount).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should include auth header when token exists', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('test-jwt-token');
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePullResponse()));

    await pullChanges();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-jwt-token');
  });

  it('should include apikey header when configured', async () => {
    configureSyncEndpoint({ apiKey: 'anon-key-123' });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePullResponse()));

    await pullChanges();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['apikey']).toBe('anon-key-123');
  });

  it('should use configured endpoint URL', async () => {
    configureSyncEndpoint({
      baseUrl: 'https://test.supabase.co/functions/v1',
      pushEndpoint: '/sync-push',
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePullResponse()));

    await pullChanges();

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://test.supabase.co/functions/v1/sync-pull');
  });
});

describe('cursor management', () => {
  afterEach(() => {
    resetPullCursor();
  });

  it('should return null when no cursor set', () => {
    expect(getPullCursor()).toBeNull();
  });

  it('should persist and retrieve cursor', () => {
    setPullCursor('cursor-xyz');
    expect(getPullCursor()).toBe('cursor-xyz');
  });

  it('should clear cursor on reset', () => {
    setPullCursor('cursor-xyz');
    resetPullCursor();
    expect(getPullCursor()).toBeNull();
  });
});
