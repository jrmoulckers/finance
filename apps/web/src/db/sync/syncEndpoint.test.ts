// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveSyncEndpointConfig, initSyncEndpoint, resetSyncEndpointInit } from './syncEndpoint';
import { resetSyncConfig } from './replayMutations';

// Mock import.meta.env
const mockEnv: Record<string, string> = {};

vi.stubGlobal('import', {
  meta: {
    env: new Proxy(mockEnv, {
      get: (_target, prop) => mockEnv[prop as string],
    }),
  },
});

describe('syncEndpoint', () => {
  beforeEach(() => {
    // Clear all env vars
    for (const key of Object.keys(mockEnv)) {
      delete mockEnv[key];
    }
    resetSyncEndpointInit();
    resetSyncConfig();
  });

  describe('resolveSyncEndpointConfig', () => {
    it('returns default endpoints when no env vars are set', () => {
      const config = resolveSyncEndpointConfig();

      expect(config.pushEndpoint).toBe('/api/sync/push');
      expect(config.pullEndpoint).toBe('/api/sync/pull');
      expect(config.healthEndpoint).toBe('/api/sync/health');
      expect(config.timeout).toBe(30_000);
      expect(config.apiKey).toBeUndefined();
    });

    it('includes baseUrl from location origin', () => {
      const config = resolveSyncEndpointConfig();

      // In test env, self.location.origin will be the test server origin
      expect(typeof config.baseUrl).toBe('string');
    });

    it('returns numeric timeout defaulting to 30000', () => {
      const config = resolveSyncEndpointConfig();

      expect(config.timeout).toBe(30_000);
    });
  });

  describe('initSyncEndpoint', () => {
    it('initializes sync endpoint configuration', () => {
      const config = initSyncEndpoint();

      expect(config).toBeDefined();
      expect(config.pushEndpoint).toBe('/api/sync/push');
    });

    it('is idempotent by default', () => {
      const first = initSyncEndpoint();
      const second = initSyncEndpoint();

      expect(first.pushEndpoint).toBe(second.pushEndpoint);
    });

    it('can be forced to re-initialize', () => {
      initSyncEndpoint();
      const config = initSyncEndpoint(true);

      expect(config).toBeDefined();
      expect(config.pushEndpoint).toBe('/api/sync/push');
    });
  });

  describe('resetSyncEndpointInit', () => {
    it('allows re-initialization after reset', () => {
      initSyncEndpoint();
      resetSyncEndpointInit();
      const config = initSyncEndpoint();

      expect(config).toBeDefined();
    });
  });
});
