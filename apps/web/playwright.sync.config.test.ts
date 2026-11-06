// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('real replication proof configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('LOCAL_SYNC_SUPABASE_URL', 'http://127.0.0.1:55431');
    vi.stubEnv('LOCAL_SYNC_POWERSYNC_URL', 'http://127.0.0.1:55440');
    vi.stubEnv('LOCAL_SYNC_ANON_KEY', 'synthetic-public-anon-key');
    vi.stubEnv('CI', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('budgets ten minutes for production startup', async () => {
    const { default: config } = await import('./playwright.sync.config');
    const server = config.webServer;
    if (!server || Array.isArray(server)) throw new Error('One real preview server is required.');

    expect(server.timeout).toBe(600_000);
    expect(server.reuseExistingServer).toBe(false);
  });

  it('preserves the original scenario and assertion limits without retries', async () => {
    const { default: config } = await import('./playwright.sync.config');

    expect(config.timeout).toBe(240_000);
    expect(config.expect?.timeout).toBe(30_000);
    expect(config.retries).toBe(0);
  });

  it('disables the refresh mock only in the real preview child', async () => {
    const { default: config } = await import('./playwright.sync.config');
    const server = config.webServer;
    if (!server || Array.isArray(server)) throw new Error('One real preview server is required.');

    expect(server.env?.CI).toBe('false');
    expect(process.env.CI).toBe('true');
  });
});
