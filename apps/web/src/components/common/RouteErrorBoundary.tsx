// SPDX-License-Identifier: BUSL-1.1

import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '../../lib/monitoring';

// ---------------------------------------------------------------------------
// Props & State
// ---------------------------------------------------------------------------

/** Props for the route-level error boundary. */
export interface RouteErrorBoundaryProps {
  /** The route content to render. */
  children: ReactNode;
  /** Human-readable route name used in the fallback UI and error reports. */
  routeName?: string;
}

/** Internal state for the route-level error boundary. */
export interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const INITIAL_STATE: RouteErrorBoundaryState = {
  hasError: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Route-level error boundary that isolates page crashes.
 *
 * When a route component throws during render, this boundary catches the
 * error and displays a scoped fallback UI so the rest of the app (sidebar,
 * navigation) remains usable. The user can retry the current page or
 * navigate away without a full reload.
 */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  private readonly headingRef = createRef<HTMLHeadingElement>();

  public override state: RouteErrorBoundaryState = INITIAL_STATE;

  /** Derive error state from a child render failure. */
  public static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  /** Report the error to monitoring. */
  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const route = this.props.routeName ?? 'unknown';
    const componentStack = errorInfo.componentStack?.trim() || 'Unavailable';

    // eslint-disable-next-line no-console -- dev visibility; captureError below feeds monitoring
    console.error('RouteErrorBoundary caught route error', {
      route,
      error,
      componentStack,
    });

    captureError(error, {
      boundary: 'RouteErrorBoundary',
      route,
      componentStack,
    });
  }

  /** Move focus to the fallback heading when an error is first caught. */
  public override componentDidUpdate(
    _prevProps: Readonly<RouteErrorBoundaryProps>,
    prevState: Readonly<RouteErrorBoundaryState>,
  ): void {
    if (this.state.hasError && !prevState.hasError) {
      this.headingRef.current?.focus();
    }
  }

  /** Reset error state to allow the child tree to re-render. */
  private readonly handleRetry = (): void => {
    this.setState(INITIAL_STATE);
  };

  public override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const routeLabel = this.props.routeName ?? 'This page';

    return (
      <section
        className="route-error-boundary"
        role="alert"
        aria-live="assertive"
        aria-labelledby="route-error-title"
      >
        <div className="route-error-boundary__content">
          <svg
            className="route-error-boundary__icon"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="16" r="0.75" fill="currentColor" />
          </svg>

          <h2
            ref={this.headingRef}
            id="route-error-title"
            className="route-error-boundary__title"
            tabIndex={-1}
          >
            {routeLabel} couldn&apos;t load
          </h2>

          <p className="route-error-boundary__message">
            Something went wrong while loading this page. You can try again or navigate to a
            different section.
          </p>

          {import.meta.env.DEV && this.state.error?.message ? (
            <pre className="route-error-boundary__details">{this.state.error.message}</pre>
          ) : null}

          <div className="route-error-boundary__actions">
            <button
              type="button"
              className="route-error-boundary__btn route-error-boundary__btn--primary"
              onClick={this.handleRetry}
            >
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }
}
