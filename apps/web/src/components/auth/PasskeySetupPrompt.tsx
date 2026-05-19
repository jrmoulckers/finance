// SPDX-License-Identifier: BUSL-1.1

/**
 * PasskeySetupPrompt (#1445)
 *
 * Modal dialog that prompts users to set up passkey-based biometric
 * authentication after their first login or signup.
 *
 * Features:
 *   - Platform-aware messaging (Windows Hello, Touch ID, Face ID, biometrics)
 *   - Three actions: Set Up Now, Remind Me Later, Skip
 *   - Only shows when platform authenticator is available
 *   - Accessible modal with focus trapping and ARIA attributes
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import { setHasRegisteredPasskey, setPasskeyPromptState } from '../../lib/passkey-preferences';

import './passkey-setup-prompt.css';

// ---------------------------------------------------------------------------
// Platform Detection
// ---------------------------------------------------------------------------

/**
 * Detect the platform-appropriate biometric label.
 *
 * @returns A user-friendly name for the platform authenticator.
 */
function getPlatformBiometricLabel(): string {
  const ua = navigator.userAgent;

  if (/Windows/i.test(ua)) {
    return 'Windows Hello';
  }

  // iPad can report as Macintosh, so check for touch support
  if (/iPad|Macintosh/i.test(ua) && navigator.maxTouchPoints > 0) {
    return 'Face ID';
  }

  if (/iPhone/i.test(ua)) {
    // Modern iPhones use Face ID; older ones use Touch ID.
    // We can't reliably detect which, so default to Face ID.
    return 'Face ID';
  }

  if (/Macintosh|Mac OS/i.test(ua)) {
    return 'Touch ID';
  }

  if (/Android/i.test(ua)) {
    return 'biometrics';
  }

  return 'biometrics';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PasskeySetupPromptProps {
  /** Whether the modal is open. */
  isOpen: boolean;
  /** Called when the modal should close (after any action). */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PasskeySetupPrompt — modal dialog encouraging passkey registration.
 *
 * Renders a friendly prompt with platform-specific biometric messaging.
 * On "Set Up Now", calls `registerNewPasskey()` from the auth context.
 *
 * @example
 * ```tsx
 * <PasskeySetupPrompt isOpen={showPrompt} onClose={() => setShowPrompt(false)} />
 * ```
 */
export function PasskeySetupPrompt({ isOpen, onClose }: PasskeySetupPromptProps) {
  const { registerNewPasskey } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const biometricLabel = getPlatformBiometricLabel();

  // -----------------------------------------------------------------------
  // Focus management
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (isOpen) {
      // Focus the primary button on open
      requestAnimationFrame(() => {
        primaryButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Trap focus within the dialog
  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isRegistering) {
        handleRemindLater();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRegistering]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSetUpNow = useCallback(async () => {
    setIsRegistering(true);
    setRegistrationError(null);

    try {
      await registerNewPasskey();
      setHasRegisteredPasskey();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Passkey registration failed. Please try again.';
      setRegistrationError(message);
    } finally {
      setIsRegistering(false);
    }
  }, [registerNewPasskey, onClose]);

  const handleRemindLater = useCallback(() => {
    setPasskeyPromptState('remind');
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    setPasskeyPromptState('skipped');
    onClose();
  }, [onClose]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <div className="passkey-prompt" role="presentation">
      {/* Backdrop */}
      <div
        className="passkey-prompt__backdrop"
        onClick={isRegistering ? undefined : handleRemindLater}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        ref={panelRef}
        className="passkey-prompt__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-prompt-title"
        aria-describedby="passkey-prompt-description"
      >
        {/* Icon */}
        <div className="passkey-prompt__icon" aria-hidden="true">
          🔐
        </div>

        {/* Title */}
        <h2 id="passkey-prompt-title" className="passkey-prompt__title">
          Secure your account with {biometricLabel}
        </h2>

        {/* Description */}
        <p id="passkey-prompt-description" className="passkey-prompt__description">
          Sign in faster and more securely using {biometricLabel} instead of your password. Your
          biometric data never leaves your device.
        </p>

        {/* Error banner */}
        {registrationError && (
          <div className="passkey-prompt__error" role="alert">
            {registrationError}
          </div>
        )}

        {/* Actions */}
        <div className="passkey-prompt__actions">
          <button
            ref={primaryButtonRef}
            type="button"
            className="passkey-prompt__button passkey-prompt__button--primary"
            onClick={() => {
              void handleSetUpNow();
            }}
            disabled={isRegistering}
            aria-busy={isRegistering}
          >
            {isRegistering ? 'Setting up…' : 'Set Up Now'}
          </button>

          <button
            type="button"
            className="passkey-prompt__button passkey-prompt__button--secondary"
            onClick={handleRemindLater}
            disabled={isRegistering}
          >
            Remind Me Later
          </button>

          <button
            type="button"
            className="passkey-prompt__button passkey-prompt__button--text"
            onClick={handleSkip}
            disabled={isRegistering}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
