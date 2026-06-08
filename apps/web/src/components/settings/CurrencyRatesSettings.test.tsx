// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseExchangeRatesResult } from '../../hooks/useExchangeRates';

const mockSetOverride = vi.fn();
const mockRemoveOverride = vi.fn();
const mockClearOverrides = vi.fn();
const mockRefresh = vi.fn();
const mockConvert = vi.fn().mockResolvedValue(9200);
const mockGetRate = vi.fn();

const defaultHookResult: UseExchangeRatesResult = {
  rates: {
    EUR: {
      from: 'USD',
      to: 'EUR',
      rate: 0.92,
      timestamp: '2025-01-15T12:00:00.000Z',
      source: 'static',
    },
    GBP: {
      from: 'USD',
      to: 'GBP',
      rate: 0.79,
      timestamp: '2025-01-15T12:00:00.000Z',
      source: 'static',
    },
  },
  loading: false,
  error: null,
  lastUpdated: '2025-01-15T12:00:00.000Z',
  providerName: 'Static Rates',
  isOffline: false,
  convert: mockConvert,
  getRate: mockGetRate,
  setOverride: mockSetOverride,
  removeOverride: mockRemoveOverride,
  overrides: {},
  clearOverrides: mockClearOverrides,
  refresh: mockRefresh,
};

let hookResult = { ...defaultHookResult };

vi.mock('../../hooks/useExchangeRates', () => ({
  useExchangeRates: () => hookResult,
}));

// We need to import AFTER mocking
import { CurrencyRatesSettings } from './CurrencyRatesSettings';

function expandRatesTable(): void {
  fireEvent.click(screen.getByText('Exchange rates'));
}

describe('CurrencyRatesSettings', () => {
  beforeEach(() => {
    hookResult = { ...defaultHookResult };
    vi.clearAllMocks();
  });

  it('renders the section heading', () => {
    render(<CurrencyRatesSettings />);
    expect(screen.getByText('Currency Rates')).toBeInTheDocument();
  });

  it('shows provider name', () => {
    render(<CurrencyRatesSettings />);
    expect(screen.getByText('Static Rates')).toBeInTheDocument();
  });

  it('shows base currency', () => {
    render(<CurrencyRatesSettings />);
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    hookResult = { ...defaultHookResult, loading: true };
    render(<CurrencyRatesSettings />);
    expect(screen.getByText('Loading rates…')).toBeInTheDocument();
  });

  it('renders error state with retry button', () => {
    hookResult = { ...defaultHookResult, error: 'Network error' };
    render(<CurrencyRatesSettings />);
    expect(screen.getByText(/Error loading rates/)).toBeInTheDocument();
    expect(screen.getByLabelText('Retry loading exchange rates')).toBeInTheDocument();
  });

  it('shows source badges for rates', () => {
    render(<CurrencyRatesSettings />);
    expandRatesTable();
    const staticBadges = screen.getAllByText('Static');
    expect(staticBadges.length).toBeGreaterThan(0);
  });

  it('renders override buttons for each currency', () => {
    render(<CurrencyRatesSettings />);
    expandRatesTable();
    const overrideButtons = screen.getAllByText('Override');
    expect(overrideButtons.length).toBeGreaterThan(0);
  });

  it('shows reset button for overridden currencies', () => {
    hookResult = {
      ...defaultHookResult,
      overrides: { 'USD:EUR': 0.95 },
      rates: {
        ...defaultHookResult.rates,
        EUR: { ...defaultHookResult.rates['EUR']!, source: 'user-override', rate: 0.95 },
      },
    };
    render(<CurrencyRatesSettings />);
    expandRatesTable();
    expect(screen.getByLabelText('Reset override for EUR')).toBeInTheDocument();
  });

  it('shows the disclaimer about static rates', () => {
    render(<CurrencyRatesSettings />);
    expect(screen.getByText(/Static rates are approximate/)).toBeInTheDocument();
  });

  it('has proper aria-label on the section', () => {
    render(<CurrencyRatesSettings />);
    expect(screen.getByLabelText('Currency Rates')).toBeInTheDocument();
  });

  it('collapses the rates table by default', () => {
    render(<CurrencyRatesSettings />);
    const disclosure = screen.getByText('Exchange rates').closest('details');
    expect(disclosure).toBeInTheDocument();
    expect(disclosure).not.toHaveAttribute('open');
  });

  it('has proper aria-label on the rates table after expanding', () => {
    render(<CurrencyRatesSettings />);
    expandRatesTable();
    expect(screen.getByRole('table', { name: /Exchange rates from USD/ })).toBeInTheDocument();
  });
});
