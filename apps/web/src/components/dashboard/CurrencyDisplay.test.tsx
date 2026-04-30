// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMultiCurrency } from '../../hooks/useMultiCurrency';
import type { UseMultiCurrencyResult } from '../../hooks/useMultiCurrency';
import { Currencies } from '../../kmp/bridge';
import type { Currency } from '../../kmp/bridge';
import { CurrencySelector, ExchangeRateIndicator, MultiCurrencyTotals } from './CurrencyDisplay';

vi.mock('../../hooks/useMultiCurrency', () => ({
  useMultiCurrency: vi.fn(),
}));

const mockedHook = vi.mocked(useMultiCurrency);

function mockResult(overrides: Partial<UseMultiCurrencyResult> = {}): UseMultiCurrencyResult {
  return {
    defaultCurrency: Currencies.USD,
    setDefaultCurrency: vi.fn(),
    supportedCurrencies: [Currencies.USD, Currencies.EUR, Currencies.GBP],
    rates: [],
    loading: false,
    error: null,
    lastUpdated: '2025-01-15T10:00:00Z',
    convert: vi.fn((amount: number) => amount),
    formatAmount: vi.fn((amount: number, currency: Currency) =>
      (amount / Math.pow(10, currency.decimalPlaces)).toFixed(currency.decimalPlaces),
    ),
    formatWithSymbol: vi.fn((amount: number, currency: Currency) => {
      const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
      const symbol = symbols[currency.code] ?? currency.code;
      return `${symbol}${(amount / Math.pow(10, currency.decimalPlaces)).toFixed(currency.decimalPlaces)}`;
    }),
    getRate: vi.fn((from: string, to: string) => (from === to ? 1 : 0.92)),
    calculateMultiCurrencyTotal: vi.fn(() => []),
    refreshRates: vi.fn(),
    ...overrides,
  };
}

describe('CurrencySelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHook.mockReturnValue(mockResult());
  });

  it('renders with current value', () => {
    render(<CurrencySelector value="USD" onChange={vi.fn()} />);

    const select = screen.getByLabelText(/select currency/i);
    expect(select).toHaveValue('USD');
  });

  it('renders all supported currencies', () => {
    render(<CurrencySelector value="USD" onChange={vi.fn()} />);

    expect(screen.getByText(/USD/)).toBeInTheDocument();
    expect(screen.getByText(/EUR/)).toBeInTheDocument();
    expect(screen.getByText(/GBP/)).toBeInTheDocument();
  });
});

describe('ExchangeRateIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when from and to are the same', () => {
    mockedHook.mockReturnValue(mockResult());

    const { container } = render(<ExchangeRateIndicator from="USD" to="USD" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows exchange rate', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<ExchangeRateIndicator from="USD" to="EUR" />);

    expect(screen.getByText(/1 USD = 0\.9200 EUR/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockedHook.mockReturnValue(mockResult({ loading: true }));

    render(<ExchangeRateIndicator from="USD" to="EUR" />);

    expect(screen.getByText('Loading rates…')).toBeInTheDocument();
  });

  it('shows unavailable state when rate is null', () => {
    mockedHook.mockReturnValue(mockResult({ getRate: vi.fn(() => null) }));

    render(<ExchangeRateIndicator from="USD" to="EUR" />);

    expect(screen.getByText(/rate unavailable/i)).toBeInTheDocument();
  });
});

describe('MultiCurrencyTotals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no items', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<MultiCurrencyTotals items={[]} />);

    expect(screen.getByText('No items to display.')).toBeInTheDocument();
  });

  it('renders totals with currency breakdown', () => {
    mockedHook.mockReturnValue(
      mockResult({
        calculateMultiCurrencyTotal: vi.fn(() => [
          {
            currency: Currencies.USD,
            totalCents: 15000,
            convertedCents: 15000,
            convertedCurrency: Currencies.USD,
          },
          {
            currency: Currencies.EUR,
            totalCents: 5000,
            convertedCents: 5435,
            convertedCurrency: Currencies.USD,
          },
        ]),
      }),
    );

    render(
      <MultiCurrencyTotals
        items={[
          { amountCents: 15000, currency: Currencies.USD },
          { amountCents: 5000, currency: Currencies.EUR },
        ]}
      />,
    );

    expect(screen.getByText('Multi-Currency Totals')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });
});
