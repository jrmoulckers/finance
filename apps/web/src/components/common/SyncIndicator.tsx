// SPDX-License-Identifier: BUSL-1.1

import React, { useEffect, useMemo, useState } from 'react';
import { useSyncStatus } from '../../hooks';
import { subscribeToIncomingCrossTabChanges } from '../../lib/sync/crossTab';

export interface SyncIndicatorProps {
  readonly className?: string;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ className = '' }) => {
  const { isOffline, isSyncing, pendingMutations } = useSyncStatus();
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToIncomingCrossTabChanges(() => {
      setIsPulsing(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isPulsing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsPulsing(false);
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPulsing]);

  const { background, borderColor, label, title } = useMemo(() => {
    if (isOffline) {
      return {
        label: 'Offline',
        title: 'Sync paused while offline',
        background: 'rgba(239, 68, 68, 0.12)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
      };
    }

    if (isSyncing || pendingMutations > 0) {
      return {
        label: 'Syncing',
        title: 'Changes are syncing across tabs and devices',
        background: 'rgba(59, 130, 246, 0.12)',
        borderColor: 'rgba(59, 130, 246, 0.35)',
      };
    }

    return {
      label: 'Synced',
      title: 'All recent changes are synced',
      background: 'rgba(34, 197, 94, 0.12)',
      borderColor: 'rgba(34, 197, 94, 0.35)',
    };
  }, [isOffline, isSyncing, pendingMutations]);

  return (
    <span
      className={className}
      role="status"
      aria-live="polite"
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        borderRadius: '999px',
        border: `1px solid ${borderColor}`,
        background,
        color: 'var(--color-text-primary)',
        fontSize: '0.75rem',
        fontWeight: 600,
        lineHeight: 1,
        padding: '0.35rem 0.65rem',
        transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease',
        transform: isPulsing ? 'scale(1.04)' : 'scale(1)',
        boxShadow: isPulsing ? '0 0 0 0.25rem rgba(59, 130, 246, 0.18)' : 'none',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '999px',
          background: borderColor,
        }}
      />
      {label}
    </span>
  );
};

export default SyncIndicator;
