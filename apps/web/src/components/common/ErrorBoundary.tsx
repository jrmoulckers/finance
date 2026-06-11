// SPDX-License-Identifier: BUSL-1.1

import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '../../lib/monitoring';
import '../../styles/auth.css';
import './error-boundary.css';

/** Props for the application error boundary. */
export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/** Internal state for the application error boundary. */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const INITIAL_STATE: ErrorBoundaryState = {
  hasError: false,
  error: null,
};

/**
 * Catch rendering errors anywhere in the application tree and present
 * a recovery experience that keeps users oriented.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private readonly headingRef = createRef<HTMLHeadingElement>();

  public override state: ErrorBoundaryState = INITIAL_STATE;

  /** Update the boundary state when a child render fails. */
  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /** Capture the error for monitoring without exposing sensitive data. */
  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureError(error, {
      boundary: 'AppErrorBoundary',
      componentStack: errorInfo.componentStack?.trim() || 'Unavailable',
    });
  }

  /** Move focus to the fallback heading after an unrecoverable render error. */
  public override componentDidUpdate(
    _prevProps: Readonly<ErrorBoundaryProps>,
    prevState: Readonly<ErrorBoundaryState>,
  ): void {
    if (this.state.hasError && !prevState.hasError) {
      this.headingRef.current?.focus();
    }
  }

  /** Reset the boundary state and reload the current route. */
  private readonly handleRetry = (): void => {
    this.setState(INITIAL_STATE, () => {
      if (import.meta.env.MODE !== 'test') {
        window.location.reload();
      }
    });
  };

  /** Render either the child tree or the recovery UI. */
  public override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="error-boundary-title">
          <div className="error-boundary__content">
            <header className="auth-brand">
              <h1
                ref={this.headingRef}
                id="error-boundary-title"
                className="auth-brand__name"
                tabIndex={-1}
              >
                Something went wrong
              </h1>
              <p className="auth-brand__tagline">
                We couldn&apos;t load this screen. Try refreshing the app or head back to your
                dashboard.
              </p>
            </header>

            <div role="alert" aria-live="assertive" className="error-boundary__content">
              {this.props.fallback ?? (
                <p className="error-boundary__message">
                  An unexpected error interrupted the Finance experience.
                </p>
              )}
              {import.meta.env.DEV && this.state.error?.message ? (
                <p className="error-boundary__details">{this.state.error.message}</p>
              ) : null}
            </div>

            <section
              aria-labelledby="error-boundary-actions-title"
              className="error-boundary__actions"
            >
              <h2 id="error-boundary-actions-title" className="error-boundary__actions-title">
                What you can do next
              </h2>
              <button type="button" className="auth-submit" onClick={this.handleRetry}>
                Try Again
              </button>
              <a href="/dashboard" className="auth-footer__link error-boundary__secondary-action">
                Return to Dashboard
              </a>
            </section>
          </div>
        </section>
      </main>
    );
  }
}
