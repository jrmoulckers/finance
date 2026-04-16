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
    expect(screen.getByRole('button', { name: 'Retry loading page' })).toBeInTheDocument();
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

  it('should disable retry button while retrying', () => {
    render(<OfflineFallbackPage />);
    const button = screen.getByRole('button', { name: 'Retry loading page' });

    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByText('Retrying…')).toBeInTheDocument();
  });

  it('should have proper aria-live region for status', () => {
    render(<OfflineFallbackPage pendingCount={3} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
