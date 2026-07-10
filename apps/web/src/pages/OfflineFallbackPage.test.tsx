// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the OfflineFallbackPage component.
 *
 * References: issue #915
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { OfflineFallbackPage } from './OfflineFallbackPage';

describe('OfflineFallbackPage', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
  });

  it('should render the offline message', () => {
    render(<OfflineFallbackPage />);

    expect(screen.getByText("You're Offline")).toBeInTheDocument();
    expect(screen.getByText(/This page isn't available offline yet/)).toBeInTheDocument();
  });

  it('should have a main landmark', () => {
    render(<OfflineFallbackPage />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should have an accessible main label', () => {
    render(<OfflineFallbackPage />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Offline');
  });

  it('should show retry button', () => {
    render(<OfflineFallbackPage />);
    expect(screen.getByRole('button', { name: 'Try loading the page again' })).toBeInTheDocument();
  });

  it('should render a secondary link to the dashboard', () => {
    render(<OfflineFallbackPage />);
    const link = screen.getByRole('link', { name: /go to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('should display pending count when provided', () => {
    render(<OfflineFallbackPage pendingCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/pending changes saved locally/)).toBeInTheDocument();
  });

  it('should use singular form for 1 pending change', () => {
    render(<OfflineFallbackPage pendingCount={1} />);
    expect(screen.getByText(/pending change saved locally/)).toBeInTheDocument();
  });

  it('should not show pending status when count is 0', () => {
    render(<OfflineFallbackPage pendingCount={0} />);
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument();
  });

  it('should surface a "still offline" notice instead of reloading while offline', () => {
    render(<OfflineFallbackPage />);
    const button = screen.getByRole('button', { name: 'Try loading the page again' });

    fireEvent.click(button);

    // Still offline: the button must not enter the reloading state.
    expect(button).not.toBeDisabled();
    expect(screen.getByText(/Still offline/)).toBeInTheDocument();
  });

  it('should enter the reloading state when retried while online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    render(<OfflineFallbackPage />);
    const button = screen.getByRole('button', { name: 'Reload the page' });

    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByText('Reloading…')).toBeInTheDocument();
  });

  it('should have proper aria-live region for status', () => {
    render(<OfflineFallbackPage pendingCount={3} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
