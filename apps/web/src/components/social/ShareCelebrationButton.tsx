// SPDX-License-Identifier: BUSL-1.1

/**
 * ShareCelebrationButton — an accessible, privacy-safe share affordance for
 * savings-goal milestones, goal completion, badge unlocks, and streaks.
 *
 * Behaviour:
 * - Opens a focus-trapped preview dialog showing EXACTLY the redacted content
 *   that will be shared (no raw balances unless the user opts in).
 * - Uses the Web Share API (`navigator.share`) when available, with a
 *   clipboard-copy fallback.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Trigger button has a clear, descriptive label and is keyboard-operable.
 * - Dialog uses `role="dialog"`, `aria-modal`, focus trapping, Escape-to-close
 *   and restores focus to the trigger on close.
 * - Status changes are announced via a polite live region (no colour-only cue —
 *   a check icon plus text accompanies the success state).
 * - Motion respects `prefers-reduced-motion` (handled in CSS).
 *
 * Refs #2210
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { announce, useFocusTrap } from '../../accessibility/aria';
import { AppIcon } from '../icons';
import { Checkbox } from '../common/Checkbox';
import {
  buildShareCelebration,
  toShareData,
  type CelebrationEvent,
} from '../../lib/social/share-celebration';

import '../forms/forms.css';
import './share-celebration.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ShareCelebrationButtonProps {
  /** The celebratory event to share. */
  event: CelebrationEvent;
  /** Accessible label for the trigger button. Defaults to an event-derived label. */
  label?: string;
  /** Visible text for the trigger button. Defaults to “Share”. */
  buttonText?: string;
  /** Trigger button visual variant. Defaults to `secondary`. */
  variant?: 'primary' | 'secondary';
  /** Extra class names appended to the trigger button. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultLabel(event: CelebrationEvent): string {
  switch (event.kind) {
    case 'goal-milestone':
      return `Share ${event.goalName} milestone`;
    case 'goal-completion':
      return `Share ${event.goalName} completion`;
    case 'badge-unlock':
      return `Share ${event.badgeName} badge`;
    case 'streak-milestone':
      return `Share ${event.days}-day ${event.streakLabel} streak`;
  }
}

function eventHasAmount(event: CelebrationEvent): boolean {
  return (
    (event.kind === 'goal-milestone' || event.kind === 'goal-completion') &&
    typeof event.amountCents === 'number' &&
    event.amountCents > 0
  );
}

function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ShareCelebrationButton: React.FC<ShareCelebrationButtonProps> = ({
  event,
  label,
  buttonText = 'Share',
  variant = 'secondary',
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [revealAmount, setRevealAmount] = useState(false);
  const [status, setStatus] = useState<{ message: string; success: boolean } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  const hasAmount = eventHasAmount(event);
  const webShareAvailable = canUseWebShare();

  const celebration = useMemo(
    () => buildShareCelebration(event, { revealAmount: hasAmount && revealAmount }),
    [event, hasAmount, revealAmount],
  );

  useFocusTrap(panelRef, {
    active: isOpen,
    restoreFocus: true,
    initialFocusRef: primaryActionRef,
  });

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const openDialog = useCallback(() => {
    setStatus(null);
    setRevealAmount(false);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (eventArg: React.KeyboardEvent<HTMLDivElement>) => {
      if (eventArg.key === 'Escape') {
        eventArg.preventDefault();
        closeDialog();
      }
    },
    [closeDialog],
  );

  const copyToClipboard = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(celebration.shareText);
        return true;
      }
    } catch {
      // fall through to failure handling below
    }
    return false;
  }, [celebration.shareText]);

  const handleShare = useCallback(async () => {
    if (webShareAvailable) {
      try {
        await navigator.share(toShareData(celebration));
        setStatus({ message: 'Shared with your friends.', success: true });
        announce('Share sheet opened.', 'polite');
        return;
      } catch (err) {
        // The user cancelling the native sheet is not an error worth surfacing.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Otherwise fall back to clipboard.
      }
    }

    const copied = await copyToClipboard();
    if (copied) {
      setStatus({ message: 'Copied to clipboard.', success: true });
      announce('Share text copied to clipboard.', 'polite');
    } else {
      setStatus({
        message: 'Could not share automatically. Select and copy the text above.',
        success: false,
      });
      announce('Sharing is unavailable. Copy the text manually.', 'assertive');
    }
  }, [celebration, copyToClipboard, webShareAvailable]);

  const handleCopy = useCallback(async () => {
    const copied = await copyToClipboard();
    if (copied) {
      setStatus({ message: 'Copied to clipboard.', success: true });
      announce('Share text copied to clipboard.', 'polite');
    } else {
      setStatus({ message: 'Could not copy. Select the text above to copy it.', success: false });
      announce('Copy failed. Select the text manually.', 'assertive');
    }
  }, [copyToClipboard]);

  const triggerLabel = label ?? defaultLabel(event);
  const primaryText = webShareAvailable ? 'Share' : 'Copy';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`form-button form-button--${variant} share-celebration__trigger${
          className ? ` ${className}` : ''
        }`}
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
      >
        <AppIcon name="upload" />
        <span>{buttonText}</span>
      </button>

      {isOpen && (
        <div className="form-dialog" role="presentation">
          <div className="form-dialog__backdrop" aria-hidden="true" onClick={closeDialog} />
          <div
            ref={panelRef}
            className="form-dialog__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onKeyDown={handleKeyDown}
          >
            <h2 id={titleId} className="form-dialog__title">
              Share your win
            </h2>
            <p id={descId} className="share-celebration__status">
              Here is exactly what your friends will see. Your balances stay private.
            </p>

            <div className="share-celebration__preview" aria-label="Share preview">
              <p className="share-celebration__preview-title">{celebration.title}</p>
              <p className="share-celebration__preview-message">{celebration.message}</p>

              {celebration.percentComplete !== null && (
                <div
                  className="share-celebration__track"
                  role="progressbar"
                  aria-valuenow={celebration.percentComplete}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${celebration.percentComplete}% to goal`}
                >
                  <div
                    className="share-celebration__fill"
                    style={{ width: `${Math.min(celebration.percentComplete, 100)}%` }}
                  />
                </div>
              )}

              {celebration.amountLabel !== null && (
                <p className="share-celebration__amount">Saved so far: {celebration.amountLabel}</p>
              )}

              <p className="share-celebration__hashtags">{celebration.hashtags.join(' ')}</p>
            </div>

            {hasAmount && (
              <Checkbox
                className="share-celebration__option"
                label={
                  <>Include the amount I&rsquo;ve saved (off by default to keep balances private)</>
                }
                checked={revealAmount}
                onChange={(e) => setRevealAmount(e.target.checked)}
              />
            )}

            <p
              className={`share-celebration__status${
                status?.success ? ' share-celebration__status--success' : ''
              }`}
              role="status"
              aria-live="polite"
            >
              {status?.success && <AppIcon name="check" />}
              {status?.message ?? ''}
            </p>

            <div className="form-actions share-celebration__actions">
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={closeDialog}
              >
                Close
              </button>
              {webShareAvailable && (
                <button
                  type="button"
                  className="form-button form-button--secondary"
                  onClick={handleCopy}
                >
                  <AppIcon name="clipboard" /> Copy
                </button>
              )}
              <button
                ref={primaryActionRef}
                type="button"
                className="form-button form-button--primary"
                onClick={handleShare}
              >
                <AppIcon name={webShareAvailable ? 'upload' : 'clipboard'} /> {primaryText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShareCelebrationButton;
