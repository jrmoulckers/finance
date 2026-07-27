// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const liveStatusMock = {
  connected: false,
  connecting: false,
  syncing: false,
  hasSynced: false,
  hasError: false,
  lastSyncedAt: null as string | null,
};

const syncStatusMock = {
  isOnline: true,
  isOffline: false,
  pendingMutations: 0,
  lastSyncTime: null as string | null,
  isSyncing: false,
  syncNow: vi.fn(),
  authError: false,
  conflictCount: 0,
};

vi.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => syncStatusMock,
}));

vi.mock('../../hooks/useLivePowerSyncStatus', () => ({
  useLivePowerSyncStatus: () => liveStatusMock,
}));

vi.mock('../../db/sync/powersync/database', () => ({
  isPowerSyncEnabled: () => true,
}));

vi.mock('../../db/sync/sync-conflict', () => ({
  getUnresolvedConflicts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../styles/sync-status.css', () => ({}));

import { SyncStatusBar } from './SyncStatusBar';

function resetLive(): void {
  liveStatusMock.connected = false;
  liveStatusMock.connecting = false;
  liveStatusMock.syncing = false;
  liveStatusMock.hasSynced = false;
  liveStatusMock.hasError = false;
  liveStatusMock.lastSyncedAt = null;
}

describe('SyncStatusBar (live PowerSync active)', () => {
  beforeEach(() => {
    resetLive();
    syncStatusMock.isOnline = true;
    syncStatusMock.isOffline = false;
    syncStatusMock.pendingMutations = 0;
    syncStatusMock.isSyncing = false;
  });

  it('shows "All synced" when the live client is connected', () => {
    liveStatusMock.connected = true;
    liveStatusMock.hasSynced = true;

    render(<SyncStatusBar />);

    expect(screen.getByRole('status')).toHaveClass('sync-status-bar--synced');
    expect(screen.getByText('All synced')).toBeInTheDocument();
  });

  it('shows "Syncing…" when the live client is downloading or uploading', () => {
    liveStatusMock.syncing = true;

    render(<SyncStatusBar />);

    expect(screen.getByRole('status')).toHaveClass('sync-status-bar--syncing');
    expect(screen.getByText('Syncing\u2026')).toBeInTheDocument();
  });

  it('shows "Syncing…" while the live client is connecting', () => {
    liveStatusMock.connecting = true;

    render(<SyncStatusBar />);

    expect(screen.getByRole('status')).toHaveClass('sync-status-bar--syncing');
  });

  it('shows offline when the browser is offline, regardless of live status', () => {
    syncStatusMock.isOffline = true;
    liveStatusMock.connected = true;

    render(<SyncStatusBar />);

    expect(screen.getByRole('status')).toHaveClass('sync-status-bar--offline');
  });

  it('shows an error when the live client reports an error while disconnected', () => {
    liveStatusMock.hasError = true;

    render(<SyncStatusBar />);

    expect(screen.getByRole('status')).toHaveClass('sync-status-bar--error');
  });

  it('lets live status override local pending mutations', () => {
    syncStatusMock.pendingMutations = 5;
    liveStatusMock.connected = true;
    liveStatusMock.hasSynced = true;

    render(<SyncStatusBar />);

    expect(screen.queryByText('5 pending changes')).not.toBeInTheDocument();
    expect(screen.getByText('All synced')).toBeInTheDocument();
  });
});
