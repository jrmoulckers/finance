// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for InvoicesPage.
 *
 * Mocks the useInvoices hook (not localStorage) per project conventions and
 * asserts the page exposes its title as the single level-1 heading so the
 * heading hierarchy stays intact (issue #3203).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { InvoicesPage } from './InvoicesPage';
import type { Invoice } from '../lib/analytics/invoices';

vi.mock('../hooks/useInvoices', () => ({ useInvoices: vi.fn() }));
vi.mock('../hooks/useLocalePreferences', () => ({ useLocalePreferences: vi.fn() }));

import { useInvoices } from '../hooks/useInvoices';
import { useLocalePreferences } from '../hooks/useLocalePreferences';

const mockedUseInvoices = vi.mocked(useInvoices);
const mockedUseLocalePreferences = vi.mocked(useLocalePreferences);

function mockLocale(locale: string): void {
  mockedUseLocalePreferences.mockReturnValue({
    locale,
    timeZone: 'UTC',
    supportedLocales: [],
    timeZoneOptions: [],
    setLocale: vi.fn(),
    setTimeZone: vi.fn(),
  });
}

const SAMPLE_INVOICE: Invoice = {
  id: 'inv-1',
  clientName: 'Etsy Wholesale',
  amountCents: 120_000,
  issueDate: '2026-06-01',
  paymentTerm: 'net-30',
  status: 'Sent',
  expectedPayDate: '2026-07-01',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLocale('en-US');
  mockedUseInvoices.mockReturnValue({
    invoices: [],
    pipelineGroups: [],
    forecastBuckets: [],
    totalOutstandingCents: 0,
    addInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    deleteInvoice: vi.fn(),
    refresh: vi.fn(),
  });
});

describe('InvoicesPage', () => {
  it('exposes the page title as the single level-1 heading', () => {
    render(<InvoicesPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
  });

  it('renders the pipeline forecast subtitle', () => {
    render(<InvoicesPage />);

    expect(screen.getByText(/forecast when freelance income should land/i)).toBeInTheDocument();
  });

  it('confirms before deleting an invoice', () => {
    const deleteInvoice = vi.fn();
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice,
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // Deletion is gated by a confirmation dialog; nothing happens until confirmed.
    expect(deleteInvoice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete invoice' }));
    expect(deleteInvoice).toHaveBeenCalledWith('inv-1');
  });

  it('pluralizes the invoice count per pipeline group', () => {
    const second: Invoice = { ...SAMPLE_INVOICE, id: 'inv-2' };
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE, second],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
        { status: 'Paid', label: 'Paid', invoices: [SAMPLE_INVOICE, second], totalCents: 240_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    expect(screen.getByText('1 invoice')).toBeInTheDocument();
    expect(screen.getByText('2 invoices')).toBeInTheDocument();
  });

  it('formats invoice dates using the active locale', () => {
    mockLocale('en-GB');
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    // en-GB renders day-first ("1 Jun 2026"); the removed en-US hardcode showed "Jun 1, 2026".
    expect(screen.getByText(/Issued 1 Jun 2026/)).toBeInTheDocument();
  });
});
