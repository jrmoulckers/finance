// SPDX-License-Identifier: BUSL-1.1

/**
 * Integration test for the multi-currency Cash Runway fix (#3240).
 *
 * Starting cash previously summed each account's raw minor units regardless of
 * currency, so a USD $2,000 balance plus an INR ₹40,000 balance rendered as
 * "$42,000.00" (200000 + 4000000 cents) — a meaningless figure. The page now
 * routes every currency-bearing balance through the shared display-currency
 * rollup BEFORE summing, so the same portfolio must render the *converted*
 * total (~$2,500.00) and disclose the conversion.
 *
 * The real `useDisplayCurrencyRollup` runs here (only its data sources —
 * `useDisplayCurrency` and `useExchangeRates` — are mocked) so the actual
 * conversion math is exercised end-to-end, matching the #3514 net-worth pattern.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CashRunwayPage } from './CashRunwayPage';
import { useAccounts } from '../hooks/useAccounts';
import { useExchangeRates, type UseExchangeRatesResult } from '../hooks/useExchangeRates';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import type { Account } from '../kmp/bridge';

vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));
vi.mock('../hooks/useBills', () => ({ useBills: () => ({ bills: [] }) }));
vi.mock('../hooks/useInvoices', () => ({ useInvoices: () => ({ invoices: [] }) }));
vi.mock('../hooks/useLocalePreferences', () => ({
  useLocalePreferences: () => ({ locale: 'en-US' }),
}));
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

// Data sources consumed by the REAL useDisplayCurrencyRollup. Mocking these (not
// the rollup itself) keeps the conversion math under test.
vi.mock('../hooks/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    displayCurrency: 'USD',
    setDisplayCurrency: vi.fn(),
    supportedCurrencies: [],
  }),
}));
vi.mock('../hooks/useExchangeRates', () => ({ useExchangeRates: vi.fn() }));

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseExchangeRates = vi.mocked(useExchangeRates);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function cashAccount(
  id: string,
  code: string,
  decimalPlaces: number,
  amountCents: number,
): Account {
  return {
    id,
    householdId: 'household-1',
    name: `${code} account`,
    type: 'CHECKING',
    currency: { code, decimalPlaces },
    currentBalance: { amount: amountCents },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...syncMetadata,
  };
}

function mockAccounts(accounts: Account[]): void {
  mockedUseAccounts.mockReturnValue({
    accounts,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  });
}

const baseRatesResult: UseExchangeRatesResult = {
  rates: {},
  loading: false,
  error: null,
  lastUpdated: '2025-01-15T00:00:00Z',
  providerName: 'test',
  isOffline: false,
  isStale: false,
  hasManualOverrides: false,
  convert: vi.fn(),
  getRate: vi.fn(),
  setOverride: vi.fn(),
  removeOverride: vi.fn(),
  overrides: {},
  clearOverrides: vi.fn(),
  refresh: vi.fn(),
};

// 1 USD = 80 INR. The engine inverts this to convert INR balances back to USD.
const usdToInr = {
  from: 'USD',
  to: 'INR',
  rate: 80,
  timestamp: '2025-01-15T00:00:00Z',
  source: 'static' as const,
};

describe('CashRunwayPage multi-currency starting cash (#3240)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseExchangeRates.mockReturnValue({
      ...baseRatesResult,
      rates: { INR: usdToInr },
    });
  });

  it('exposes a labelled read-aloud control for the minimum projected balance when "Read amounts aloud" is enabled (#3278)', () => {
    mockAccounts([cashAccount('usd', 'USD', 2, 200000)]);

    render(
      <AccessibilityProvider initialSettings={{ speakAmounts: true }}>
        <CashRunwayPage />
      </AccessibilityProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Read aloud: minimum projected balance' }),
    ).toBeInTheDocument();
  });

  it('converts each cash balance into the display currency before summing', () => {
    // USD $2,000 (200000 cents) + INR ₹40,000 (4000000 minor units).
    mockAccounts([cashAccount('usd', 'USD', 2, 200000), cashAccount('inr', 'INR', 2, 4000000)]);

    render(<CashRunwayPage />);

    // ₹40,000 / 80 = $500 → $2,000 + $500 = $2,500.00 (converted, correct).
    expect(screen.getAllByText('$2,500.00').length).toBeGreaterThan(0);
    // The pre-fix bug summed raw minor units → $42,000.00. Must never appear.
    expect(screen.queryByText('$42,000.00')).not.toBeInTheDocument();

    // The conversion is disclosed to the user.
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/Converted INR to USD/);
  });

  it('excludes balances with no available rate and discloses them', () => {
    // JPY has no rate to USD, so it must be excluded from the total (not summed
    // in its own incomparable minor units) and surfaced in the disclosure.
    mockAccounts([
      cashAccount('usd', 'USD', 2, 200000),
      cashAccount('inr', 'INR', 2, 4000000),
      cashAccount('jpy', 'JPY', 0, 100000),
    ]);

    render(<CashRunwayPage />);

    // Total still reflects only the convertible balances: $2,000 + $500.
    expect(screen.getAllByText('$2,500.00').length).toBeGreaterThan(0);

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/Excluded JPY — no exchange rate available\./);
  });
});
