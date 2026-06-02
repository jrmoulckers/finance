// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteErrorBoundary } from './RouteErrorBoundary';

const captureErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/monitoring', () => ({
  captureError: captureErrorMock,
}));

/** Throw during render to trigger the error boundary. */
function ThrowError({ message = 'Route crash' }: { message?: string }): never {
  throw new Error(message);
}

describe('RouteErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureErrorMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <RouteErrorBoundary routeName="Accounts">
        <div>Page content</div>
      </RouteErrorBoundary>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('shows route-specific fallback when a child throws', () => {
    render(
      <RouteErrorBoundary routeName="Accounts">
        <ThrowError message="Account render failure" />
      </RouteErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /accounts couldn't load/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('uses generic label when routeName is not provided', () => {
    render(
      <RouteErrorBoundary>
        <ThrowError />
      </RouteErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: /this page couldn't load/i }),
    ).toBeInTheDocument();
  });

  it('recovers after retry when the error is transient', () => {
    let shouldThrow = true;

    function RecoverableChild() {
      if (shouldThrow) {
        throw new Error('Transient route failure');
      }

      return <div>Recovered route</div>;
    }

    render(
      <RouteErrorBoundary routeName="Dashboard">
        <RecoverableChild />
      </RouteErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered route')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports error to monitoring with route context', () => {
    render(
      <RouteErrorBoundary routeName="Budgets">
        <ThrowError message="Budget crash" />
      </RouteErrorBoundary>,
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'RouteErrorBoundary caught route error',
      expect.objectContaining({
        route: 'Budgets',
        error: expect.objectContaining({ message: 'Budget crash' }),
        componentStack: expect.any(String),
      }),
    );
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Budget crash' }),
      expect.objectContaining({
        boundary: 'RouteErrorBoundary',
        route: 'Budgets',
        componentStack: expect.any(String),
      }),
    );
  });

  it('shows error details in dev mode', () => {
    render(
      <RouteErrorBoundary routeName="Goals">
        <ThrowError message="Dev-visible error" />
      </RouteErrorBoundary>,
    );

    // In test mode (import.meta.env.DEV === true), error details are shown
    expect(screen.getByText('Dev-visible error')).toBeInTheDocument();
  });
});
