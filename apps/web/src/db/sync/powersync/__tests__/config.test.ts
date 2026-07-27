// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isPowerSyncClientConfigured,
  postgrestBaseUrl,
  resolvePowerSyncClientConfig,
} from '../config';

function stubEnv(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }
}

describe('powersync config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves all four backend coordinates from the environment', () => {
    stubEnv({
      VITE_POWERSYNC_URL: 'https://finance.jrmoulckers.com/sync',
      VITE_SUPABASE_URL: 'https://finance.jrmoulckers.com',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      VITE_POWERSYNC_ENABLED: 'true',
    });

    const config = resolvePowerSyncClientConfig();

    expect(config).toEqual({
      powersyncUrl: 'https://finance.jrmoulckers.com/sync',
      supabaseUrl: 'https://finance.jrmoulckers.com',
      supabaseAnonKey: 'anon-key',
      enabled: true,
    });
  });

  it('treats a missing enabled flag as disabled', () => {
    stubEnv({
      VITE_POWERSYNC_URL: 'https://finance.jrmoulckers.com/sync',
      VITE_SUPABASE_URL: 'https://finance.jrmoulckers.com',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    });

    expect(resolvePowerSyncClientConfig().enabled).toBe(false);
    expect(isPowerSyncClientConfigured()).toBe(false);
  });

  it('is configured only when enabled and all coordinates are present', () => {
    const base = {
      powersyncUrl: 'https://finance.jrmoulckers.com/sync',
      supabaseUrl: 'https://finance.jrmoulckers.com',
      supabaseAnonKey: 'anon-key',
      enabled: true,
    };

    expect(isPowerSyncClientConfigured(base)).toBe(true);
    expect(isPowerSyncClientConfigured({ ...base, enabled: false })).toBe(false);
    expect(isPowerSyncClientConfigured({ ...base, powersyncUrl: '' })).toBe(false);
    expect(isPowerSyncClientConfigured({ ...base, supabaseUrl: '' })).toBe(false);
    expect(isPowerSyncClientConfigured({ ...base, supabaseAnonKey: '' })).toBe(false);
  });

  it('builds the PostgREST base URL, tolerating a trailing slash', () => {
    expect(
      postgrestBaseUrl({
        powersyncUrl: '',
        supabaseUrl: 'https://finance.jrmoulckers.com',
        supabaseAnonKey: '',
        enabled: true,
      }),
    ).toBe('https://finance.jrmoulckers.com/rest/v1');

    expect(
      postgrestBaseUrl({
        powersyncUrl: '',
        supabaseUrl: 'https://finance.jrmoulckers.com/',
        supabaseAnonKey: '',
        enabled: true,
      }),
    ).toBe('https://finance.jrmoulckers.com/rest/v1');
  });
});
