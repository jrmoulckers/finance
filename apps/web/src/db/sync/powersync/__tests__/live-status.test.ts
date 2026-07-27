// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLivePowerSyncStatusSnapshot,
  resetLivePowerSyncStatus,
  setLivePowerSyncStatus,
  subscribeLivePowerSyncStatus,
  type LivePowerSyncStatus,
} from '../live-status';

const DISCONNECTED: LivePowerSyncStatus = {
  connected: false,
  connecting: false,
  syncing: false,
  hasSynced: false,
  hasError: false,
  lastSyncedAt: null,
};

const CONNECTED: LivePowerSyncStatus = {
  connected: true,
  connecting: false,
  syncing: false,
  hasSynced: true,
  hasError: false,
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
};

describe('live PowerSync status store', () => {
  afterEach(() => {
    resetLivePowerSyncStatus();
  });

  it('starts at the disconnected default', () => {
    expect(getLivePowerSyncStatusSnapshot()).toEqual(DISCONNECTED);
  });

  it('publishes a new snapshot and notifies subscribers on change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLivePowerSyncStatus(listener);

    setLivePowerSyncStatus(CONNECTED);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLivePowerSyncStatusSnapshot()).toEqual(CONNECTED);

    unsubscribe();
  });

  it('keeps a stable snapshot reference and skips notifying when unchanged', () => {
    setLivePowerSyncStatus(CONNECTED);
    const first = getLivePowerSyncStatusSnapshot();

    const listener = vi.fn();
    const unsubscribe = subscribeLivePowerSyncStatus(listener);

    // A value-equal update must not produce a new reference or a notification.
    setLivePowerSyncStatus({ ...CONNECTED });

    expect(listener).not.toHaveBeenCalled();
    expect(getLivePowerSyncStatusSnapshot()).toBe(first);

    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLivePowerSyncStatus(listener);
    unsubscribe();

    setLivePowerSyncStatus(CONNECTED);

    expect(listener).not.toHaveBeenCalled();
  });

  it('reset returns to the disconnected default', () => {
    setLivePowerSyncStatus(CONNECTED);
    resetLivePowerSyncStatus();

    expect(getLivePowerSyncStatusSnapshot()).toEqual(DISCONNECTED);
  });
});
