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

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CashRunwayPage } from './CashRunwayPage';
import { useAccounts } from '../hooks/useAccounts';
import { useExchangeRates, type UseExchangeRatesResult } from '../hooks/useExchangeRates';
import { useRemittances } from '../hooks/useRemittances';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import type { Account } from '../kmp/bridge';
import type { RemittanceRecord } from '../lib/remittance';

vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));
vi.mock('../hooks/useBills', () => ({ useBills: () => ({ bills: [] }) }));
vi.mock('../hooks/useInvoices', () => ({ useInvoices: () => ({ invoices: [] }) }));
vi.mock('../hooks/useRemittances', () => ({ useRemittances: vi.fn(() => ({ remittances: [] })) }));
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
const mockedUseRemittances = vi.mocked(useRemittances);

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

// ---------------------------------------------------------------------------
// Scheduled supplier remittances (#3244) and workspace filter (#3242)
// ---------------------------------------------------------------------------

/** ISO date `days` from today, matching the page's `todayIsoDate` anchor. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function businessAccount(id: string, amountCents: number): Account {
  return { ...cashAccount(id, 'USD', 2, amountCents), purpose: 'business' };
}

function recurringRemittance(overrides: Partial<RemittanceRecord> = {}): RemittanceRecord {
  return {
    id: 'rem-1',
    date: isoOffset(0),
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    sendAmountMinor: 50_000,
    feeMinor: 0,
    fxRate: 17,
    feeModel: 'INCLUSIVE',
    referenceRate: null,
    recipient: { name: 'Fabrica Supplier', country: 'MX' },
    note: null,
    createdAt: '2025-01-01T00:00:00Z',
    recurrence: { frequency: 'monthly', nextDate: isoOffset(3) },
    ...overrides,
  };
}

describe('CashRunwayPage scheduled remittances and workspace filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseExchangeRates.mockReturnValue({ ...baseRatesResult, rates: {} });
    mockedUseRemittances.mockReturnValue({ remittances: [] } as ReturnType<typeof useRemittances>);
  });

  it('includes recurring supplier remittances as scheduled outflows (#3244)', () => {
    mockAccounts([cashAccount('usd', 'USD', 2, 500000)]);
    mockedUseRemittances.mockReturnValue({
      remittances: [recurringRemittance()],
    } as ReturnType<typeof useRemittances>);

    render(<CashRunwayPage />);

    expect(screen.getAllByText('Fabrica Supplier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Supplier remittance').length).toBeGreaterThan(0);
  });

  it('excludes remittances and business accounts from the personal workspace (#3242)', () => {
    mockAccounts([businessAccount('biz', 500000)]);
    mockedUseRemittances.mockReturnValue({
      remittances: [recurringRemittance()],
    } as ReturnType<typeof useRemittances>);

    render(<CashRunwayPage />);
    // Default "All" workspace shows the scheduled supplier remittance.
    expect(screen.getAllByText('Fabrica Supplier').length).toBeGreaterThan(0);

    // Switching to the personal workspace drops the business remittance.
    fireEvent.click(screen.getByRole('button', { name: /Personal/ }));
    expect(screen.queryByText('Fabrica Supplier')).not.toBeInTheDocument();
  });
});
