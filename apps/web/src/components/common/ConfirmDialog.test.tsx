// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/aria', () => ({
  announce: vi.fn(),
  useFocusTrap: vi.fn(),
}));

import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

function renderConfirmDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <ConfirmDialog
      isOpen={true}
      title="Delete transaction"
      message="This action cannot be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open and is hidden when closed', () => {
    const { rerender } = render(
      <ConfirmDialog
        isOpen={true}
        title="Delete transaction"
        message="This action cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    rerender(
      <ConfirmDialog
        isOpen={false}
        title="Delete transaction"
        message="This action cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the dialog title and message', () => {
    renderConfirmDialog();

    expect(screen.getByText('Delete transaction')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const { onCancel } = renderConfirmDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const { onConfirm } = renderConfirmDialog({ confirmLabel: 'Confirm delete' });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape is pressed', () => {
    const { onCancel } = renderConfirmDialog();

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has accessible alert dialog labelling', () => {
    renderConfirmDialog();

    const dialog = screen.getByRole('alertdialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    const descriptionId = dialog.getAttribute('aria-describedby');

    expect(titleId).toBeTruthy();
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')).toHaveTextContent('Delete transaction');
    expect(document.getElementById(descriptionId ?? '')).toHaveTextContent(
      'This action cannot be undone.',
    );
  });

  it('disables the confirm button while loading', () => {
    renderConfirmDialog({ isLoading: true });

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});
