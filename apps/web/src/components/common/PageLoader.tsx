// SPDX-License-Identifier: BUSL-1.1

import type React from 'react';
import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import type { EmptyStateProps } from './EmptyState';
import { ErrorBanner } from './ErrorBanner';
import './page-loader.css';

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

/** Visual states the PageLoader can represent. */
export type PageLoaderState = 'loading' | 'error' | 'empty' | 'loaded';

/** Props for the {@link PageLoader} component. */
export interface PageLoaderProps {
  /** Current state of the page data. */
  state: PageLoaderState;
  /** Skeleton component to render during loading. Falls back to a generic skeleton. */
  skeleton?: ReactNode;
  /** Error message displayed in the error state. */
  errorMessage?: string;
  /** Callback to retry the failed operation (error state). */
  onRetry?: () => void;
  /** Props forwarded to the EmptyState component (empty state). */
  emptyStateProps?: EmptyStateProps;
  /** Content to render when data is loaded. */
  children: ReactNode;
  /** Additional CSS class names on the root container. */
  className?: string;
}

/**
 * Contextual page loader that renders the correct visual state.
 *
 * States:
 * - **loading** — renders a skeleton placeholder (or custom skeleton via props)
 * - **error** — renders an error banner with optional retry button
 * - **empty** — renders an EmptyState with illustration, title, description, CTA
 * - **loaded** — renders the children
 *
 * Uses `aria-live="polite"` so screen readers announce state transitions.
 *
 * @example
 * ```tsx
 * <PageLoader
 *   state={loading ? 'loading' : error ? 'error' : items.length === 0 ? 'empty' : 'loaded'}
 *   skeleton={<AccountsSkeleton />}
 *   errorMessage={error}
 *   onRetry={refresh}
 *   emptyStateProps={{ title: 'No accounts yet', description: 'Create your first account.' }}
 * >
 *   <AccountsList accounts={items} />
 * </PageLoader>
 * ```
 */
export const PageLoader: React.FC<PageLoaderProps> = ({
  state,
  skeleton,
  errorMessage = 'Something went wrong. Please try again.',
  onRetry,
  emptyStateProps,
  children,
  className = '',
}) => {
  return (
    <div
      className={`page-loader ${className}`.trim()}
      aria-live="polite"
      aria-busy={state === 'loading'}
    >
      {state === 'loading' && (
        <div className="page-loader__loading">{skeleton ?? <DefaultSkeleton />}</div>
      )}

      {state === 'error' && (
        <div className="page-loader__error">
          <ErrorBanner message={errorMessage} onRetry={onRetry} />
        </div>
      )}

      {state === 'empty' && (
        <div className="page-loader__empty">
          {emptyStateProps ? (
            <EmptyState {...emptyStateProps} />
          ) : (
            <EmptyState
              title="Nothing here yet"
              description="Get started by adding your first item."
            />
          )}
        </div>
      )}

      {state === 'loaded' && children}
    </div>
  );
};

/**
 * Default generic skeleton fallback when no custom skeleton is provided.
 */
const DefaultSkeleton: React.FC = () => (
  <div
    className="page-loader__default-skeleton"
    aria-busy="true"
    role="status"
    aria-label="Loading page content"
  >
    <div className="page-loader__skeleton-line page-loader__skeleton-line--wide" />
    <div className="page-loader__skeleton-line page-loader__skeleton-line--medium" />
    <div className="page-loader__skeleton-line page-loader__skeleton-line--narrow" />
    <div className="page-loader__skeleton-block" />
    <div className="page-loader__skeleton-line page-loader__skeleton-line--wide" />
    <div className="page-loader__skeleton-line page-loader__skeleton-line--medium" />
  </div>
);

export default PageLoader;
