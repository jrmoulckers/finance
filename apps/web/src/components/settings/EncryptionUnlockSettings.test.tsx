// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WrongPassphraseError } from '../../db/data-key-wrapping';
import type { EncryptionFactorStatus } from '../../db/sqlite-encryption-vault';
import type { UseSqliteEncryptionResult } from '../../hooks/useSqliteEncryption';

vi.mock('../../hooks/useSqliteEncryption', () => ({
  useSqliteEncryption: vi.fn(),
}));

import { useSqliteEncryption } from '../../hooks/useSqliteEncryption';
import { EncryptionUnlockSettings } from './EncryptionUnlockSettings';

const baseStatus: EncryptionFactorStatus = {
  supported: true,
  webAuthnSupported: true,
  deviceUnlock: true,
  passphrase: false,
  recovery: false,
  webauthn: { enabled: false },
  factorCount: 0,
};

function buildHook(overrides: Partial<UseSqliteEncryptionResult> = {}): UseSqliteEncryptionResult {
  return {
    supported: true,
    enabled: true,
    loading: false,
    status: baseStatus,
    refresh: vi.fn().mockResolvedValue(undefined),
    setEncryptionEnabled: vi.fn().mockResolvedValue(undefined),
    setPassphrase: vi.fn().mockResolvedValue(undefined),
    changePassphrase: vi.fn().mockResolvedValue(undefined),
    removePassphrase: vi.fn().mockResolvedValue(undefined),
    unlockWithPassphrase: vi.fn().mockResolvedValue(undefined),
    createRecoveryCode: vi.fn().mockResolvedValue('ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2'),
    removeRecoveryCode: vi.fn().mockResolvedValue(undefined),
    unlockWithRecoveryCode: vi.fn().mockResolvedValue(undefined),
    enrollWebAuthn: vi.fn().mockResolvedValue(undefined),
    removeWebAuthn: vi.fn().mockResolvedValue(undefined),
    unlockWithWebAuthn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('EncryptionUnlockSettings (#2806)', () => {
  beforeEach(() => {
    vi.mocked(useSqliteEncryption).mockReturnValue(buildHook());
  });

  it('renders the unlock factors and the encryption toggle', () => {
    render(<EncryptionUnlockSettings />);

    expect(screen.getByRole('heading', { name: 'Encryption unlock' })).toBeInTheDocument();
    expect(screen.getByText('Automatic unlock on this device')).toBeInTheDocument();
    expect(screen.getByText('Passphrase')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /encrypt local database/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set passphrase' })).toBeInTheDocument();
  });

  it('shows an unsupported message when encryption is unavailable', () => {
    vi.mocked(useSqliteEncryption).mockReturnValue(buildHook({ supported: false, status: null }));
    render(<EncryptionUnlockSettings />);

    expect(screen.getByText(/missing the Web Crypto or storage features/i)).toBeInTheDocument();
  });

  it('toggles encryption on', async () => {
    const setEncryptionEnabled = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSqliteEncryption).mockReturnValue(
      buildHook({ enabled: false, setEncryptionEnabled }),
    );
    render(<EncryptionUnlockSettings />);

    await userEvent.click(screen.getByRole('switch', { name: /encrypt local database/i }));

    expect(setEncryptionEnabled).toHaveBeenCalledWith(true);
  });

  it('sets a passphrase through the dialog', async () => {
    const setPassphrase = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useSqliteEncryption).mockReturnValue(buildHook({ setPassphrase }));
    render(<EncryptionUnlockSettings />);

    await userEvent.click(screen.getByRole('button', { name: 'Set passphrase' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New passphrase'), 'a-very-strong-pass');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'a-very-strong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Save passphrase' }));

    await waitFor(() => expect(setPassphrase).toHaveBeenCalledWith('a-very-strong-pass'));
  });

  it('announces a friendly error when the wrong passphrase is entered', async () => {
    const changePassphrase = vi.fn().mockRejectedValue(new WrongPassphraseError('passphrase'));
    vi.mocked(useSqliteEncryption).mockReturnValue(
      buildHook({
        status: { ...baseStatus, passphrase: true, factorCount: 1 },
        changePassphrase,
      }),
    );
    render(<EncryptionUnlockSettings />);

    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.type(screen.getByLabelText('Current passphrase'), 'wrong-current-pass');
    await userEvent.type(screen.getByLabelText('New passphrase'), 'a-brand-new-passphrase');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'a-brand-new-passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Update passphrase' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not correct/i);
    expect(changePassphrase).toHaveBeenCalled();
  });

  it('blocks submitting a too-short passphrase with an inline error', async () => {
    render(<EncryptionUnlockSettings />);

    await userEvent.click(screen.getByRole('button', { name: 'Set passphrase' }));
    await userEvent.type(screen.getByLabelText('New passphrase'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm passphrase'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Save passphrase' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 12 characters/i);
  });

  it('reveals a generated recovery code once', async () => {
    render(<EncryptionUnlockSettings />);

    await userEvent.click(screen.getByRole('button', { name: 'Generate code' }));

    expect(await screen.findByLabelText('Recovery code')).toHaveTextContent(
      'ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2',
    );
  });
});
