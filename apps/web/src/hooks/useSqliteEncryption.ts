// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the SQLite at-rest encryption unlock UI (#2806).
 *
 * Wraps the data-key vault so settings components never import the repository /
 * vault directly. All actions re-wrap the *same* data key — they never
 * regenerate it or change the encrypted snapshot format.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isSqliteAtRestEncryptionEnabled,
  isSqliteAtRestEncryptionSupported,
  setSqliteAtRestEncryptionEnabled,
} from '../db/sqlite-at-rest-encryption';
import {
  changePassphrase as changePassphraseVault,
  createRecoveryCode as createRecoveryCodeVault,
  enrollWebAuthn as enrollWebAuthnVault,
  getEncryptionFactorStatus,
  removePassphrase as removePassphraseVault,
  removeRecoveryCode as removeRecoveryCodeVault,
  removeWebAuthn as removeWebAuthnVault,
  setPassphrase as setPassphraseVault,
  unlockWithPassphrase as unlockWithPassphraseVault,
  unlockWithRecoveryCode as unlockWithRecoveryCodeVault,
  unlockWithWebAuthn as unlockWithWebAuthnVault,
  type EncryptionFactorStatus,
} from '../db/sqlite-encryption-vault';

/** Shape returned by {@link useSqliteEncryption}. */
export interface UseSqliteEncryptionResult {
  /** Web Crypto + IndexedDB available. */
  readonly supported: boolean;
  /** Opt-in at-rest encryption flag is on. */
  readonly enabled: boolean;
  /** Whether the factor status is still loading. */
  readonly loading: boolean;
  /** Current wrapping-factor status, or `null` before the first load. */
  readonly status: EncryptionFactorStatus | null;
  /** Re-read the factor status from storage. */
  readonly refresh: () => Promise<void>;
  /** Enable or disable at-rest encryption for future writes. */
  readonly setEncryptionEnabled: (enabled: boolean) => Promise<void>;
  /** Set (or replace) the passphrase factor. */
  readonly setPassphrase: (passphrase: string) => Promise<void>;
  /** Rotate the passphrase in place (verifies the current one). */
  readonly changePassphrase: (current: string, next: string) => Promise<void>;
  /** Remove the passphrase factor. */
  readonly removePassphrase: () => Promise<void>;
  /** Verify a passphrase can unlock the data key. */
  readonly unlockWithPassphrase: (passphrase: string) => Promise<void>;
  /** Generate (or rotate) a recovery code. Returns the plaintext once. */
  readonly createRecoveryCode: () => Promise<string>;
  /** Remove the recovery-code factor. */
  readonly removeRecoveryCode: () => Promise<void>;
  /** Verify a recovery code can unlock the data key. */
  readonly unlockWithRecoveryCode: (code: string) => Promise<void>;
  /** Enroll a passkey (WebAuthn PRF) wrapping factor. */
  readonly enrollWebAuthn: (label?: string) => Promise<void>;
  /** Remove the passkey factor. */
  readonly removeWebAuthn: () => Promise<void>;
  /** Verify the enrolled passkey can unlock the data key. */
  readonly unlockWithWebAuthn: () => Promise<void>;
}

/** Manage at-rest encryption unlock factors. */
export function useSqliteEncryption(): UseSqliteEncryptionResult {
  const supported = isSqliteAtRestEncryptionSupported();
  const [enabled, setEnabled] = useState(() => isSqliteAtRestEncryptionEnabled());
  const [status, setStatus] = useState<EncryptionFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!supported) {
      if (mountedRef.current) {
        setStatus(null);
        setLoading(false);
      }
      return;
    }
    try {
      const next = await getEncryptionFactorStatus();
      if (mountedRef.current) {
        setStatus(next);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setEncryptionEnabled = useCallback(
    async (next: boolean) => {
      setSqliteAtRestEncryptionEnabled(next);
      setEnabled(next);
      await refresh();
    },
    [refresh],
  );

  const runThenRefresh = useCallback(
    <Args extends unknown[], R>(action: (...args: Args) => Promise<R>) =>
      async (...args: Args): Promise<R> => {
        const result = await action(...args);
        await refresh();
        return result;
      },
    [refresh],
  );

  return {
    supported,
    enabled,
    loading,
    status,
    refresh,
    setEncryptionEnabled,
    setPassphrase: runThenRefresh(setPassphraseVault),
    changePassphrase: runThenRefresh(changePassphraseVault),
    removePassphrase: runThenRefresh(removePassphraseVault),
    unlockWithPassphrase: unlockWithPassphraseVault,
    createRecoveryCode: runThenRefresh(createRecoveryCodeVault),
    removeRecoveryCode: runThenRefresh(removeRecoveryCodeVault),
    unlockWithRecoveryCode: unlockWithRecoveryCodeVault,
    enrollWebAuthn: runThenRefresh(enrollWebAuthnVault),
    removeWebAuthn: runThenRefresh(removeWebAuthnVault),
    unlockWithWebAuthn: unlockWithWebAuthnVault,
  };
}

export default useSqliteEncryption;
