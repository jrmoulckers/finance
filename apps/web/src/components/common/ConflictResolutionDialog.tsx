// SPDX-License-Identifier: BUSL-1.1

/**
 * Conflict resolution dialog component.
 *
 * Displays sync conflicts detected during mutation replay and allows the
 * user to resolve each conflict by choosing either the local (client) or
 * server version of the data.
 *
 * Accessibility:
 *   - Uses `role="dialog"` with `aria-modal="true"`
 *   - Focus is trapped within the dialog
 *   - Escape key closes the dialog
 *   - All interactive elements are keyboard-accessible
 *   - Conflict details are announced via `aria-describedby`
 *
 * References: issue #627
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getUnresolvedConflicts, resolveConflict, type SyncConflict } from '../../db/sync';

import '../../styles/conflict-resolution.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictResolutionDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** Callback when the dialog should close. */
  onClose: () => void;
  /** Callback after all conflicts are resolved. */
  onResolved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  isOpen,
  onClose,
  onResolved,
}) => {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Load conflicts when dialog opens.
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    void getUnresolvedConflicts().then((unresolved) => {
      setConflicts(unresolved);
      setCurrentIndex(0);
    });
  }, [isOpen]);

  // Focus management.
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }

    return () => {
      if (!isOpen && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  // Keyboard handler.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const handleResolve = useCallback(
    async (resolution: 'client' | 'server') => {
      const conflict = conflicts[currentIndex];
      if (!conflict) return;

      setIsResolving(true);
      try {
        await resolveConflict(conflict.mutationId, resolution);

        const remaining = conflicts.filter((_, i) => i !== currentIndex);
        setConflicts(remaining);

        if (remaining.length === 0) {
          onResolved?.();
          onClose();
        } else {
          setCurrentIndex(Math.min(currentIndex, remaining.length - 1));
        }
      } finally {
        setIsResolving(false);
      }
    },
    [conflicts, currentIndex, onClose, onResolved],
  );

  if (!isOpen || conflicts.length === 0) return null;

  const current = conflicts[currentIndex];
  if (!current) return null;

  return (
    <div className="conflict-dialog-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Resolve sync conflict ${currentIndex + 1} of ${conflicts.length}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="conflict-dialog__header">
          <h2 className="conflict-dialog__title">Sync Conflict</h2>
          <span className="conflict-dialog__counter" aria-live="polite">
            {currentIndex + 1} of {conflicts.length}
          </span>
          <button
            type="button"
            className="conflict-dialog__close"
            aria-label="Close conflict resolution"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="conflict-dialog__body">
          <p className="conflict-dialog__description" id="conflict-desc">
            A conflict was detected for <strong>{current.tableName}</strong> record{' '}
            <code>{current.recordId}</code>. Choose which version to keep.
          </p>

          <div className="conflict-dialog__comparison" aria-describedby="conflict-desc">
            <div className="conflict-dialog__version conflict-dialog__version--client">
              <h3 className="conflict-dialog__version-title">Your Version (Local)</h3>
              <pre className="conflict-dialog__data">
                {JSON.stringify(current.clientData, null, 2)}
              </pre>
            </div>

            <div className="conflict-dialog__version conflict-dialog__version--server">
              <h3 className="conflict-dialog__version-title">Server Version</h3>
              <pre className="conflict-dialog__data">
                {JSON.stringify(current.serverData, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <footer className="conflict-dialog__footer">
          <button
            type="button"
            className="conflict-dialog__action conflict-dialog__action--client"
            onClick={() => void handleResolve('client')}
            disabled={isResolving}
            aria-label="Keep your local version"
          >
            Keep Mine
          </button>
          <button
            type="button"
            className="conflict-dialog__action conflict-dialog__action--server"
            onClick={() => void handleResolve('server')}
            disabled={isResolving}
            aria-label="Accept server version"
          >
            Accept Server
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ConflictResolutionDialog;
