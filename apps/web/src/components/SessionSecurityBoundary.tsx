// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { appendSecurityAuditEvent } from '../lib/security-audit-log';
import { IdleSessionController, loadIdleSessionPolicy } from '../lib/session-security';
import {
  APP_LOCK_SETTINGS_CHANGED_EVENT,
  DEFAULT_APP_LOCK_STATE,
  loadAppLockSettings,
  normalizeAppLockSettings,
  reduceAppLockEvent,
  type AppLockAuditEntry,
  type AppLockRuntimeState,
  type AppLockSettings,
} from '../lib/security/app-lock-settings';
import { completeWebAuthnAppLockChallenge, createWebAuthnAppLockChallenge } from '../lib/security/webauthn-challenge';

export interface SessionSecurityBoundaryProps {
  readonly children: ReactNode;
}

export const SessionSecurityBoundary: React.FC<SessionSecurityBoundaryProps> = ({ children }) => {
  const { isAuthenticated, isDemoMode, logout, user } = useAuth();
  const controllerRef = useRef<IdleSessionController | null>(null);
  const appLockStateRef = useRef<AppLockRuntimeState>(DEFAULT_APP_LOCK_STATE);
  const [warningMs, setWarningMs] = useState<number | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [appLockSettings, setAppLockSettings] = useState<AppLockSettings>(() => loadEffectiveAppLockSettings());
  const [appLockState, setAppLockState] = useState<AppLockRuntimeState>(() =>
    initialAppLockState(loadEffectiveAppLockSettings()),
  );

  useEffect(() => {
    appLockStateRef.current = appLockState;
  }, [appLockState]);

  useEffect(() => {
    const reloadSettings = () => {
      const nextSettings = loadEffectiveAppLockSettings();
      setAppLockSettings(nextSettings);
      setAppLockState((current) => {
        if (!nextSettings.enabled) return DEFAULT_APP_LOCK_STATE;
        if (!isAuthenticated || current.lastUnlockedAtMs !== null) return current;
        return lockApp(nextSettings, current, 'idle_check').state;
      });
    };

    window.addEventListener(APP_LOCK_SETTINGS_CHANGED_EVENT, reloadSettings);
    return () => window.removeEventListener(APP_LOCK_SETTINGS_CHANGED_EVENT, reloadSettings);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnlockError(null);
      return;
    }

    if (!appLockSettings.enabled) {
      setAppLockState(DEFAULT_APP_LOCK_STATE);
      return;
    }

    // Default app-lock lifecycle: enabled users see the privacy-safe locked shell
    // on the first authenticated load, then again after the configured idle timeout.
    setAppLockState((current) => {
      if (current.locked || current.lastUnlockedAtMs !== null) return current;
      return lockApp(appLockSettings, current, 'idle_check').state;
    });
  }, [appLockSettings, isAuthenticated]);

  const unlockApp = useCallback(async () => {
    if (!isAuthenticated || !appLockSettings.enabled) return;

    setUnlockError(null);
    setUnlocking(true);

    try {
      const method = appLockSettings.requirePasskey && user?.hasPasskey ? 'passkey' : 'existing_auth';
      if (method === 'passkey') {
        const nowMs = Date.now();
        const challenge = createWebAuthnAppLockChallenge({
          nowMs,
          ttlMs: Math.min(appLockSettings.idleTimeoutMs, 60_000),
          rpId: window.location.hostname || undefined,
        });
        const result = await completeWebAuthnAppLockChallenge({ challenge, nowMs: Date.now() });
        if (result.status !== 'verified') {
          setUnlockError(result.error ?? 'Passkey unlock failed. Try again or use your account recovery flow.');
          return;
        }
      }

      const unlockSettings = method === 'existing_auth' ? { ...appLockSettings, requirePasskey: false } : appLockSettings;
      const transition = reduceAppLockEvent(unlockSettings, appLockStateRef.current, 'unlock_success', Date.now());
      setAppLockState(transition.state);
      recordAppLockAudit(transition.audit);
    } finally {
      setUnlocking(false);
    }
  }, [appLockSettings, isAuthenticated, user?.hasPasskey]);

  useEffect(() => {
    const appLockActive = isAuthenticated && appLockSettings.enabled;
    const appLocked = appLockActive && appLockState.locked;
    if (!isAuthenticated || appLocked) return undefined;

    const policy = loadIdleSessionPolicy();
    controllerRef.current = new IdleSessionController({
      policy,
      onWarning: (remaining) => setWarningMs(Math.ceil(remaining / 1000) * 1000),
      onTimeout: () => {
        setWarningMs(null);
        void appendSecurityAuditEvent({
          action: 'session_timeout',
          result: 'success',
          metadata: { lockBehavior: appLockActive ? 'lock' : policy.lockBehavior, demoMode: isDemoMode },
        });

        if (appLockActive) {
          const transition = lockApp(appLockSettings, appLockStateRef.current, 'idle_check');
          setAppLockState(transition.state);
          recordAppLockAudit(transition.audit);
          return;
        }

        if (policy.lockBehavior === 'logout') void logout();
      },
    });

    const check = () => controllerRef.current?.check();
    const record = () => {
      controllerRef.current?.recordActivity();
      setWarningMs(null);
    };
    const visibility = () => controllerRef.current?.handleVisibilityChange(document.hidden);
    const interval = window.setInterval(check, 1_000);
    for (const event of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(event, record, { passive: true });
    }
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(interval);
      for (const event of ['pointerdown', 'keydown', 'touchstart']) {
        window.removeEventListener(event, record);
      }
      document.removeEventListener('visibilitychange', visibility);
      controllerRef.current = null;
    };
  }, [appLockSettings, appLockState.locked, isAuthenticated, isDemoMode, logout]);

  const showLockedShell = isAuthenticated && appLockSettings.enabled && appLockState.locked;

  return (
    <>
      {showLockedShell ? (
        <LockedAppShell
          canUsePasskey={appLockSettings.requirePasskey && user?.hasPasskey === true}
          error={unlockError}
          unlocking={unlocking}
          onUnlock={() => void unlockApp()}
        />
      ) : (
        children
      )}
      {warningMs !== null && !showLockedShell && (
        <div role="alertdialog" aria-live="assertive" aria-label="Idle timeout warning">
          You have been idle. The app will lock in {Math.ceil(warningMs / 1000)} seconds.
          <button type="button" onClick={() => controllerRef.current?.recordActivity()} autoFocus>
            Stay signed in
          </button>
        </div>
      )}
    </>
  );
};

interface LockedAppShellProps {
  readonly canUsePasskey: boolean;
  readonly error: string | null;
  readonly unlocking: boolean;
  readonly onUnlock: () => void;
}

const LockedAppShell: React.FC<LockedAppShellProps> = ({ canUsePasskey, error, unlocking, onUnlock }) => (
  <section role="status" aria-live="polite" className="app-lock-shell" data-testid="app-lock-shell">
    <h2>Finance is locked</h2>
    <p>Unlock this local app lock to show balances, transactions, budgets, and recent activity.</p>
    <p>This is separate from account sign-in; your existing authenticated session remains active.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={onUnlock} disabled={unlocking} autoFocus>
      {unlocking ? 'Unlocking…' : canUsePasskey ? 'Unlock with passkey' : 'Continue with current session'}
    </button>
  </section>
);

function loadEffectiveAppLockSettings(): AppLockSettings {
  const idlePolicy = loadIdleSessionPolicy();
  return normalizeAppLockSettings({ ...loadAppLockSettings(), idleTimeoutMs: idlePolicy.timeoutMs });
}

function initialAppLockState(settings: AppLockSettings): AppLockRuntimeState {
  return settings.enabled ? { locked: true, reason: 'idle_timeout', lastUnlockedAtMs: null } : DEFAULT_APP_LOCK_STATE;
}

function lockApp(settings: AppLockSettings, state: AppLockRuntimeState, event: 'idle_check' | 'manual_lock') {
  return reduceAppLockEvent(settings, state, event, Date.now());
}

function recordAppLockAudit(audit: AppLockAuditEntry | undefined): void {
  if (!audit) return;
  void appendSecurityAuditEvent({
    action: audit.event,
    result: audit.severity === 'warning' ? 'warning' : 'success',
    metadata: audit.metadata,
  });
}

export default SessionSecurityBoundary;
