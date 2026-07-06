// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for InvoicesPage.
 *
 * Mocks the useInvoices hook (not localStorage) per project conventions and
 * asserts the page exposes its title as the single level-1 heading so the
 * heading hierarchy stays intact (issue #3203), gives per-invoice controls
 * distinguishing accessible names (#3222), and surfaces the past-due bucket in
 * the forecast summary (#3219).
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
    updateInvoice: vi.fn(),
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
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice,
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete invoice for Etsy Wholesale' }));
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
      updateInvoice: vi.fn(),
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
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    // en-GB renders day-first ("1 Jun 2026"); the removed en-US hardcode showed "Jun 1, 2026".
    expect(screen.getByText(/Issued 1 Jun 2026/)).toBeInTheDocument();
  });

  it('offers existing client names as autocomplete suggestions', () => {
    const second: Invoice = { ...SAMPLE_INVOICE, id: 'inv-2', clientName: 'Maple & Co' };
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE, second],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE, second], totalCents: 240_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 240_000,
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    const { container } = render(<InvoicesPage />);

    const input = screen.getByPlaceholderText('Acme Studio');
    expect(input).toHaveAttribute('list', 'invoice-client-suggestions');

    const datalist = container.querySelector('#invoice-client-suggestions');
    expect(datalist).not.toBeNull();
    const values = Array.from(datalist!.querySelectorAll('option')).map((option) =>
      option.getAttribute('value'),
    );
    expect(values).toContain('Etsy Wholesale');
    expect(values).toContain('Maple & Co');
  });

  it('gives each invoice control a distinguishing accessible name (#3222)', () => {
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    expect(screen.getByRole('combobox', { name: 'Status for Etsy Wholesale' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete invoice for Etsy Wholesale' }),
    ).toBeInTheDocument();
  });

  it('surfaces the past-due bucket in the forecast summary (#3219)', () => {
    mockedUseInvoices.mockReturnValue({
      invoices: [],
      pipelineGroups: [],
      forecastBuckets: [
        { id: 'past-due', label: 'Past due', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
      ],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    expect(screen.getByRole('article', { name: 'Past due forecast' })).toBeInTheDocument();
  });

  it('disables the Export CSV button when there are no invoices (#3228)', () => {
    render(<InvoicesPage />);

    expect(screen.getByRole('button', { name: /export invoices as csv/i })).toBeDisabled();
  });

  it('exports a CSV blob download when invoices exist (#3228)', () => {
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE],
      pipelineGroups: [],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:invoices');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<InvoicesPage />);
    fireEvent.click(screen.getByRole('button', { name: /export invoices as csv/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  it('enters edit mode and saves changes to an existing invoice (#3218)', () => {
    const updateInvoice = vi.fn();
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoice,
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit invoice for Etsy Wholesale' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Edit invoice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    const clientInput = screen.getByLabelText(/client name/i);
    expect(clientInput).toHaveValue('Etsy Wholesale');

    fireEvent.change(clientInput, { target: { value: 'Etsy Wholesale LLC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateInvoice).toHaveBeenCalledTimes(1);
    expect(updateInvoice).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({ clientName: 'Etsy Wholesale LLC', amountCents: 120_000 }),
    );
  });

  it('cancels edit mode and restores the add-invoice form (#3218)', () => {
    mockedUseInvoices.mockReturnValue({
      invoices: [SAMPLE_INVOICE],
      pipelineGroups: [
        { status: 'Sent', label: 'Sent', invoices: [SAMPLE_INVOICE], totalCents: 120_000 },
      ],
      forecastBuckets: [],
      totalOutstandingCents: 120_000,
      addInvoice: vi.fn(),
      updateInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      deleteInvoice: vi.fn(),
      refresh: vi.fn(),
    });
    render(<InvoicesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit invoice for Etsy Wholesale' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));

    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add invoice' })).toBeInTheDocument();
  });
});
