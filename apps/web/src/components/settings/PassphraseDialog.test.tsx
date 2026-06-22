// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WrongPassphraseError } from '../../db/data-key-wrapping';

import { PassphraseDialog } from './PassphraseDialog';

describe('PassphraseDialog (#2806)', () => {
  it('moves focus to the first field on open (unlock mode)', () => {
    render(
      <PassphraseDialog
        mode="unlock"
        title="Verify your passphrase"
        description="Enter your passphrase."
        submitLabel="Verify"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Passphrase')).toHaveFocus();
  });

  it('rejects mismatched confirmation without calling onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PassphraseDialog
        mode="set"
        title="Set an unlock passphrase"
        description="Choose a passphrase."
        submitLabel="Save passphrase"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('New passphrase'), 'first-passphrase-1');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'second-passphrase-2');
    await userEvent.click(screen.getByRole('button', { name: 'Save passphrase' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the new passphrase when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <PassphraseDialog
        mode="set"
        title="Set an unlock passphrase"
        description="Choose a passphrase."
        submitLabel="Save passphrase"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    await userEvent.type(screen.getByLabelText('New passphrase'), 'a-good-strong-passphrase');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'a-good-strong-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Save passphrase' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ passphrase: 'a-good-strong-passphrase' }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces a wrong-passphrase error from onSubmit (fails closed)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new WrongPassphraseError('passphrase'));
    const onClose = vi.fn();
    render(
      <PassphraseDialog
        mode="unlock"
        title="Verify your passphrase"
        description="Enter your passphrase."
        submitLabel="Verify"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    await userEvent.type(screen.getByLabelText('Passphrase'), 'whatever-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape and via Cancel', async () => {
    const onClose = vi.fn();
    render(
      <PassphraseDialog
        mode="set"
        title="Set an unlock passphrase"
        description="Choose a passphrase."
        submitLabel="Save passphrase"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
