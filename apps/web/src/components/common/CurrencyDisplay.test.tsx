// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CurrencyDisplay } from './CurrencyDisplay';

describe('CurrencyDisplay', () => {
  it('renders a formatted dollar amount from cents', () => {
    render(<CurrencyDisplay amount={1234} />);

    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('handles a zero amount', () => {
    render(<CurrencyDisplay amount={0} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('handles a negative amount', () => {
    render(<CurrencyDisplay amount={-1234} />);

    expect(screen.getByText('-$12.34')).toBeInTheDocument();
  });

  it('applies colorize classes for positive and negative amounts', () => {
    const { rerender } = render(<CurrencyDisplay amount={2500} colorize={true} />);

    expect(screen.getByText('$25.00')).toHaveClass('amount--positive');

    rerender(<CurrencyDisplay amount={-2500} colorize={true} />);

    expect(screen.getByText('-$25.00')).toHaveClass('amount--negative');
  });
});
