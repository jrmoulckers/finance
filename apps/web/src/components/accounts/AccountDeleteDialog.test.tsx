// SPDX-License-Identifier: BUSL-1.1

// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDeleteDialog } from './AccountDeleteDialog';

// Mock the focus trap since it relies on DOM internals
vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
  announce: vi.fn(),
}));

describe('AccountDeleteDialog', () => {
  const defaultProps = {
    isOpen: true,
    accountName: 'My Checking',
    transactionCount: 15,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(<AccountDeleteDialog {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('displays the transaction count warning', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    expect(screen.getByText('This account has 15 transactions.')).toBeInTheDocument();
  });

  it('displays singular grammar for one transaction', () => {
    render(<AccountDeleteDialog {...defaultProps} transactionCount={1} />);
    expect(screen.getByText('This account has 1 transaction.')).toBeInTheDocument();
  });

  it('displays no-transaction message when count is zero', () => {
    render(<AccountDeleteDialog {...defaultProps} transactionCount={0} />);
    expect(screen.getByText('This account has no transactions.')).toBeInTheDocument();
  });

  it('explains default unlink behavior when transactions exist', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    expect(
      screen.getByText('Transactions will be kept but unlinked from this account.'),
    ).toBeInTheDocument();
  });

  it('allows deletion without cascade when checkbox is unchecked', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(false);
  });

  it('requires typing account name when cascade delete is checked', () => {
    render(<AccountDeleteDialog {...defaultProps} />);

    // Check the cascade checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Delete button should be disabled until name is typed
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    expect(deleteButton).toBeDisabled();

    // Type the account name
    const input = screen.getByLabelText(/type/i);
    fireEvent.change(input, { target: { value: 'My Checking' } });

    // Now delete should be enabled
    expect(deleteButton).not.toBeDisabled();
    fireEvent.click(deleteButton);
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(true);
  });

  it('is case-insensitive for confirmation text', () => {
    render(<AccountDeleteDialog {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const input = screen.getByLabelText(/type/i);
    fireEvent.change(input, { target: { value: 'my checking' } });

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    expect(deleteButton).not.toBeDisabled();
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onCancel on Escape key', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('shows cascade warning when checkbox is checked', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(screen.getByText(/permanent\. this cannot be undone/i)).toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    render(<AccountDeleteDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
  });
});
