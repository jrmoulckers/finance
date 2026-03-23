// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/aria', () => ({
  announce: vi.fn(),
  useFocusTrap: vi.fn(),
}));

import { BulkActionsToolbar, type BulkActionsToolbarProps } from './BulkActionsToolbar';

const defaultCategories = [
  {
    id: 'cat-food',
    householdId: 'h-1',
    name: 'Food',
    icon: 'utensils',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
  {
    id: 'cat-transport',
    householdId: 'h-1',
    name: 'Transport',
    icon: 'car',
    color: '#2563EB',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 2,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
];

function renderToolbar(overrides: Partial<BulkActionsToolbarProps> = {}) {
  const onCategorize = overrides.onCategorize ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();
  const onExport = overrides.onExport ?? vi.fn();
  const onDeselectAll = overrides.onDeselectAll ?? vi.fn();

  render(
    <BulkActionsToolbar
      selectedCount={3}
      onCategorize={onCategorize}
      onDelete={onDelete}
      onExport={onExport}
      onDeselectAll={onDeselectAll}
      categories={defaultCategories}
      {...overrides}
    />,
  );

  return { onCategorize, onDelete, onExport, onDeselectAll };
}

describe('BulkActionsToolbar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when selectedCount is 0', () => {
    renderToolbar({ selectedCount: 0 });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows selected count', () => {
    renderToolbar({ selectedCount: 5 });

    expect(screen.getByText('5 selected')).toBeInTheDocument();
  });

  it('shows singular count for 1 item', () => {
    renderToolbar({ selectedCount: 1 });

    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('has the correct toolbar role and aria-label', () => {
    renderToolbar();

    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(toolbar).toBeInTheDocument();
  });

  it('renders all action buttons with correct labels', () => {
    renderToolbar({ selectedCount: 3 });

    expect(screen.getByRole('button', { name: 'Categorize 3 transactions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 3 transactions' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export 3 transactions as CSV' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deselect all transactions' })).toBeInTheDocument();
  });

  it('deselect all button calls onDeselectAll', () => {
    const { onDeselectAll } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Deselect all transactions' }));

    expect(onDeselectAll).toHaveBeenCalledTimes(1);
  });

  it('export button calls onExport', () => {
    const { onExport } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Export 3 transactions as CSV' }));

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('delete button opens confirm dialog', () => {
    renderToolbar({ selectedCount: 3 });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 3 transactions' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete 3 transactions?')).toBeInTheDocument();
  });

  it('confirming delete calls onDelete and closes dialog', () => {
    const { onDelete } = renderToolbar({ selectedCount: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 transactions' }));

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('cancelling delete does not call onDelete', () => {
    const { onDelete } = renderToolbar({ selectedCount: 2 });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 transactions' }));

    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('categorize button opens category picker', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Categorize 3 transactions' }));

    const listbox = screen.getByRole('listbox', { name: 'Select category' });
    expect(listbox).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Food' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Transport' })).toBeInTheDocument();
  });

  it('selecting a category calls onCategorize with the category ID', () => {
    const { onCategorize } = renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Categorize 3 transactions' }));
    fireEvent.click(screen.getByRole('option', { name: 'Food' }));

    expect(onCategorize).toHaveBeenCalledWith('cat-food');
    // picker should close
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('uses singular message for 1 transaction in delete dialog', () => {
    renderToolbar({ selectedCount: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 1 transactions' }));

    expect(screen.getByText('Are you sure you want to delete 1 transaction?')).toBeInTheDocument();
  });
});
