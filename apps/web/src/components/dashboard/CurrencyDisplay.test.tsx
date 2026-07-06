// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMultiCurrency } from '../../hooks/useMultiCurrency';
import type { UseMultiCurrencyResult } from '../../hooks/useMultiCurrency';
import { Currencies } from '../../kmp/bridge';
import type { Currency } from '../../kmp/bridge';
import { getCurrentLocale } from '../../lib/i18n';
import { CurrencySelector, ExchangeRateIndicator, MultiCurrencyTotals } from './CurrencyDisplay';

vi.mock('../../hooks/useMultiCurrency', () => ({
  useMultiCurrency: vi.fn(),
}));

// Keep the real catalog + translate(); only steer which locale is active so we
// can assert the dashboard chrome resolves from the i18n catalog per locale.
vi.mock('../../lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/i18n')>();
  return { ...actual, getCurrentLocale: vi.fn(() => 'en-US') };
});

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

  it('labels the rate as an approximate offline reference, not a live "updated now" quote', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<ExchangeRateIndicator from="USD" to="EUR" />);

    expect(screen.getByText(/approximate rate/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Updated:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Source: Static rates/)).not.toBeInTheDocument();
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

describe('CurrencyDisplay resolves dashboard chrome from the i18n catalog (issue #3306)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Active locale drives which catalog translate() resolves.
    vi.mocked(getCurrentLocale).mockReturnValue('es-ES');
  });

  afterEach(() => {
    vi.mocked(getCurrentLocale).mockReturnValue('en-US');
  });

  it('translates the currency selector label and select aria-label', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<CurrencySelector value="USD" onChange={vi.fn()} />);

    expect(screen.getByText('Moneda')).toBeInTheDocument();
    expect(screen.getByLabelText(/seleccionar moneda/i)).toBeInTheDocument();
    // The previously-hardcoded English aria-label must no longer appear.
    expect(screen.queryByLabelText(/select currency/i)).not.toBeInTheDocument();
  });

  it('translates the exchange-rate loading string', () => {
    mockedHook.mockReturnValue(mockResult({ loading: true }));

    render(<ExchangeRateIndicator from="USD" to="EUR" />);

    expect(screen.getByText('Cargando tipos…')).toBeInTheDocument();
    expect(screen.queryByText('Loading rates…')).not.toBeInTheDocument();
  });

  it('translates the exchange-rate offline-reference disclaimer', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<ExchangeRateIndicator from="USD" to="EUR" />);

    expect(screen.getByText(/tipo aproximado/i)).toBeInTheDocument();
  });

  it('translates the multi-currency totals title and empty state', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<MultiCurrencyTotals items={[]} />);

    expect(screen.getByText('Totales multidivisa')).toBeInTheDocument();
    expect(screen.getByText('No hay elementos para mostrar.')).toBeInTheDocument();
    expect(screen.queryByText('No items to display.')).not.toBeInTheDocument();
  });
});
