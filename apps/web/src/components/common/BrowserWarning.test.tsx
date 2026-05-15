// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureSupport } from '../../utils/browserCompat';
import { BrowserWarning } from './BrowserWarning';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const missingRequired: FeatureSupport[] = [
  { name: 'WebAssembly', supported: false, required: true },
  { name: 'Service Worker', supported: false, required: true },
];

const missingOptional: FeatureSupport[] = [
  { name: 'CSS Subgrid', supported: false, required: false },
];

const allMissing: FeatureSupport[] = [...missingRequired, ...missingOptional];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserWarning', () => {
  it('renders nothing when no features are missing', () => {
    const { container } = render(<BrowserWarning missingFeatures={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the warning when required features are missing', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    expect(screen.getByText('Your browser may not fully support this app')).toBeInTheDocument();
    expect(screen.getByText('WebAssembly')).toBeInTheDocument();
    expect(screen.getByText('Service Worker')).toBeInTheDocument();
  });

  it('separates required and optional missing features', () => {
    render(<BrowserWarning missingFeatures={allMissing} />);

    const requiredList = screen.getByRole('list', {
      name: 'Missing required browser features',
    });
    const optionalList = screen.getByRole('list', {
      name: 'Missing optional browser features',
    });

    expect(requiredList).toBeInTheDocument();
    expect(optionalList).toBeInTheDocument();
  });

  it('shows browser suggestions', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    expect(screen.getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.getByText('Mozilla Firefox')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Edge')).toBeInTheDocument();
  });

  it('has role="alert" for screen reader announcement', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('has an accessible dismiss button', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    const dismissBtn = screen.getByRole('button', {
      name: 'Dismiss browser warning',
    });
    expect(dismissBtn).toBeInTheDocument();
  });

  it('dismisses the banner and persists to localStorage', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    const dismissBtn = screen.getByRole('button', {
      name: 'Dismiss browser warning',
    });
    fireEvent.click(dismissBtn);

    // Banner should be gone.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Dismiss should be persisted.
    expect(localStorage.getItem('finance-browser-warning-dismissed')).toBe('true');
  });

  it('does not render when previously dismissed', () => {
    localStorage.setItem('finance-browser-warning-dismissed', 'true');

    const { container } = render(<BrowserWarning missingFeatures={missingRequired} />);
    expect(container.innerHTML).toBe('');
  });

  it('applies custom className', () => {
    render(<BrowserWarning missingFeatures={missingRequired} className="custom-class" />);

    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('custom-class');
  });

  it('has aria-label on the banner container', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-label', 'Browser compatibility warning');
  });

  it('opens browser links in new tabs with rel="noopener noreferrer"', () => {
    render(<BrowserWarning missingFeatures={missingRequired} />);

    const chromeLink = screen.getByRole('link', { name: 'Google Chrome' });
    expect(chromeLink).toHaveAttribute('target', '_blank');
    expect(chromeLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('handles localStorage errors gracefully on dismiss', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });

    render(<BrowserWarning missingFeatures={missingRequired} />);

    const dismissBtn = screen.getByRole('button', {
      name: 'Dismiss browser warning',
    });

    // Should not throw — dismisses for the session only.
    expect(() => fireEvent.click(dismissBtn)).not.toThrow();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
