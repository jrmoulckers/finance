// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseEdgeTransport, resolveEdgeFunctionsBaseUrl } from '../aggregator-transport';

vi.mock('../../../auth/token-storage', () => ({
  getAccessToken: vi.fn(async () => 'stored-token'),
}));

import { getAccessToken } from '../../../auth/token-storage';

describe('resolveEdgeFunctionsBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers an explicit functions URL and strips trailing slashes', () => {
    vi.stubEnv('VITE_SUPABASE_FUNCTIONS_URL', 'https://fn.example.com/functions/v1/');
    expect(resolveEdgeFunctionsBaseUrl()).toBe('https://fn.example.com/functions/v1');
  });

  it('derives the functions URL from the Supabase project URL', () => {
    vi.stubEnv('VITE_SUPABASE_FUNCTIONS_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co/');
    expect(resolveEdgeFunctionsBaseUrl()).toBe('https://proj.supabase.co/functions/v1');
  });

  it('returns an empty string when nothing is configured', () => {
    vi.stubEnv('VITE_SUPABASE_FUNCTIONS_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(resolveEdgeFunctionsBaseUrl()).toBe('');
  });
});

describe('createSupabaseEdgeTransport', () => {
  it('uses the resolved base URL by default', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    const transport = createSupabaseEdgeTransport();
    expect(transport.baseUrl).toBe('https://proj.supabase.co/functions/v1');
    vi.unstubAllEnvs();
  });

  it('resolves the bearer token from the shared token store', async () => {
    const transport = createSupabaseEdgeTransport({ baseUrl: 'https://x/functions/v1' });
    await expect(transport.getAuthToken()).resolves.toBe('stored-token');
    expect(getAccessToken).toHaveBeenCalled();
  });

  it('returns an empty token when the store has none', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null);
    const transport = createSupabaseEdgeTransport({ baseUrl: 'https://x/functions/v1' });
    await expect(transport.getAuthToken()).resolves.toBe('');
  });

  it('honours explicit overrides for fetch and token', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}'));
    const transport = createSupabaseEdgeTransport({
      baseUrl: 'https://override/functions/v1',
      fetch: fetchSpy,
      getAuthToken: async () => 'explicit',
    });
    expect(transport.baseUrl).toBe('https://override/functions/v1');
    await expect(transport.getAuthToken()).resolves.toBe('explicit');
    await transport.fetch('https://override/functions/v1/ping');
    expect(fetchSpy).toHaveBeenCalledWith('https://override/functions/v1/ping');
  });
});
