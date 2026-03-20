// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const captureErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/monitoring', () => ({
  captureError: captureErrorMock,
}));

/** Render the boundary within a router for fallback navigation links. */
function renderBoundary(children: ReactNode) {
  return render(
    <MemoryRouter>
      <ErrorBoundary>{children}</ErrorBoundary>
    </MemoryRouter>,
  );
}

/** Throw during render to exercise the error boundary recovery path. */
function ThrowError({ message = 'Boom' }: { message?: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureErrorMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    renderBoundary(<div>Healthy content</div>);

    expect(screen.getByText('Healthy content')).toBeInTheDocument();
  });

  it('shows fallback UI when a child throws', () => {
    renderBoundary(<ThrowError message="Render failure" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByText('Render failure')).toBeInTheDocument();
  });

  it('resets error state when retry is clicked', () => {
    let shouldThrow = true;

    function RecoverableChild() {
      if (shouldThrow) {
        throw new Error('Transient failure');
      }

      return <div>Recovered content</div>;
    }

    renderBoundary(<RecoverableChild />);

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).not.toBeInTheDocument();
  });

  it('calls monitoring captureError when a child throws', () => {
    renderBoundary(<ThrowError message="Tracked failure" />);

    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Tracked failure' }),
      expect.objectContaining({
        boundary: 'AppErrorBoundary',
        componentStack: expect.any(String),
      }),
    );
  });
});
