// SPDX-License-Identifier: BUSL-1.1

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

  it('uses role="alert" for error toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="error" message="Failed to save" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('uses role="status" for success toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="success" message="Saved" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('uses role="status" for info toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="info" message="FYI" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
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
});
