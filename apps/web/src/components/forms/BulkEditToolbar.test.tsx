// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkEditToolbar } from './BulkEditToolbar';
import type { BulkEditToolbarProps } from './BulkEditToolbar';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const defaultCategories = [
  {
    id: 'cat-1',
    householdId: 'h1',
    name: 'Food',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
  },
  {
    id: 'cat-2',
    householdId: 'h1',
    name: 'Transport',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 2,
    ...syncMetadata,
  },
];

function renderToolbar(overrides: Partial<BulkEditToolbarProps> = {}) {
  const defaultProps: BulkEditToolbarProps = {
    selectionCount: 3,
    totalCount: 10,
    categories: defaultCategories,
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onBulkUpdate: vi.fn().mockReturnValue({ successCount: 3, failureCount: 0, errors: [] }),
    onBulkDelete: vi.fn().mockReturnValue({ successCount: 3, failureCount: 0, errors: [] }),
    ...overrides,
  };

  return render(<BulkEditToolbar {...defaultProps} />);
}

describe('BulkEditToolbar', () => {
  it('renders nothing when selectionCount is 0', () => {
    const { container } = renderToolbar({ selectionCount: 0 });
    expect(container.firstChild).toBeNull();
  });

  it('renders the toolbar with selection count', () => {
    renderToolbar();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('has toolbar role with accessible label', () => {
    renderToolbar();
    expect(screen.getByRole('toolbar', { name: /bulk edit/i })).toBeInTheDocument();
  });

  it('shows Select All button when not all selected', () => {
    renderToolbar({ selectionCount: 3, totalCount: 10 });
    expect(screen.getByRole('button', { name: /select all/i })).toBeInTheDocument();
  });

  it('shows Deselect All button when all selected', () => {
    renderToolbar({ selectionCount: 10, totalCount: 10 });
    expect(screen.getByRole('button', { name: /deselect all/i })).toBeInTheDocument();
  });

  it('calls onSelectAll when Select All is clicked', () => {
    const onSelectAll = vi.fn();
    renderToolbar({ onSelectAll, selectionCount: 3, totalCount: 10 });
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    expect(onSelectAll).toHaveBeenCalledOnce();
  });

  it('calls onClearSelection when cancel is clicked', () => {
    const onClearSelection = vi.fn();
    renderToolbar({ onClearSelection });
    fireEvent.click(screen.getByRole('button', { name: /cancel bulk selection/i }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it('opens category picker on click', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /change category/i }));
    expect(screen.getByRole('listbox', { name: /select category/i })).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
  });

  it('calls onBulkUpdate with category when selected', () => {
    const onBulkUpdate = vi.fn().mockReturnValue({ successCount: 3, failureCount: 0, errors: [] });
    renderToolbar({ onBulkUpdate });
    fireEvent.click(screen.getByRole('button', { name: /change category/i }));
    fireEvent.click(screen.getByText('Food'));
    expect(onBulkUpdate).toHaveBeenCalledWith({ categoryId: 'cat-1' });
  });

  it('shows delete confirmation on delete click', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /delete 3 selected/i }));
    expect(screen.getByText(/Delete 3 transactions\?/)).toBeInTheDocument();
  });

  it('calls onBulkDelete on confirm', () => {
    const onBulkDelete = vi.fn().mockReturnValue({ successCount: 3, failureCount: 0, errors: [] });
    renderToolbar({ onBulkDelete });
    fireEvent.click(screen.getByRole('button', { name: /delete 3 selected/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(onBulkDelete).toHaveBeenCalledOnce();
  });

  it('shows success toast after bulk operation', () => {
    const onBulkUpdate = vi.fn().mockReturnValue({ successCount: 3, failureCount: 0, errors: [] });
    renderToolbar({ onBulkUpdate });
    fireEvent.click(screen.getByRole('button', { name: /change category/i }));
    fireEvent.click(screen.getByText('Food'));
    expect(screen.getByRole('status')).toHaveTextContent('Updated category for 3 transactions');
  });

  it('shows failure count in toast when some fail', () => {
    const onBulkUpdate = vi
      .fn()
      .mockReturnValue({ successCount: 2, failureCount: 1, errors: ['err'] });
    renderToolbar({ onBulkUpdate });
    fireEvent.click(screen.getByRole('button', { name: /change category/i }));
    fireEvent.click(screen.getByText('Food'));
    expect(screen.getByRole('status')).toHaveTextContent('1 failed');
  });

  it('has Uncategorized option in category picker', () => {
    renderToolbar();
    fireEvent.click(screen.getByRole('button', { name: /change category/i }));
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });
});
