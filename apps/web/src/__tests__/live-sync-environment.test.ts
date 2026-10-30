// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localSyncEnvironment } from '../../e2e-sync/environment';

afterEach(() => vi.unstubAllEnvs());

describe('real sync proof environment safety', () => {
  it('uses loopback defaults and requires explicit public configuration', () => {
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', undefined);
    vi.stubEnv('LOCAL_SYNC_POWERSYNC_URL', undefined);
    vi.stubEnv('LOCAL_SYNC_ANON_KEY', undefined);
    expect(localSyncEnvironment()).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      powerSyncUrl: 'http://127.0.0.1:8080',
      anonKey: '',
    });
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('accepts explicit loopback %s', (hostname) => {
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', `http://${hostname}:54321/`);
    vi.stubEnv('LOCAL_SYNC_POWERSYNC_URL', `http://${hostname}:8080/`);
    expect(localSyncEnvironment().supabaseUrl).toBe(`http://${hostname}:54321`);
    expect(localSyncEnvironment().powerSyncUrl).toBe(`http://${hostname}:8080`);
  });

  it.each([
    'https://example.com',
    'http://example.com',
    'http://localhost.example.com',
    'http://127.0.0.1@remote.example.com',
    'http://localhost:54321/path',
    'http://localhost:54321/?key=value',
    'http://localhost:54321/#fragment',
    'file:///local',
  ])('rejects nonlocal or credential-bearing coordinates: %s', (url) => {
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', url);
    expect(() => localSyncEnvironment()).toThrow();
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('LOCAL_SYNC_POWERSYNC_URL', url);
    expect(() => localSyncEnvironment()).toThrow();
  });

  it('rejects loopback URLs containing userinfo', () => {
    const url = new URL('http://localhost:54321');
    url.username = 'synthetic-user';
    url.password = 'synthetic-password';
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', url.toString());
    expect(() => localSyncEnvironment()).toThrow();
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('LOCAL_SYNC_POWERSYNC_URL', url.toString());
    expect(() => localSyncEnvironment()).toThrow();
  });
});
