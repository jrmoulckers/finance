// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessibility-focused tests for ConvertedTotalIndicator.
 *
 * References: issue #2203
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConvertedTotalIndicator } from './ConvertedTotalIndicator';

describe('ConvertedTotalIndicator', () => {
  it('renders nothing when no conversion occurred', () => {
    const { container } = render(
      <ConvertedTotalIndicator displayCurrency="USD" isConverted={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('announces the converted state via a live region with descriptive text', () => {
    render(
      <ConvertedTotalIndicator
        displayCurrency="USD"
        isConverted
        convertedCurrencies={['EUR', 'MXN']}
      />,
    );

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    // Information is carried by text, not colour alone.
    expect(region.textContent).toContain('Converted EUR, MXN to USD');
    expect(region.getAttribute('aria-label')).toContain('Converted EUR, MXN to USD');
  });

  it('communicates stale/offline rates with text (not colour alone)', () => {
    render(
      <ConvertedTotalIndicator
        displayCurrency="USD"
        isConverted
        convertedCurrencies={['EUR']}
        isOffline
      />,
    );

    expect(screen.getByText('Rates may be stale (offline)')).toBeTruthy();
    const region = screen.getByRole('status');
    expect(region.className).toContain('converted-total-indicator--stale');
  });

  it('reports currencies that could not be converted', () => {
    render(
      <ConvertedTotalIndicator displayCurrency="USD" isConverted unconvertedCurrencies={['ZZZ']} />,
    );

    expect(screen.getByText(/ZZZ not converted/)).toBeTruthy();
  });
});
