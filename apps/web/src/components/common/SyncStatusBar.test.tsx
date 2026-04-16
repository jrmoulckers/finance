// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../db/sync/sync-conflict', () => ({
  getUnresolvedConflicts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../styles/sync-status.css', () => ({}));

import { SyncStatusBar } from './SyncStatusBar';
import { getUnresolvedConflicts } from '../../db/sync/sync-conflict';

describe('SyncStatusBar', () => {
  beforeEach(() => {
    syncStatusMock.isOnline = true;
    syncStatusMock.isOffline = false;
    syncStatusMock.pendingMutations = 0;
    syncStatusMock.lastSyncTime = null;
    syncStatusMock.isSyncing = false;
    syncStatusMock.syncNow.mockClear();
    syncStatusMock.authError = false;
    syncStatusMock.conflictCount = 0;
    vi.mocked(getUnresolvedConflicts).mockResolvedValue([]);
  });

  it('shows "All synced" when fully synced', () => {
    render(<SyncStatusBar />);

    expect(screen.getByText('All synced')).toBeInTheDocument();
  });

  it('shows pending changes count with Sync now button', () => {
    syncStatusMock.pendingMutations = 3;

    render(<SyncStatusBar />);

    expect(screen.getByText('3 pending changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync pending changes now' })).toBeInTheDocument();
  });

  it('shows singular "pending change" for 1 mutation', () => {
    syncStatusMock.pendingMutations = 1;

    render(<SyncStatusBar />);

    expect(screen.getByText('1 pending change')).toBeInTheDocument();
  });

  it('calls syncNow when the Sync now button is clicked', () => {
    syncStatusMock.pendingMutations = 2;

    render(<SyncStatusBar />);

    fireEvent.click(screen.getByRole('button', { name: 'Sync pending changes now' }));

    expect(syncStatusMock.syncNow).toHaveBeenCalledTimes(1);
  });

  it('shows "Syncing…" with a spinner when syncing', () => {
    syncStatusMock.isSyncing = true;

    const { container } = render(<SyncStatusBar />);

    expect(screen.getByText('Syncing\u2026')).toBeInTheDocument();

    // The spinner has a specific CSS class
    const spinner = container.querySelector('.sync-status-bar__spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('shows "Offline — changes saved locally" when offline', () => {
    syncStatusMock.isOnline = false;
    syncStatusMock.isOffline = true;

    render(<SyncStatusBar />);

    expect(screen.getByText('Offline \u2014 changes saved locally')).toBeInTheDocument();
  });

  it('shows conflict count when conflicts exist', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue([{ id: '1' }, { id: '2' }] as never[]);

    render(<SyncStatusBar />);

    // Wait for async conflict check to resolve
    await vi.waitFor(() => {
      expect(screen.getByText('2 conflicts need attention')).toBeInTheDocument();
    });
  });

  it('shows singular "conflict" for 1 conflict', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue([{ id: '1' }] as never[]);

    render(<SyncStatusBar />);

    await vi.waitFor(() => {
      expect(screen.getByText('1 conflict need attention')).toBeInTheDocument();
    });
  });

  it('has a polite live region for screen reader announcements', () => {
    render(<SyncStatusBar />);

    const statusBar = screen.getByRole('status');
    expect(statusBar).toHaveAttribute('aria-live', 'polite');
    expect(statusBar).toHaveAttribute('aria-atomic', 'true');
  });

  it('applies the correct variant CSS class for synced state', () => {
    render(<SyncStatusBar />);

    const statusBar = screen.getByRole('status');
    expect(statusBar).toHaveClass('sync-status-bar--synced');
  });

  it('applies the correct variant CSS class for offline state', () => {
    syncStatusMock.isOnline = false;
    syncStatusMock.isOffline = true;

    render(<SyncStatusBar />);

    const statusBar = screen.getByRole('status');
    expect(statusBar).toHaveClass('sync-status-bar--offline');
  });

  it('applies the correct variant CSS class for syncing state', () => {
    syncStatusMock.isSyncing = true;

    render(<SyncStatusBar />);

    const statusBar = screen.getByRole('status');
    expect(statusBar).toHaveClass('sync-status-bar--syncing');
  });
});
