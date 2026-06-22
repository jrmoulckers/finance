// SPDX-License-Identifier: BUSL-1.1

/**
 * EncryptionUnlockSettings — user-controlled at-rest encryption unlock (#2806).
 *
 * Lets people intentionally turn encryption on/off and protect the SQLite data
 * key with a passphrase, a passkey (WebAuthn PRF), and/or a recovery code. Each
 * action re-wraps the same data key; none re-encrypt the database or change the
 * snapshot format.
 *
 * Data access is hooks-only via {@link useSqliteEncryption}; this component
 * never imports the vault/repository directly.
 */

import React, { useCallback, useState } from 'react';

import { useSqliteEncryption } from '../../hooks/useSqliteEncryption';

import { PassphraseDialog, type PassphraseDialogSubmitValues } from './PassphraseDialog';
import { RecoveryCodeDialog } from './RecoveryCodeDialog';

import './encryption-unlock.css';

type ActiveDialog =
  | { readonly type: 'set-passphrase' }
  | { readonly type: 'change-passphrase' }
  | { readonly type: 'verify-passphrase' }
  | { readonly type: 'recovery-code'; readonly code: string }
  | null;

interface StatusChipProps {
  readonly on: boolean;
  readonly onLabel?: string;
  readonly offLabel?: string;
}

const StatusChip: React.FC<StatusChipProps> = ({ on, onLabel = 'On', offLabel = 'Off' }) => (
  <span
    className={`encryption-chip ${on ? 'encryption-chip--on' : 'encryption-chip--off'}`}
    data-state={on ? 'on' : 'off'}
  >
    <span aria-hidden="true" className="encryption-chip__dot" />
    {on ? onLabel : offLabel}
  </span>
);

export const EncryptionUnlockSettings: React.FC = () => {
  const encryption = useSqliteEncryption();
  const { status } = encryption;

  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const announce = useCallback((message: string) => {
    setError(null);
    setAnnouncement(message);
  }, []);

  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setAnnouncement(label);
    } catch (actionError) {
      setAnnouncement('');
      setError(
        actionError instanceof Error ? actionError.message : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const handleToggleEncryption = useCallback(
    (next: boolean) => {
      void run(
        next ? 'Encryption at rest is now on for future writes.' : 'Encryption at rest is now off.',
        () => encryption.setEncryptionEnabled(next),
      );
    },
    [encryption, run],
  );

  const handleSetPassphrase = useCallback(
    async (values: PassphraseDialogSubmitValues) => {
      await encryption.setPassphrase(values.passphrase);
      announce('Passphrase saved. Your data key is now protected by your passphrase.');
    },
    [announce, encryption],
  );

  const handleChangePassphrase = useCallback(
    async (values: PassphraseDialogSubmitValues) => {
      await encryption.changePassphrase(values.current ?? '', values.passphrase);
      announce('Passphrase updated.');
    },
    [announce, encryption],
  );

  const handleVerifyPassphrase = useCallback(
    async (values: PassphraseDialogSubmitValues) => {
      await encryption.unlockWithPassphrase(values.passphrase);
      announce('Passphrase verified — it can unlock your data.');
    },
    [announce, encryption],
  );

  const handleGenerateRecovery = useCallback(() => {
    void run('Recovery code generated.', async () => {
      const code = await encryption.createRecoveryCode();
      setDialog({ type: 'recovery-code', code });
    });
  }, [encryption, run]);

  const handleEnrollPasskey = useCallback(() => {
    void run('Passkey enrolled. You can now unlock with your passkey.', () =>
      encryption.enrollWebAuthn(),
    );
  }, [encryption, run]);

  if (!encryption.supported) {
    return (
      <section className="encryption-unlock" aria-labelledby="encryption-unlock-title">
        <h3 id="encryption-unlock-title" className="encryption-unlock__title">
          Encryption unlock
        </h3>
        <p className="encryption-unlock__intro">
          This browser is missing the Web Crypto or storage features required for at-rest
          encryption, so unlock factors are unavailable here.
        </p>
      </section>
    );
  }

  const enabled = encryption.enabled;
  const passphraseSet = Boolean(status?.passphrase);
  const recoverySet = Boolean(status?.recovery);
  const passkeySet = Boolean(status?.webauthn.enabled);
  const webAuthnSupported = Boolean(status?.webAuthnSupported);
  const controlsDisabled = busy || encryption.loading;

  return (
    <section className="encryption-unlock" aria-labelledby="encryption-unlock-title">
      <h3 id="encryption-unlock-title" className="encryption-unlock__title">
        Encryption unlock
      </h3>
      <p className="encryption-unlock__intro">
        Encrypt the local SQLite database and choose how to unlock it. Adding a passphrase, passkey,
        or recovery code re-wraps the existing encryption key — your data is never re-encrypted or
        moved.
      </p>

      {/* Live regions for non-visual feedback */}
      <p className="encryption-unlock__sr-status" role="status" aria-live="polite">
        {announcement}
      </p>
      {error && (
        <p className="encryption-unlock__error" role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}

      {/* Enable / disable */}
      <div className="encryption-row">
        <div className="encryption-row__text">
          <label className="encryption-row__label" htmlFor="encryption-enabled-toggle">
            Encrypt local database (at rest)
          </label>
          <p className="encryption-row__hint">
            When on, database snapshots are stored as AES-256-GCM ciphertext. Existing encrypted
            data stays readable if you turn this off, so you are never locked out.
          </p>
        </div>
        <div className="encryption-row__control">
          <StatusChip on={enabled} />
          <button
            id="encryption-enabled-toggle"
            type="button"
            role="switch"
            aria-checked={enabled}
            className="encryption-switch"
            disabled={controlsDisabled}
            onClick={() => handleToggleEncryption(!enabled)}
          >
            <span className="encryption-switch__track" aria-hidden="true">
              <span className="encryption-switch__thumb" />
            </span>
            <span className="encryption-switch__text">{enabled ? 'Turn off' : 'Turn on'}</span>
          </button>
        </div>
      </div>

      <fieldset className="encryption-factors" disabled={!enabled || controlsDisabled}>
        <legend className="encryption-factors__legend">Unlock factors</legend>
        {!enabled && (
          <p className="encryption-row__hint">Turn on encryption above to manage unlock factors.</p>
        )}

        {/* Device automatic unlock */}
        <div className="encryption-row">
          <div className="encryption-row__text">
            <span className="encryption-row__label">Automatic unlock on this device</span>
            <p className="encryption-row__hint">
              A non-extractable device key unlocks your data automatically in this browser profile.
              This is the default and cannot be exported.
            </p>
          </div>
          <div className="encryption-row__control">
            <StatusChip on={Boolean(status?.deviceUnlock)} onLabel="Active" offLabel="Not set" />
          </div>
        </div>

        {/* Passphrase */}
        <div className="encryption-row">
          <div className="encryption-row__text">
            <span className="encryption-row__label">Passphrase</span>
            <p className="encryption-row__hint">
              Protect and recover your data key with a passphrase you remember. Wrong passphrases
              are rejected without revealing any data.
            </p>
          </div>
          <div className="encryption-row__control encryption-row__control--stack">
            <StatusChip on={passphraseSet} onLabel="Set" offLabel="Not set" />
            {passphraseSet ? (
              <div className="encryption-button-group">
                <button
                  type="button"
                  className="encryption-button encryption-button--secondary"
                  onClick={() => setDialog({ type: 'change-passphrase' })}
                >
                  Change
                </button>
                <button
                  type="button"
                  className="encryption-button encryption-button--secondary"
                  onClick={() => setDialog({ type: 'verify-passphrase' })}
                >
                  Verify
                </button>
                <button
                  type="button"
                  className="encryption-button encryption-button--danger"
                  onClick={() => {
                    void run('Passphrase removed.', encryption.removePassphrase);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="encryption-button encryption-button--primary"
                onClick={() => setDialog({ type: 'set-passphrase' })}
              >
                Set passphrase
              </button>
            )}
          </div>
        </div>

        {/* Passkey */}
        <div className="encryption-row">
          <div className="encryption-row__text">
            <span className="encryption-row__label">Passkey (Touch ID / Windows Hello)</span>
            <p className="encryption-row__hint">
              {webAuthnSupported
                ? 'Use a hardware-backed passkey to unlock without typing a passphrase.'
                : 'Passkeys are not available in this browser.'}
            </p>
          </div>
          <div className="encryption-row__control encryption-row__control--stack">
            <StatusChip on={passkeySet} onLabel="Enrolled" offLabel="Not set" />
            {passkeySet ? (
              <button
                type="button"
                className="encryption-button encryption-button--danger"
                onClick={() => {
                  void run('Passkey removed.', encryption.removeWebAuthn);
                }}
              >
                Remove passkey
              </button>
            ) : (
              <button
                type="button"
                className="encryption-button encryption-button--primary"
                disabled={!webAuthnSupported}
                onClick={handleEnrollPasskey}
              >
                Add passkey
              </button>
            )}
          </div>
        </div>

        {/* Recovery code */}
        <div className="encryption-row">
          <div className="encryption-row__text">
            <span className="encryption-row__label">Recovery code</span>
            <p className="encryption-row__hint">
              A one-time code that unlocks your data if you forget your passphrase. Generate one and
              store it somewhere safe.
            </p>
          </div>
          <div className="encryption-row__control encryption-row__control--stack">
            <StatusChip on={recoverySet} onLabel="Set" offLabel="Not set" />
            <div className="encryption-button-group">
              <button
                type="button"
                className="encryption-button encryption-button--primary"
                onClick={handleGenerateRecovery}
              >
                {recoverySet ? 'Replace code' : 'Generate code'}
              </button>
              {recoverySet && (
                <button
                  type="button"
                  className="encryption-button encryption-button--danger"
                  onClick={() => {
                    void run('Recovery code removed.', encryption.removeRecoveryCode);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </fieldset>

      <div className="encryption-unlock__note" role="note">
        <h4 className="encryption-unlock__note-title">If you lose access</h4>
        <p>
          Your data key can be unlocked by any factor you set up. If you forget your passphrase, use
          your recovery code or passkey. If every factor that protects this device is lost, the
          encrypted data on this device cannot be recovered — there is no backdoor. Keep at least
          one recovery factor in a safe place.
        </p>
      </div>

      {dialog?.type === 'set-passphrase' && (
        <PassphraseDialog
          mode="set"
          title="Set an unlock passphrase"
          description="Choose a passphrase to protect your local encryption key. You'll be able to unlock with it on this device."
          submitLabel="Save passphrase"
          onSubmit={handleSetPassphrase}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'change-passphrase' && (
        <PassphraseDialog
          mode="change"
          title="Change your passphrase"
          description="Enter your current passphrase, then choose a new one. Your encryption key is re-wrapped — your data is not re-encrypted."
          submitLabel="Update passphrase"
          onSubmit={handleChangePassphrase}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'verify-passphrase' && (
        <PassphraseDialog
          mode="unlock"
          title="Verify your passphrase"
          description="Enter your passphrase to confirm it can unlock your data. Nothing is changed."
          submitLabel="Verify"
          onSubmit={handleVerifyPassphrase}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'recovery-code' && (
        <RecoveryCodeDialog code={dialog.code} onClose={() => setDialog(null)} />
      )}
    </section>
  );
};

export default EncryptionUnlockSettings;
