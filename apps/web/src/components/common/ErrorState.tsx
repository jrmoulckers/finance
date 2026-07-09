// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import './error-state.css';

/** Heading levels permitted for the {@link ErrorState} title. */
export type ErrorStateHeadingLevel = 2 | 3 | 4 | 5 | 6;

/** Props for the {@link ErrorState} component. */
export interface ErrorStateProps {
  /** Optional decorative icon rendered above the title. */
  icon?: React.ReactNode;
  /** Short, human-readable summary of what failed. */
  title: string;
  /** Optional supporting detail or recovery guidance. */
  description?: string;
  /** Called when the user activates the retry affordance. */
  onRetry?: () => void;
  /** Label for the retry button. @default 'Try again' */
  retryLabel?: string;
  /** Label shown while a retry is in flight. @default 'Retrying…' */
  retryingLabel?: string;
  /** When `true`, the retry button is disabled and marked `aria-busy`. */
  retrying?: boolean;
  /** Optional secondary action rendered next to (or instead of) retry. */
  action?: React.ReactNode;
  /** Heading level for the title, for correct document outline. @default 2 */
  headingLevel?: ErrorStateHeadingLevel;
  /** Additional CSS class names. */
  className?: string;
}

/** Default error icon: a circled exclamation mark. */
const DEFAULT_ICON: React.ReactNode = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <line
      x1="12"
      y1="7"
      x2="12"
      y2="13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </svg>
);

/**
 * Section-level error state with an optional retry affordance.
 *
 * Bridges the gap between the inline {@link ErrorBanner} and the full-page
 * {@link ErrorBoundary} crash screen: use it when a page or section fails to
 * load and should present a centered message plus recovery action. Mirrors the
 * `EmptyState` API so screens have a consistent failure-with-recovery pattern.
 *
 * Announces via `role="alert"`. When `retrying` is `true`, the retry button is
 * disabled, its label swaps to `retryingLabel`, and `aria-busy` is set so
 * assistive technology announces the in-progress retry.
 *
 * @example
 * ```tsx
 * const load = useAsyncAction(fetchBudgets);
 * <ErrorState
 *   title="Couldn't load budgets"
 *   description="Check your connection and try again."
 *   onRetry={() => load.run()}
 *   retrying={load.isPending}
 * />
 * ```
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  icon,
  title,
  description,
  onRetry,
  retryLabel = 'Try again',
  retryingLabel = 'Retrying…',
  retrying = false,
  action,
  headingLevel = 2,
  className = '',
}) => {
  const Heading = `h${headingLevel}` as const;
  const resolvedIcon = icon ?? DEFAULT_ICON;

  return (
    <section className={`error-state ${className}`.trim()} role="alert">
      {resolvedIcon && (
        <div className="error-state__icon" aria-hidden="true">
          {resolvedIcon}
        </div>
      )}
      <Heading className="error-state__title">{title}</Heading>
      {description && <p className="error-state__description">{description}</p>}
      {(onRetry || action) && (
        <div className="error-state__actions">
          {onRetry && (
            <button
              type="button"
              className="error-state__retry"
              onClick={onRetry}
              disabled={retrying}
              aria-busy={retrying}
            >
              {retrying ? retryingLabel : retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </section>
  );
};

export default ErrorState;
