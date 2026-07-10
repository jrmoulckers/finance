// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('renders the error message', () => {
    render(<ErrorBanner message="Something went wrong." />);

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('renders a dismiss button when dismissible', () => {
    const onDismiss = vi.fn();

    render(<ErrorBanner message="Something went wrong." onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('announces the error via an alert role', () => {
    render(<ErrorBanner message="Something went wrong." />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders a retry button that calls onRetry', () => {
    const onRetry = vi.fn();

    render(<ErrorBanner message="Network error" onRetry={onRetry} />);

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorBanner message="Error" />);

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('does not render dismiss button when onDismiss is not provided', () => {
    render(<ErrorBanner message="Error" />);

    expect(screen.queryByRole('button', { name: 'Dismiss error' })).not.toBeInTheDocument();
  });

  it('applies the error-banner CSS class to the root element', () => {
    render(<ErrorBanner message="Error" />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveClass('error-banner');
  });

  it('applies a custom className alongside the default class', () => {
    render(<ErrorBanner message="Error" className="my-custom-class" />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveClass('error-banner');
    expect(banner).toHaveClass('my-custom-class');
  });

  it('does not have inline style attributes (styles are in CSS)', () => {
    render(<ErrorBanner message="Error" onRetry={vi.fn()} onDismiss={vi.fn()} />);

    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('style')).toBeNull();
  });

  it('hides the SVG icon from assistive technology', () => {
    render(<ErrorBanner message="Error" />);

    const banner = screen.getByRole('alert');
    const svg = banner.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('applies BEM CSS classes to child elements', () => {
    render(<ErrorBanner message="Styled" onRetry={vi.fn()} onDismiss={vi.fn()} />);

    const banner = screen.getByRole('alert');
    expect(banner.querySelector('.error-banner__icon')).toBeInTheDocument();
    expect(banner.querySelector('.error-banner__message')).toBeInTheDocument();
    expect(banner.querySelector('.error-banner__retry')).toBeInTheDocument();
    expect(banner.querySelector('.error-banner__dismiss')).toBeInTheDocument();
  });

  it('renders both retry and dismiss buttons together', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(<ErrorBanner message="Both buttons" onRetry={onRetry} onDismiss={onDismiss} />);

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss error' })).toBeInTheDocument();
  });

  it('shows a busy state and disables the control while an async retry is in flight', async () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<ErrorBanner message="Network error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const busyButton = await screen.findByRole('button', { name: 'Retrying…' });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute('aria-busy', 'true');

    resolveRetry?.();

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Retry' });
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'false');
    });
  });

  it('does not fire onRetry again while a retry is already pending', async () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<ErrorBanner message="Network error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('button', { name: 'Retrying…' });
    // A disabled button won't dispatch clicks, but guard the handler regardless.
    fireEvent.click(screen.getByRole('button', { name: 'Retrying…' }));

    expect(onRetry).toHaveBeenCalledTimes(1);

    resolveRetry?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled());
  });

  it('recovers the retry control when a retry rejects', async () => {
    const onRetry = vi.fn(() => Promise.reject(new Error('still failing')));

    render(<ErrorBanner message="Network error" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Retry' });
      expect(button).toBeEnabled();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
