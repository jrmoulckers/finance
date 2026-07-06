// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';

import { useAccessibilityContext } from '../../contexts/AccessibilityContext';

export interface ReadAloudButtonProps {
  /** Amount in integer cents to speak (e.g., `12345` = $123.45). */
  readonly amount: number;
  /** ISO 4217 currency code (default: `"USD"`). */
  readonly currency?: string;
  /**
   * Short description of what the amount represents
   * (e.g., `"net worth"`, `"remaining in Groceries budget"`).
   *
   * Spoken after the amount and appended to the button's accessible name so
   * each read-aloud control has a unique, meaningful label when several
   * appear on one screen.
   */
  readonly context?: string;
  /** Visible button text (default: `"Read aloud"`). */
  readonly label?: string;
  /** Additional CSS class names for placement/styling. */
  readonly className?: string;
}

/**
 * Opt-in "read aloud" control for a primary financial amount.
 *
 * Renders nothing unless the user has enabled **Read amounts aloud**
 * (Settings → Preferences → Accessibility). When enabled it shows a
 * keyboard-operable, screen-reader-labelled button that speaks the amount via
 * the shared `speakAmount` helper from {@link useAccessibilityContext} — the
 * same utility the Transactions list uses, so the app keeps a single
 * read-aloud implementation rather than a per-page fork (#3278).
 *
 * Accessibility:
 * - Native `<button>` so it is reachable and operable by keyboard.
 * - The accessible name always begins with the visible label and appends
 *   `context`, satisfying WCAG 2.2 §2.5.3 (Label in Name) while giving each
 *   control a unique name (§4.1.2 Name, Role, Value).
 * - The speaker glyph is decorative (`aria-hidden`); meaning is carried by the
 *   text label and border, never colour alone (§1.4.1 Use of Color).
 */
export const ReadAloudButton: FC<ReadAloudButtonProps> = ({
  amount,
  currency = 'USD',
  context,
  label = 'Read aloud',
  className,
}) => {
  const { speakAmounts, speakAmount } = useAccessibilityContext();

  if (!speakAmounts) {
    return null;
  }

  const accessibleName = context ? `${label}: ${context}` : label;
  const buttonClassName = ['read-aloud-button', className].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={() => speakAmount(amount, currency, context)}
      aria-label={accessibleName}
    >
      <svg
        className="read-aloud-button__icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
      <span className="read-aloud-button__label">{label}</span>
    </button>
  );
};

export default ReadAloudButton;
