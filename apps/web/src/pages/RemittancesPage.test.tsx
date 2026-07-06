// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for RemittancesPage (issue #2170).
 *
 * Mocks the useRemittances hook (not localStorage) per project conventions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RemittancesPage } from './RemittancesPage';
import type { RemittanceRecord, RemittanceSummary } from '../lib/remittance';

vi.mock('../hooks/useRemittances', () => ({
  useRemittances: vi.fn(),
}));

import { useRemittances } from '../hooks/useRemittances';

const mockUseRemittances = vi.mocked(useRemittances);

const EMPTY_SUMMARY: RemittanceSummary = {
  count: 0,
  sentByCurrency: {},
  feesByCurrency: {},
  receivedByCurrency: {},
  totalCostByCurrency: {},
  destinationCountries: [],
};

function buildResult(overrides: Partial<ReturnType<typeof useRemittances>> = {}) {
  return {
    remittances: [],
    summary: EMPTY_SUMMARY,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createRemittance: vi.fn(),
    deleteRemittance: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useRemittances>;
}

const SAMPLE_RECORD: RemittanceRecord = {
  id: 'rem-1',
  date: '2026-06-01',
  sourceCurrency: 'USD',
  destCurrency: 'MXN',
  sendAmountMinor: 50_000,
  feeMinor: 500,
  fxRate: 17.0,
  feeModel: 'ADDITIVE',
  referenceRate: 17.5,
  recipient: { name: 'Familia García', country: 'MX' },
  note: null,
  createdAt: '2026-06-01T12:00:00.000Z',
};

describe('RemittancesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while loading', () => {
    mockUseRemittances.mockReturnValue(buildResult({ loading: true }));
    render(<RemittancesPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error banner on error', () => {
    mockUseRemittances.mockReturnValue(buildResult({ error: 'Storage failed' }));
    render(<RemittancesPage />);
    expect(screen.getByText('Storage failed')).toBeInTheDocument();
  });

  it('renders the entry form and empty state when there are no records', () => {
    mockUseRemittances.mockReturnValue(buildResult());
    render(<RemittancesPage />);
    expect(screen.getByText('Record a remittance')).toBeInTheDocument();
    expect(screen.getByText('No remittances yet')).toBeInTheDocument();
  });

  it('exposes the page title as the single level-1 heading', () => {
    mockUseRemittances.mockReturnValue(buildResult());
    render(<RemittancesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders a live estimate once amount and rate are entered', () => {
    mockUseRemittances.mockReturnValue(buildResult());
    render(<RemittancesPage />);

    fireEvent.change(screen.getByLabelText(/Amount you send/), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Exchange rate/), { target: { value: '17' } });

    expect(screen.getByLabelText('Estimate')).toBeInTheDocument();
    // 500 * 17 = 8,500.00 MXN received.
    expect(screen.getByText(/8,500\.00/)).toBeInTheDocument();
  });

  it('blocks submission and shows validation errors when required fields are empty', () => {
    const createRemittance = vi.fn();
    mockUseRemittances.mockReturnValue(buildResult({ createRemittance }));
    render(<RemittancesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Record remittance' }));

    expect(createRemittance).not.toHaveBeenCalled();
    expect(screen.getByText('Recipient name is required.')).toBeInTheDocument();
    expect(screen.getByText('Enter the amount you send.')).toBeInTheDocument();
    expect(screen.getByText('Enter the exchange rate.')).toBeInTheDocument();
  });

  it('submits a valid remittance with the expected payload', () => {
    const createRemittance = vi.fn(() => SAMPLE_RECORD);
    mockUseRemittances.mockReturnValue(buildResult({ createRemittance }));
    render(<RemittancesPage />);

    fireEvent.change(screen.getByLabelText(/Recipient name/), {
      target: { value: 'Familia García' },
    });
    fireEvent.change(screen.getByLabelText(/Date sent/), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText(/Amount you send/), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Provider fee/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Exchange rate/), { target: { value: '17' } });
    fireEvent.change(screen.getByLabelText(/Mid-market rate/), { target: { value: '17.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Record remittance' }));

    expect(createRemittance).toHaveBeenCalledTimes(1);
    expect(createRemittance).toHaveBeenCalledWith({
      date: '2026-06-01',
      sourceCurrency: 'USD',
      destCurrency: 'MXN',
      sendAmountMinor: 50_000,
      feeMinor: 500,
      fxRate: 17,
      feeModel: 'ADDITIVE',
      referenceRate: 17.5,
      recipient: { name: 'Familia García', country: 'MX' },
      note: null,
    });
  });

  it('renders the summary and history when records exist', () => {
    mockUseRemittances.mockReturnValue(
      buildResult({
        remittances: [SAMPLE_RECORD],
        summary: {
          count: 1,
          sentByCurrency: { USD: 50_500 },
          feesByCurrency: { USD: 500 },
          receivedByCurrency: { MXN: 850_000 },
          totalCostByCurrency: { USD: 1_929 },
          destinationCountries: ['MX'],
        },
      }),
    );
    render(<RemittancesPage />);

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('History (1)')).toBeInTheDocument();
    expect(screen.getByText('Familia García')).toBeInTheDocument();
  });

  it('deletes a record after confirming in the dialog', () => {
    const deleteRemittance = vi.fn();
    mockUseRemittances.mockReturnValue(
      buildResult({
        remittances: [SAMPLE_RECORD],
        summary: {
          count: 1,
          sentByCurrency: { USD: 50_500 },
          feesByCurrency: { USD: 500 },
          receivedByCurrency: { MXN: 850_000 },
          totalCostByCurrency: { USD: 1_929 },
          destinationCountries: ['MX'],
        },
        deleteRemittance,
      }),
    );
    render(<RemittancesPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete remittance to Familia García on Jun 1, 2026' }),
    );
    // Deletion is gated by a confirmation dialog; nothing happens until confirmed.
    expect(deleteRemittance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete remittance' }));
    expect(deleteRemittance).toHaveBeenCalledWith('rem-1');
  });
});
