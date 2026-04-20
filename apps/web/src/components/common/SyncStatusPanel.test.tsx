// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncStatusPanel } from './SyncStatusPanel';
import { useSyncStatus } from '../../hooks/useSyncStatus';

vi.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: vi.fn(),
}));

const mockedUseSyncStatus = vi.mocked(useSyncStatus);

describe('SyncStatusPanel', () => {
  beforeEach(() => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 0,
      lastSyncTime: '2025-01-15T10:30:00Z',
      isSyncing: false,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 0,
    });
  });

  it('renders the status label', () => {
    render(<SyncStatusPanel />);
    expect(screen.getByText('All synced')).toBeInTheDocument();
  });

  it('shows pending count when mutations are queued', () => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 5,
      lastSyncTime: '2025-01-15T10:30:00Z',
      isSyncing: false,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 0,
    });

    render(<SyncStatusPanel />);
    expect(screen.getByText('5 pending')).toBeInTheDocument();
  });

  it('shows syncing state', () => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 3,
      lastSyncTime: null,
      isSyncing: true,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 0,
    });

    render(<SyncStatusPanel />);
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
  });

  it('shows offline state', () => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: false,
      isOffline: true,
      pendingMutations: 2,
      lastSyncTime: null,
      isSyncing: false,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 0,
    });

    render(<SyncStatusPanel />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows auth error state', () => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 1,
      lastSyncTime: null,
      isSyncing: false,
      syncNow: vi.fn(),
      authError: true,
      conflictCount: 0,
    });

    render(<SyncStatusPanel />);
    expect(screen.getByText('Authentication required')).toBeInTheDocument();
  });

  it('expands to show details on click', () => {
    render(<SyncStatusPanel />);

    const header = screen.getByRole('button', { expanded: false });
    fireEvent.click(header);

    expect(screen.getByText('Last sync')).toBeInTheDocument();
    expect(screen.getByText('Pending changes')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('has correct aria-expanded state', () => {
    render(<SyncStatusPanel />);

    const header = screen.getByRole('button', { expanded: false });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows sync now button in expanded state', () => {
    render(<SyncStatusPanel />);

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
  });

  it('calls syncNow when button is clicked', () => {
    const syncNow = vi.fn();
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 3,
      lastSyncTime: null,
      isSyncing: false,
      syncNow,
      authError: false,
      conflictCount: 0,
    });

    render(<SyncStatusPanel />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

    expect(syncNow).toHaveBeenCalledOnce();
  });

  it('disables sync button when offline', () => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: false,
      isOffline: true,
      pendingMutations: 2,
      lastSyncTime: null,
      isSyncing: false,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 0,
    });

    render(<SyncStatusPanel />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled();
  });

  it('shows conflict count when conflicts exist', () => {
    mockedUseSyncStatus.mockReturnValue({
      isOnline: true,
      isOffline: false,
      pendingMutations: 0,
      lastSyncTime: '2025-01-15T10:30:00Z',
      isSyncing: false,
      syncNow: vi.fn(),
      authError: false,
      conflictCount: 3,
    });

    render(<SyncStatusPanel />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText(/3 need resolution/)).toBeInTheDocument();
  });

  it('has accessible region landmark', () => {
    render(<SyncStatusPanel />);
    expect(screen.getByRole('region', { name: /sync status/i })).toBeInTheDocument();
  });
});
