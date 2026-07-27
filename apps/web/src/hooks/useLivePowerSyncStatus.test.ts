// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLivePowerSyncStatus } from './useLivePowerSyncStatus';
import { resetLivePowerSyncStatus, setLivePowerSyncStatus } from '../db/sync/powersync/live-status';

describe('useLivePowerSyncStatus', () => {
  afterEach(() => {
    resetLivePowerSyncStatus();
  });

  it('returns the disconnected default initially', () => {
    const { result } = renderHook(() => useLivePowerSyncStatus());

    expect(result.current.connected).toBe(false);
    expect(result.current.syncing).toBe(false);
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('re-renders when the live status changes', () => {
    const { result } = renderHook(() => useLivePowerSyncStatus());

    act(() => {
      setLivePowerSyncStatus({
        connected: true,
        connecting: false,
        syncing: false,
        hasSynced: true,
        hasError: false,
        lastSyncedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.hasSynced).toBe(true);
    expect(result.current.lastSyncedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
