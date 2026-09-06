// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { EntitlementDisplayCache } from './cache';
import { decodeEntitlement, entitlementDisplay, type EntitlementEnvelope } from './contract';
import {
  canPreflightBankConnection,
  entitlementStatusText,
  PENDING_ENTITLEMENT,
  presentationFromNetwork,
  presentationFromUnavailable,
} from './presentation';
import { createEntitlementRepository } from './repository';

const SERVER_TIME = '2033-05-18T03:33:21Z';
const REFRESH_AFTER = '2033-06-18T03:33:20Z';

function familyEnvelope(
  overrides: Partial<EntitlementEnvelope['entitlement']> = {},
): EntitlementEnvelope {
  return {
    contract_version: 1,
    catalog_version: 1,
    entitlement: {
      scope: 'household',
      tier: 'family',
      user_tier: 'free',
      household_tier: 'family',
      access_state: 'granted',
      lifecycle: null,
      is_premium_sponsor: false,
      is_family_bound: true,
      bank_connections: {
        allowance: 4,
        base_allowance: 4,
        addon_allowance: 0,
      },
      validity: {
        effective_at: '2033-05-18T03:33:20Z',
        refresh_after: REFRESH_AFTER,
        server_time: SERVER_TIME,
        projection_version: 7,
      },
      downgrade: {
        status: 'scheduled',
        effective_at: REFRESH_AFTER,
      },
      ...overrides,
    },
  };
}

describe('minimized entitlement Web adapter', () => {
  it('rejects malformed and server-stale granted responses', () => {
    expect(decodeEntitlement({ contract_version: 1 })).toEqual({
      available: false,
      reason: 'malformed',
    });
    expect(
      decodeEntitlement(
        familyEnvelope({
          validity: {
            effective_at: '2033-05-18T03:33:20Z',
            refresh_after: SERVER_TIME,
            server_time: SERVER_TIME,
            projection_version: 7,
          },
          downgrade: { status: 'scheduled', effective_at: SERVER_TIME },
        }),
      ),
    ).toEqual({ available: false, reason: 'malformed' });
  });

  it('uses refresh_after only to request refresh', () => {
    const mixed = familyEnvelope({
      user_tier: 'plus',
      downgrade: { status: 'undetermined', effective_at: null },
    });
    const afterRefresh = new Date('2033-06-18T03:33:21Z');

    expect(entitlementDisplay(mixed, afterRefresh)).toMatchObject({
      tier: 'family',
      bankConnectionAllowance: 4,
      needsRefresh: true,
      reductionEffective: false,
    });
    expect(presentationFromNetwork(mixed, afterRefresh)).toMatchObject({
      status: 'refresh-needed',
      serverActionPreflight: false,
    });
  });

  it('reduces display only at a server-proven downgrade boundary', () => {
    const before = entitlementDisplay(familyEnvelope(), new Date('2033-06-18T03:33:19Z'));
    const atBoundary = entitlementDisplay(familyEnvelope(), new Date(REFRESH_AFTER));

    expect(before.tier).toBe('family');
    expect(atBoundary).toMatchObject({
      tier: 'free',
      bankConnectionAllowance: 0,
      reductionEffective: true,
    });
  });

  it('models offline-valid and offline-expired cache display without authorizing actions', () => {
    const offlineValid = presentationFromUnavailable(
      'offline',
      familyEnvelope(),
      new Date('2033-05-19T00:00:00Z'),
    );
    expect(offlineValid).toMatchObject({
      status: 'offline-valid',
      displayTier: 'family',
      serverActionPreflight: false,
    });
    expect(
      presentationFromUnavailable('offline', familyEnvelope(), new Date(REFRESH_AFTER)),
    ).toMatchObject({
      status: 'offline-expired',
      displayTier: 'free',
      serverActionPreflight: false,
    });
    expect(canPreflightBankConnection(offlineValid, 0)).toBe(false);
  });

  it('never reuses cache after identity, authorization, or contract failures', () => {
    for (const reason of [
      'unauthenticated',
      'forbidden',
      'invalid_request',
      'malformed',
      'unsupported_contract_version',
      'unsupported_catalog_version',
    ] as const) {
      expect(presentationFromUnavailable(reason, familyEnvelope(), new Date(SERVER_TIME))).toEqual(
        expect.objectContaining({
          status: 'unavailable',
          envelope: null,
          displayTier: 'free',
          serverActionPreflight: false,
        }),
      );
    }
  });

  it('only preflights a cost-incurring request from a fresh network projection', () => {
    const fresh = presentationFromNetwork(familyEnvelope(), new Date('2033-05-19T00:00:00Z'));
    const refreshNeeded = presentationFromNetwork(familyEnvelope(), new Date(REFRESH_AFTER));

    expect(canPreflightBankConnection(fresh, 3)).toBe(true);
    expect(canPreflightBankConnection(fresh, 4)).toBe(false);
    expect(canPreflightBankConnection(refreshNeeded, 0)).toBe(false);
  });

  it('provides understandable text for every accessible presentation state', () => {
    const available = presentationFromNetwork(familyEnvelope(), new Date('2033-05-19T00:00:00Z'));
    const states = [
      PENDING_ENTITLEMENT,
      available,
      presentationFromNetwork(familyEnvelope(), new Date(REFRESH_AFTER)),
      presentationFromUnavailable(
        'projection_unavailable',
        familyEnvelope(),
        new Date(SERVER_TIME),
      ),
      presentationFromUnavailable('offline', familyEnvelope(), new Date(SERVER_TIME)),
      presentationFromUnavailable('offline', familyEnvelope(), new Date(REFRESH_AFTER)),
      presentationFromUnavailable('projection_unavailable', null, new Date(SERVER_TIME)),
    ];

    expect(states.map(entitlementStatusText)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/checking/i),
        expect.stringMatching(/confirmed/i),
        expect.stringMatching(/refresh needed/i),
        expect.stringMatching(/stale/i),
        expect.stringMatching(/offline/i),
        expect.stringMatching(/downgrade/i),
        expect.stringMatching(/unavailable/i),
      ]),
    );
  });
});

describe('entitlement repository', () => {
  it('reads the versioned endpoint with only authenticated scope input', async () => {
    const fetchMock = vi.fn(async () => Response.json(familyEnvelope()));
    const repository = createEntitlementRepository({
      baseUrl: 'https://api.example.test/functions/v1',
      apiKey: 'anon-key-placeholder',
      getAuthToken: async () => 'token-placeholder',
      fetch: fetchMock,
    });

    await expect(repository.load('30000000-0000-4000-8000-000000000002')).resolves.toMatchObject({
      available: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/functions/v1/entitlements-v1?household_id=30000000-0000-4000-8000-000000000002',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-placeholder',
          apikey: 'anon-key-placeholder',
        }),
      }),
    );
  });

  it('fails closed for malformed responses and network failures', async () => {
    const malformed = createEntitlementRepository({
      baseUrl: 'https://api.example.test/functions/v1',
      getAuthToken: async () => 'token-placeholder',
      fetch: async () => Response.json({ contract_version: 1 }),
    });
    const offline = createEntitlementRepository({
      baseUrl: 'https://api.example.test/functions/v1',
      getAuthToken: async () => 'token-placeholder',
      fetch: async () => {
        throw new TypeError('offline');
      },
    });

    await expect(malformed.load()).resolves.toEqual({
      available: false,
      reason: 'malformed',
    });
    await expect(offline.load()).resolves.toEqual({
      available: false,
      reason: 'offline',
    });
  });

  it('allows cache fallback only for transient HTTP failures', async () => {
    const missing = createEntitlementRepository({
      baseUrl: 'https://api.example.test/functions/v1',
      getAuthToken: async () => 'token-placeholder',
      fetch: async () => new Response(null, { status: 404 }),
    });
    const unavailable = createEntitlementRepository({
      baseUrl: 'https://api.example.test/functions/v1',
      getAuthToken: async () => 'token-placeholder',
      fetch: async () => new Response(null, { status: 503 }),
    });

    await expect(missing.load()).resolves.toEqual({
      available: false,
      reason: 'malformed',
    });
    await expect(unavailable.load()).resolves.toEqual({
      available: false,
      reason: 'projection_unavailable',
    });
  });
});

describe('display cache', () => {
  it('is per-user and scope and persists only the minimized envelope', async () => {
    const storage = new MemoryStorage();
    const cache = new EntitlementDisplayCache(storage);
    await cache.write('user-a', 'household-a', familyEnvelope());

    await expect(cache.read('user-a', 'household-a')).resolves.toMatchObject({
      available: true,
    });
    await expect(cache.read('user-b', 'household-a')).resolves.toBeNull();
    await expect(cache.read('user-a', 'household-b')).resolves.toBeNull();

    const persisted = [...storage.values()];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toContain('user-a');
    expect(persisted[0]).not.toContain('household-a');
    expect(persisted[0]).not.toMatch(/checkout|session_id|cached_at|feature/i);
  });

  it('deletes a malformed cached echo instead of using it', async () => {
    const storage = new MemoryStorage();
    const cache = new EntitlementDisplayCache(storage);
    await cache.write('user-a', undefined, familyEnvelope());
    storage.replaceOnlyValue('{"contract_version":1}');

    await expect(cache.read('user-a')).resolves.toEqual({
      available: false,
      reason: 'malformed',
    });
    expect(storage.length).toBe(0);
  });
});

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  values(): string[] {
    return [...this.entries.values()];
  }

  replaceOnlyValue(value: string): void {
    const key = this.entries.keys().next().value as string;
    this.entries.set(key, value);
  }
}
