// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncStatus } from '@powersync/common';

import { getLivePowerSyncStatusSnapshot, resetLivePowerSyncStatus } from '../live-status';

// A hoisted fake `@powersync/web` so the bridge can be exercised without the
// real wa-sqlite worker. `vi.hoisted` keeps these definitions available to the
// hoisted `vi.mock` factory below.
const fake = vi.hoisted(() => {
  const connect = vi.fn(async () => {});
  const disconnect = vi.fn(async () => {});
  const close = vi.fn(async () => {});
  const dispose = vi.fn();
  const state: {
    statusChanged: ((status: SyncStatus) => void) | null;
    currentStatus: SyncStatus | null;
  } = { statusChanged: null, currentStatus: null };

  class FakePowerSyncDatabase {
    connect = connect;
    disconnect = disconnect;
    close = close;
    registerListener(listener: { statusChanged?: (status: SyncStatus) => void }): () => void {
      state.statusChanged = listener.statusChanged ?? null;
      return dispose;
    }
    get currentStatus(): SyncStatus | null {
      return state.currentStatus;
    }
  }

  return { connect, disconnect, close, dispose, state, FakePowerSyncDatabase };
});

vi.mock('@powersync/web', () => ({ PowerSyncDatabase: fake.FakePowerSyncDatabase }));
vi.mock('../connector', () => ({
  SupabaseConnector: class {
    constructor(_config: unknown) {}
  },
}));
vi.mock('../schema', () => ({ AppSchema: { tables: [] } }));

import { closePowerSync, connectPowerSync, disconnectPowerSync } from '../database';

function syncStatus(overrides: Partial<Record<keyof SyncStatus, unknown>> = {}): SyncStatus {
  return {
    connected: false,
    connecting: false,
    downloading: false,
    uploading: false,
    downloadError: undefined,
    uploadError: undefined,
    hasSynced: false,
    lastSyncedAt: undefined,
    ...overrides,
  } as unknown as SyncStatus;
}

describe('connectPowerSync live-status bridge', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_POWERSYNC_ENABLED', 'true');
    vi.stubEnv('VITE_POWERSYNC_URL', 'https://finance.jrmoulckers.com/sync');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://finance.jrmoulckers.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    fake.connect.mockClear();
    fake.disconnect.mockClear();
    fake.close.mockClear();
    fake.dispose.mockClear();
    fake.state.statusChanged = null;
    fake.state.currentStatus = syncStatus();
    resetLivePowerSyncStatus();
  });

  afterEach(async () => {
    // Clear the module-level database singleton between tests.
    await closePowerSync();
    vi.unstubAllEnvs();
    resetLivePowerSyncStatus();
  });

  it('seeds the live-status store from currentStatus on connect', async () => {
    fake.state.currentStatus = syncStatus({
      connected: true,
      hasSynced: true,
      lastSyncedAt: new Date('2026-02-02T03:04:05.000Z'),
    });

    await connectPowerSync();

    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(getLivePowerSyncStatusSnapshot()).toEqual({
      connected: true,
      connecting: false,
      syncing: false,
      hasSynced: true,
      hasError: false,
      lastSyncedAt: '2026-02-02T03:04:05.000Z',
    });
  });

  it('updates the store when the runtime status changes', async () => {
    await connectPowerSync();
    expect(fake.state.statusChanged).toBeTypeOf('function');

    fake.state.statusChanged?.(
      syncStatus({ connected: true, downloading: true, hasSynced: false }),
    );

    expect(getLivePowerSyncStatusSnapshot()).toMatchObject({
      connected: true,
      syncing: true,
      hasSynced: false,
    });
  });

  it('maps upload/download errors to hasError', async () => {
    await connectPowerSync();

    fake.state.statusChanged?.(syncStatus({ connected: false, uploadError: new Error('boom') }));

    expect(getLivePowerSyncStatusSnapshot().hasError).toBe(true);
  });

  it('disposes the listener and resets the store on disconnect', async () => {
    fake.state.currentStatus = syncStatus({ connected: true, hasSynced: true });
    await connectPowerSync();

    await disconnectPowerSync();

    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(getLivePowerSyncStatusSnapshot()).toEqual({
      connected: false,
      connecting: false,
      syncing: false,
      hasSynced: false,
      hasError: false,
      lastSyncedAt: null,
    });
  });

  it('does nothing when the feature flag is disabled', async () => {
    vi.stubEnv('VITE_POWERSYNC_ENABLED', 'false');

    const result = await connectPowerSync();

    expect(result).toBeNull();
    expect(fake.connect).not.toHaveBeenCalled();
    expect(getLivePowerSyncStatusSnapshot().connected).toBe(false);
  });
});
