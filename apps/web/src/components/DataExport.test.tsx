// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataExport } from './DataExport';
import {
  buildInvestmentCsvFiles,
  buildInvestmentExportSheets,
  buildInvestmentXlsx,
  type InvestmentExportInput,
} from '../lib/export/investment-export';
import type { SqliteDb } from '../db/sqlite-wasm';
import { DatabaseContext, type DatabaseContextValue } from '../db/DatabaseProvider';
import type { Investment, InvestmentLot } from '../kmp/bridge';

function createMockDb(): SqliteDb {
  return {
    exec: vi.fn(),
    close: vi.fn(),
  } as unknown as SqliteDb;
}

vi.mock('../db/repositories/accounts', () => ({
  getAllAccounts: vi.fn(() => [
    {
      id: 'acc-1',
      householdId: 'hh-1',
      ownerId: 'owner-1',
      name: 'Checking',
      type: 'CHECKING',
      currency: { code: 'USD', symbol: '$', name: 'US Dollar' },
      currentBalance: { amount: 100000 },
      isArchived: false,
      sortOrder: 0,
      icon: null,
      color: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

vi.mock('../db/repositories/transactions', () => ({
  getAllTransactions: vi.fn(() => [
    {
      id: 'txn-1',
      householdId: 'hh-1',
      ownerId: 'owner-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      status: 'CLEARED',
      amount: { amount: -6742 },
      currency: { code: 'USD', symbol: '$', name: 'US Dollar' },
      payee: 'Grocery Store',
      note: null,
      date: '2024-03-06',
      transferAccountId: null,
      transferTransactionId: null,
      isRecurring: false,
      recurringRuleId: null,
      tags: ['food'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

vi.mock('../db/repositories/budgets', () => ({ getAllBudgets: vi.fn(() => []) }));
vi.mock('../db/repositories/goals', () => ({ getAllGoals: vi.fn(() => []) }));
vi.mock('../db/repositories/bills', () => ({ getAllBills: vi.fn(() => []) }));
vi.mock('../db/repositories/investments', () => ({ getAllInvestments: vi.fn(() => []) }));
vi.mock('../db/repositories/investment-lots', () => ({ getLotsByInvestment: vi.fn(() => []) }));
vi.mock('../db/repositories/household', () => ({
  getHouseholdById: vi.fn(() => ({ id: 'hh-1', name: 'Home', ownerId: 'owner-1' })),
  getHouseholdMembers: vi.fn(() => []),
  getHouseholdInvitations: vi.fn(() => []),
  getAccountSharings: vi.fn(() => []),
  getSharedBudgets: vi.fn(() => []),
  getBudgetContributions: vi.fn(() => []),
  getSharedGoals: vi.fn(() => []),
  getGoalContributions: vi.fn(() => []),
}));
vi.mock('../db/repositories/categories', () => ({
  getAllCategories: vi.fn(() => [
    {
      id: 'cat-1',
      householdId: 'hh-1',
      ownerId: 'owner-1',
      name: 'Food',
      icon: null,
      color: null,
      parentId: null,
      isIncome: false,
      isSystem: false,
      sortOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createInvestmentExportInput(): InvestmentExportInput {
  const investment = {
    id: 'inv-1',
    householdId: 'hh-1',
    accountId: 'acc-1',
    symbol: 'AC,ME',
    name: 'Acme "Growth" Fund',
    type: 'STOCK',
    shares: 1.5,
    costBasisPerShare: { amount: 10000 },
    currentPricePerShare: { amount: 12500 },
    currency: { code: 'USD', symbol: '$', name: 'US Dollar', decimalPlaces: 2 },
    lastPriceUpdate: '2024-03-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  } as Investment;
  const lot = {
    id: 'lot-1',
    investmentId: 'inv-1',
    purchaseDate: '2023-01-02',
    shares: 1.25,
    costPerShare: { amount: 10000 },
    totalCost: { amount: 12500 },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  } as InvestmentLot;

  return {
    investments: [investment],
    lots: [lot],
    realizedGains: [
      {
        symbol: 'AC,ME',
        soldDate: '2024-04-05',
        proceeds: { amount: 20000 },
        basis: { amount: 15000 },
        term: 'LONG_TERM',
      },
    ],
    dividends: [
      {
        symbol: 'AC,ME',
        date: '2024-02-03',
        type: 'Dividend',
        amount: { amount: 1234 },
        currency: 'USD',
        description: 'Quarterly "special"\nline',
      },
    ],
  };
}

describe('DataExport', () => {
  const createTestWrapper = (db: SqliteDb | null) => {
    const contextValue: DatabaseContextValue | null = db
      ? {
          db,
          diagnostics: {
            backend: 'indexeddb',
            opfsAvailable: false,
            didFallback: false,
            quotaBytes: null,
            usageBytes: null,
          },
        }
      : null;
    const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <DatabaseContext.Provider value={contextValue}>{children}</DatabaseContext.Provider>
    );
    return TestWrapper;
  };

  it('renders the request-my-data entry point and status indicator', () => {
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    expect(screen.getByRole('button', { name: /download all data \(json\)/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download transactions \(csv\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download all data \(csv zip\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request my data package/i })).toBeInTheDocument();
    expect(screen.getByText(/Download your data directly/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/not requested/i);
  });

  it('disables requests while the database is unavailable', () => {
    render(<DataExport />, { wrapper: createTestWrapper(null) });

    expect(screen.getByText(/database is not available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request my data package/i })).toBeDisabled();
  });

  it('downloads a full JSON export directly from local data', async () => {
    localStorage.setItem('finance-currency', 'USD');
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /download all data \(json\)/i }));

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const payload = JSON.parse(await blob.text()) as {
      accounts: unknown[];
      preferences: unknown[];
    };
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(payload.accounts).toHaveLength(1);
    expect(payload.preferences).toEqual([{ key: 'finance-currency', value: 'USD' }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(screen.getByText(/JSON download started/i)).toBeInTheDocument();
  });

  it('downloads denormalized transactions CSV directly from local data', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /download transactions \(csv\)/i }));

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    await expect(blob.text()).resolves.toContain(
      'date,account_name,category_name,description,amount,currency\r\n' +
        '2024-03-06,Checking,Food,Grocery Store,-67.42,USD',
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(screen.getByText(/Transactions CSV download started/i)).toBeInTheDocument();
  });

  it('shapes investment export sheets with headers and rows', () => {
    const sheets = buildInvestmentExportSheets(createInvestmentExportInput());

    expect(sheets.find((sheet) => sheet.name === 'Holdings')).toMatchObject({
      headers: ['symbol', 'shares', 'cost_basis', 'current_value', 'unrealized_gain'],
      rows: [['AC,ME', 1.5, '150.00', '187.50', '37.50']],
    });
    expect(sheets.find((sheet) => sheet.name === 'Tax Lots')).toMatchObject({
      headers: ['symbol', 'acquired_date', 'shares', 'cost_basis'],
      rows: [['AC,ME', '2023-01-02', 1.25, '125.00']],
    });
    expect(sheets.find((sheet) => sheet.name === 'Realized Gains')).toMatchObject({
      rows: [['AC,ME', '2024-04-05', '200.00', '150.00', 'LT', '50.00']],
    });
  });

  it('builds correctly escaped investment CSV files', () => {
    const files = buildInvestmentCsvFiles(createInvestmentExportInput());
    const holdings = files.find((file) => file.name === 'investment_holdings.csv');
    const dividends = files.find((file) => file.name === 'investment_dividends_income.csv');

    expect(holdings?.contents).toBe(
      'symbol,shares,cost_basis,current_value,unrealized_gain\r\n' +
        '"AC,ME",1.5,150.00,187.50,37.50\r\n',
    );
    expect(dividends?.contents).toContain(
      '"AC,ME",2024-02-03,Dividend,12.34,USD,"Quarterly ""special""\nline"',
    );
  });

  it('downloads investment CSV ZIP and XLSX exports from supplied investment data', async () => {
    const user = userEvent.setup();
    render(
      <DataExport showFinanceExports={false} investmentExport={createInvestmentExportInput()} />,
      { wrapper: createTestWrapper(createMockDb()) },
    );

    await user.click(screen.getByRole('button', { name: /download investment csvs \(zip\)/i }));
    await user.click(
      screen.getByRole('button', { name: /download investment workbook \(xlsx\)/i }),
    );

    const csvZipBlob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const xlsxBlob = vi.mocked(URL.createObjectURL).mock.calls[1][0] as Blob;
    expect(csvZipBlob.type).toBe('application/zip');
    expect(xlsxBlob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const xlsxBytes = new Uint8Array(await xlsxBlob.arrayBuffer());
    expect(xlsxBytes[0]).toBe(0x50);
    expect(xlsxBytes[1]).toBe(0x4b);
    expect(xlsxBytes).toHaveLength(buildInvestmentXlsx(createInvestmentExportInput()).length);
    expect(screen.getByText(/Investment XLSX download started/i)).toBeInTheDocument();
  });

  it('shows a confirmation modal with protected-category and mood-tag choices', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));

    expect(screen.getByRole('dialog', { name: /request your data package/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/include protected categories/i)).toBeChecked();
    expect(screen.getByLabelText(/include mood tags/i)).not.toBeChecked();
    expect(
      screen.getByText(/Mood tag data can reveal sensitive wellbeing patterns/i),
    ).toBeInTheDocument();
  });

  it('supports cancelling while the request is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/pending/i);

    await user.click(screen.getByRole('button', { name: /cancel request/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/cancelled/i);
  });

  it('generates a ready ZIP package without network egress', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network blocked')));
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByLabelText(/include mood tags/i));
    await user.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/ready/i));
    expect(screen.getByText(/Package ready/i)).toBeInTheDocument();
    expect(screen.getByText(/mood tags included: yes/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downloads the ZIP via the always-available download button', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /^download zip$/i }));

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(
      screen.getAllByRole('status').some((status) => /delivered/i.test(status.textContent ?? '')),
    ).toBe(true);
  });

  it('hides Share button when navigator.share is not supported', async () => {
    // Default beforeEach sets navigator.share = undefined.
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);

    expect(screen.queryByRole('button', { name: /share my exported package/i })).toBeNull();
  });

  it('disables Share button when no package has been generated yet', () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    const shareBtn = screen.getByRole('button', { name: /share my exported package/i });
    expect(shareBtn).toBeDisabled();
    expect(shareBtn).toHaveAttribute('title', expect.stringMatching(/generate a package first/i));
    expect(screen.getByText(/opens your device's share sheet/i)).toBeInTheDocument();
  });

  it('silently dismisses share when the user cancels (AbortError)', async () => {
    const shareSpy = vi.fn(() => Promise.reject(new DOMException('cancelled', 'AbortError')));
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /share my exported package/i }));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    // No error banner.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders an "unsupported" message when share rejects with NotAllowedError', async () => {
    const shareSpy = vi.fn(() =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    );
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /share my exported package/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sharing isn't available/i);
    expect(alert).not.toHaveTextContent(/permission denied/i);
  });
});
