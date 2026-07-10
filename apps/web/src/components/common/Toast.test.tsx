// SPDX-License-Identifier: BUSL-1.1

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast, type ToastOptions } from './Toast';

/** Test helper that renders a button wired to `showToast`. */
function TestConsumer(props: {
  type?: 'success' | 'error' | 'warning' | 'info';
  message?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
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
          action: props.action,
        })
      }
    >
      Show Toast
    </button>
  );
}

/** Test helper that fires a batch of toasts in a single handler. */
function BatchConsumer({ toasts }: { toasts: ToastOptions[] }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => toasts.forEach((t) => showToast(t))}>
      Show All
    </button>
  );
}

/** Read the current text of a canonical announcer live region. */
function announcerText(politeness: 'polite' | 'assertive'): string {
  return document.querySelector(`[data-announcer="${politeness}"]`)?.textContent ?? '';
}

afterEach(() => {
  document.documentElement.removeAttribute('data-reduced-motion');
});

describe('ToastProvider + useToast', () => {
  it('throws when useToast is called outside a provider', () => {
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
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('mounts persistent, empty announcer live regions before any toast is shown', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );

    const polite = document.querySelector('[data-announcer="polite"]');
    const assertive = document.querySelector('[data-announcer="assertive"]');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
  });

  it('announces non-error toasts politely through the shared announcer', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="success" message="Saved" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    await waitFor(() => expect(announcerText('polite')).toBe('Success: Saved'));
  });

  it('announces error toasts assertively through the shared announcer', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="error" message="Failed to save" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    await waitFor(() => expect(announcerText('assertive')).toBe('Error: Failed to save'));
  });

  it('does not put a competing role/aria-label on the visible toast node', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TestConsumer type="success" message="No competing label" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show Toast' }));
    const toastEl = screen.getByText('No competing label').closest('.toast');
    expect(toastEl).not.toBeNull();
    expect(toastEl).not.toHaveAttribute('role');
    expect(toastEl).not.toHaveAttribute('aria-label');
  });

  it('auto-dismisses after the specified duration', () => {
    vi.useFakeTimers();
    try {
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
      // Exit animation then unmount.
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.queryByText('Auto dismiss me')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses the auto-dismiss timer while hovered (WCAG 2.2.1)', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <TestConsumer type="info" message="Hover me" duration={3000} />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
      const toastEl = screen.getByText('Hover me').closest('.toast') as HTMLElement;

      fireEvent.mouseEnter(toastEl);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('Hover me')).toBeInTheDocument();

      fireEvent.mouseLeave(toastEl);
      act(() => {
        vi.advanceTimersByTime(3100);
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByText('Hover me')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses the auto-dismiss timer while focused', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <TestConsumer type="info" message="Focus me" duration={3000} />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
      const toastEl = screen.getByText('Focus me').closest('.toast') as HTMLElement;
      const dismiss = toastEl.querySelector('.toast__dismiss') as HTMLElement;

      fireEvent.focus(toastEl);
      fireEvent.focusIn(dismiss);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('Focus me')).toBeInTheDocument();

      fireEvent.blur(toastEl);
      act(() => {
        vi.advanceTimersByTime(3100);
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByText('Focus me')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps duration:0 toasts until manually dismissed', async () => {
    render(
      <ToastProvider>
        <TestConsumer type="info" message="Dismiss me" duration={0} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument());
  });

  it('caps the number of visible toasts and retires the oldest', () => {
    render(
      <ToastProvider maxToasts={3}>
        <BatchConsumer
          toasts={[1, 2, 3, 4, 5].map((n) => ({
            type: 'info',
            message: `Toast ${n}`,
            duration: 0,
          }))}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));

    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
    expect(screen.getByText('Toast 4')).toBeInTheDocument();
    expect(screen.getByText('Toast 5')).toBeInTheDocument();
  });

  it('coalesces identical type+message toasts', () => {
    render(
      <ToastProvider>
        <BatchConsumer
          toasts={[
            { type: 'error', message: 'Sync failed', duration: 0 },
            { type: 'error', message: 'Sync failed', duration: 0 },
            { type: 'error', message: 'Sync failed', duration: 0 },
          ]}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));
    expect(screen.getAllByText('Sync failed')).toHaveLength(1);
  });

  it('renders an inline action button that runs onClick and dismisses', async () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <TestConsumer
          type="info"
          message="Transaction deleted"
          duration={0}
          action={{ label: 'Undo', onClick: onAction }}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeInTheDocument();

    fireEvent.click(undo);
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Transaction deleted')).not.toBeInTheDocument());
  });

  it('removes instantly (no exit delay) under app-level reduced motion', () => {
    document.documentElement.setAttribute('data-reduced-motion', 'true');
    render(
      <ToastProvider>
        <TestConsumer type="info" message="Instant gone" duration={0} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    expect(screen.getByText('Instant gone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    // No timer advance needed: reduced motion skips the exit animation.
    expect(screen.queryByText('Instant gone')).not.toBeInTheDocument();
  });

  it('renders the toast container with notifications label', () => {
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
    expect(css).toContain('toastExit');
  });
});
