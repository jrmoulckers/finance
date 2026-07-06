// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessible disclosure shown next to an aggregate total that has been
 * converted into the user's chosen display currency.
 *
 * Accessibility (WCAG 2.2 AA):
 *   - Information is conveyed by TEXT + ICON SHAPE, never colour alone.
 *   - The element is a live region (`role="status"` / `aria-live="polite"`) so
 *     screen readers announce when a total becomes converted or its rates go
 *     stale/offline.
 *   - Icons are decorative (`aria-hidden`); the visible text carries meaning.
 *
 * References: issue #2203
 */

import React from 'react';

import './converted-total-indicator.css';

export interface ConvertedTotalIndicatorProps {
  /** The currency the total is presented in. */
  readonly displayCurrency: string;
  /** Whether the total includes amounts converted from another currency. */
  readonly isConverted: boolean;
  /** Whether the underlying rates came from an expired cache snapshot. */
  readonly isStale?: boolean;
  /** Whether rate requests degraded due to connectivity. */
  readonly isOffline?: boolean;
  /** Source currencies that were converted into {@link displayCurrency}. */
  readonly convertedCurrencies?: readonly string[];
  /** Source currencies that could not be converted (no rate available). */
  readonly unconvertedCurrencies?: readonly string[];
  /** Additional class names. */
  readonly className?: string;
}

/** Decorative two-way conversion glyph. */
const ConvertGlyph: React.FC = () => (
  <svg
    className="converted-total-indicator__icon"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M7 7h11l-3-3M17 17H6l3 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Decorative warning glyph used for stale/offline rates. */
const WarningGlyph: React.FC = () => (
  <svg
    className="converted-total-indicator__icon"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12 3l9 16H3L12 3z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </svg>
);

/**
 * Renders an accessible "converted" disclosure. Returns `null` when nothing was
 * converted, so callers can render it unconditionally next to a total.
 */
export const ConvertedTotalIndicator: React.FC<ConvertedTotalIndicatorProps> = ({
  displayCurrency,
  isConverted,
  isStale = false,
  isOffline = false,
  convertedCurrencies,
  unconvertedCurrencies,
  className = '',
}) => {
  if (!isConverted) return null;

  const stale = isStale || isOffline;
  const fromList =
    convertedCurrencies && convertedCurrencies.length > 0 ? convertedCurrencies.join(', ') : null;

  const convertedText = fromList
    ? `Converted ${fromList} to ${displayCurrency}`
    : `Converted to ${displayCurrency}`;

  const staleText = isOffline
    ? 'Rates may be stale (offline)'
    : stale
      ? 'Rates may be stale'
      : null;

  const unconvertedText =
    unconvertedCurrencies && unconvertedCurrencies.length > 0
      ? `${unconvertedCurrencies.join(', ')} not converted (no rate available)`
      : null;

  const label = [`${convertedText}.`, staleText ? `${staleText}.` : null, unconvertedText]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={`converted-total-indicator${stale ? ' converted-total-indicator--stale' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <ConvertGlyph />
      <span className="converted-total-indicator__text">{convertedText}</span>
      {staleText ? (
        <span className="converted-total-indicator__stale">
          <WarningGlyph />
          <span className="converted-total-indicator__text">{staleText}</span>
        </span>
      ) : null}
      {unconvertedText ? (
        <span className="converted-total-indicator__unconverted">{unconvertedText}</span>
      ) : null}
    </span>
  );
};

export default ConvertedTotalIndicator;
