// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { MoneyDisplaySettings } from '../../lib/display-settings';
import { MoneyDisplayProvider } from '../../lib/display-settings';
import { CurrencyDisplay } from './CurrencyDisplay';

/** Helper to render with a provider using custom settings. */
function renderWithSettings(ui: React.ReactElement, settings?: Partial<MoneyDisplaySettings>) {
  return render(createElement(MoneyDisplayProvider, { initialSettings: settings }, ui));
}

describe('CurrencyDisplay', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a formatted dollar amount from cents', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: 1234 }));
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('handles a zero amount', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: 0 }));
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('handles a negative amount', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: -1234 }));
    expect(screen.getByText('-$12.34')).toBeInTheDocument();
  });

  it('applies colorize classes for positive and negative amounts', () => {
    const { rerender } = renderWithSettings(
      createElement(CurrencyDisplay, { amount: 2500, colorize: true }),
    );

    expect(screen.getByText('$25.00')).toHaveClass('amount--positive');

    rerender(
      createElement(
        MoneyDisplayProvider,
        null,
        createElement(CurrencyDisplay, { amount: -2500, colorize: true }),
      ),
    );

    expect(screen.getByText('-$25.00')).toHaveClass('amount--negative');
  });

  it('hides decimals when showDecimals is false', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: 1234 }), { showDecimals: false });
    expect(screen.getByText('$12')).toBeInTheDocument();
  });

  it('renders negative amounts in parentheses format', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: -1234 }), {
      negativeFormat: 'parentheses',
    });
    expect(screen.getByText('($12.34)')).toBeInTheDocument();
  });

  it('uses the configured currency display mode', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: 1234 }), {
      currencyDisplay: 'code',
    });
    expect(
      screen.getByText((content) => content.includes('USD') && content.includes('12.34')),
    ).toBeInTheDocument();
  });

  it('renders negative amounts without sign in color-only mode', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: -1234 }), {
      negativeFormat: 'color-only',
    });
    // Visual text has no minus sign
    expect(screen.getByText('$12.34')).toBeInTheDocument();
    // But aria-label still conveys negative for a11y
    expect(screen.getByText('$12.34')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('negative'),
    );
  });

  it('applies color-only class for zero with colorize', () => {
    renderWithSettings(createElement(CurrencyDisplay, { amount: 0, colorize: true }));
    expect(screen.getByText('$0.00')).toHaveClass('amount--zero');
  });

  it('renders without a provider (graceful fallback)', () => {
    // No MoneyDisplayProvider — should use defaults and not crash
    render(createElement(CurrencyDisplay, { amount: 5000 }));
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });
});
