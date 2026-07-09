// SPDX-License-Identifier: BUSL-1.1

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './Toast';

/** Test helper that renders a button wired to `showToast`. */
function TestConsumer(props: {
  type?: 'success' | 'error' | 'warning' | 'info';
  message?: string;
  duration?: number;
}) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        showToast({
          type: props.type ?? 'info',
          message: props.message ?? 'Test message',
          duration: props.duration ?? 5000,
        })
      }
    >
      Show Toast
    </button>
  );
}

describe('ToastProvider + useToast', () => {
  it('throws when useToast is called outside a provider', () => {
    // Suppress React error boundary console noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });

  it('renders a toast on showToast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="success" message="Account created!" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Account created!')).toBeInTheDocument();
  });

  it('announces error toasts via the assertive live region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="error" message="Failed to save" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Error: Failed to save');
    // The visible toast itself is presentational (no competing live region).
    expect(screen.getByText('Failed to save')).toBeInTheDocument();
  });

  it('announces success toasts via the polite live region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="success" message="Saved" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByRole('status')).toHaveTextContent('Success: Saved');
    // Visible message and severity label are still rendered.
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('announces info toasts via the polite live region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="info" message="FYI" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByRole('status')).toHaveTextContent('Info: FYI');
  });

  it('mounts the live regions empty before any toast is shown', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    // Regions must pre-exist (and be empty) so later text changes are announced.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('auto-dismisses after the specified duration', () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <TestConsumer type="info" message="Auto dismiss me" duration={3000} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Auto dismiss me')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.queryByText('Auto dismiss me')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('can manually dismiss a toast', () => {
    render(
      <ToastProvider>
        <TestConsumer type="info" message="Dismiss me" duration={0} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('renders the toast container with notifications label', async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('documents app-level reduced-motion and forced-colors fallbacks', () => {
    const css = readFileSync(resolve(__dirname, './toast.css'), 'utf-8');
    expect(css).toContain("html[data-reduced-motion='true'] .toast");
    expect(css).toContain('forced-colors: active');
  });
});
