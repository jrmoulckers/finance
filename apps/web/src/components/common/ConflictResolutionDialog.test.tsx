// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ConflictResolutionDialog.
 *
 * References: issue #627
 */

import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock the sync module before importing the component
vi.mock('../../db/sync', () => ({
  getUnresolvedConflicts: vi.fn().mockResolvedValue([]),
  resolveConflict: vi.fn().mockResolvedValue(undefined),
}));

import { ConflictResolutionDialog } from './ConflictResolutionDialog';
import { getUnresolvedConflicts, resolveConflict } from '../../db/sync';

const mockConflicts = [
  {
    mutationId: 'conflict-1',
    tableName: 'transaction',
    recordId: 'txn-123',
    clientData: { amount: 1500, payee: 'Grocery' },
    serverData: { amount: 2000, payee: 'Grocery Store' },
    resolvedAt: null,
    resolution: null,
  },
  {
    mutationId: 'conflict-2',
    tableName: 'account',
    recordId: 'acc-456',
    clientData: { name: 'Checking' },
    serverData: { name: 'Main Checking' },
    resolvedAt: null,
    resolution: null,
  },
];

describe('ConflictResolutionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue([]);
    const { container } = render(<ConflictResolutionDialog isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render dialog when open with conflicts', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue(mockConflicts);

    render(<ConflictResolutionDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Sync Conflict')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('should display conflict data', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue(mockConflicts);

    render(<ConflictResolutionDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/transaction/)).toBeInTheDocument();
    });

    expect(screen.getByText(/txn-123/)).toBeInTheDocument();
  });

  it('should have Keep Mine and Accept Server buttons', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue(mockConflicts);

    render(<ConflictResolutionDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Keep Mine')).toBeInTheDocument();
    });

    expect(screen.getByText('Accept Server')).toBeInTheDocument();
  });

  it('should call resolveConflict when Keep Mine is clicked', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue([mockConflicts[0]]);
    vi.mocked(resolveConflict).mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<ConflictResolutionDialog isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Keep Mine')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Keep Mine'));

    await waitFor(() => {
      expect(resolveConflict).toHaveBeenCalledWith('conflict-1', 'client');
    });
  });

  it('should call resolveConflict when Accept Server is clicked', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue([mockConflicts[0]]);
    vi.mocked(resolveConflict).mockResolvedValue(undefined);

    render(<ConflictResolutionDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Accept Server')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Accept Server'));

    await waitFor(() => {
      expect(resolveConflict).toHaveBeenCalledWith('conflict-1', 'server');
    });
  });

  it('should close dialog on Escape key', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue(mockConflicts);
    const onClose = vi.fn();

    render(<ConflictResolutionDialog isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should have proper ARIA attributes', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue(mockConflicts);

    render(<ConflictResolutionDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', expect.stringContaining('conflict'));
    });
  });

  it('should have accessible button labels', async () => {
    vi.mocked(getUnresolvedConflicts).mockResolvedValue(mockConflicts);

    render(<ConflictResolutionDialog isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Keep your local version')).toBeInTheDocument();
      expect(screen.getByLabelText('Accept server version')).toBeInTheDocument();
      expect(screen.getByLabelText('Close conflict resolution')).toBeInTheDocument();
    });
  });
});
