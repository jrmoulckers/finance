// SPDX-License-Identifier: BUSL-1.1

import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { captureError } from '../../lib/monitoring';
import '../../styles/auth.css';

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

const cardContentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-5)',
} as const;

const fallbackMessageStyle = {
  margin: 0,
  color: 'var(--semantic-text-primary)',
  textAlign: 'center',
} as const;

const detailsStyle = {
  margin: 0,
  padding: 'var(--spacing-3)',
  borderRadius: 'var(--border-radius-md)',
  background: 'var(--color-red-50, #fef2f2)',
  color: 'var(--semantic-status-negative)',
  fontSize: 'var(--type-scale-caption-font-size, 0.875rem)',
  wordBreak: 'break-word',
} as const;

const actionsStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-3)',
} as const;

const secondaryActionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '44px',
  padding: 'var(--spacing-2) var(--spacing-4)',
  border: '1px solid var(--semantic-border-default, #d1d5db)',
  borderRadius: 'var(--border-radius-md)',
  background: 'transparent',
  color: 'var(--semantic-text-primary)',
  textDecoration: 'none',
  fontWeight: 'var(--font-weight-medium)',
} as const;

const sectionTitleStyle = {
  margin: 0,
  fontSize: 'var(--type-scale-title-font-size, 1.125rem)',
  color: 'var(--semantic-text-primary)',
  textAlign: 'center',
} as const;

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
          <div style={cardContentStyle}>
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

            <div role="alert" aria-live="assertive" style={cardContentStyle}>
              {this.props.fallback ?? (
                <p style={fallbackMessageStyle}>
                  An unexpected error interrupted the Finance experience.
                </p>
              )}
              {import.meta.env.DEV && this.state.error?.message ? (
                <p style={detailsStyle}>{this.state.error.message}</p>
              ) : null}
            </div>

            <section aria-labelledby="error-boundary-actions-title" style={actionsStyle}>
              <h2 id="error-boundary-actions-title" style={sectionTitleStyle}>
                What you can do next
              </h2>
              <button type="button" className="auth-submit" onClick={this.handleRetry}>
                Try Again
              </button>
              <Link to="/dashboard" className="auth-footer__link" style={secondaryActionStyle}>
                Return to Dashboard
              </Link>
            </section>
          </div>
        </section>
      </main>
    );
  }
}
