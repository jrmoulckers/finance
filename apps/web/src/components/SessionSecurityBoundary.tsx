// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { appendSecurityAuditEvent } from '../lib/security-audit-log';
import { IdleSessionController, loadIdleSessionPolicy } from '../lib/session-security';

export interface SessionSecurityBoundaryProps {
  readonly children: ReactNode;
}

export const SessionSecurityBoundary: React.FC<SessionSecurityBoundaryProps> = ({ children }) => {
  const { isAuthenticated, isDemoMode, logout } = useAuth();
  const controllerRef = useRef<IdleSessionController | null>(null);
  const [warningMs, setWarningMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const policy = loadIdleSessionPolicy();
    controllerRef.current = new IdleSessionController({
      policy,
      onWarning: (remaining) => setWarningMs(Math.ceil(remaining / 1000) * 1000),
      onTimeout: () => {
        setWarningMs(null);
        void appendSecurityAuditEvent({
          action: 'session_timeout',
          result: 'success',
          metadata: { lockBehavior: policy.lockBehavior, demoMode: isDemoMode },
        });
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
  }, [isAuthenticated, isDemoMode, logout]);

  return (
    <>
      {children}
      {warningMs !== null && (
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

export default SessionSecurityBoundary;
