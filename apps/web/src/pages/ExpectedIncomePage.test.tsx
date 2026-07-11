// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ExpectedIncomePage (#2193).
 *
 * The #2193 expected-income store is still localStorage-backed (cleared between
 * tests) so the add/list flow is exercised directly. The invoice pipeline it
 * surfaces (#3229) now lives in the database, so `useInvoices` is mocked per
 * project conventions rather than seeding its old localStorage key.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { ExpectedIncomePage } from './ExpectedIncomePage';
import type { Invoice } from '../lib/analytics/invoices';

vi.mock('../hooks/useInvoices', () => ({ useInvoices: vi.fn() }));

import { useInvoices } from '../hooks/useInvoices';

const mockedUseInvoices = vi.mocked(useInvoices);

/** Point the mocked `useInvoices` at a fixed invoice list (page reads `.invoices`). */
function mockInvoices(invoices: Invoice[]): void {
  mockedUseInvoices.mockReturnValue({
    invoices,
    pipelineGroups: [],
    forecastBuckets: [],
    totalOutstandingCents: 0,
    addInvoice: vi.fn(),
    updateInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    logInvoiceContact: vi.fn(),
    recordPayment: vi.fn(),
    deleteInvoice: vi.fn(),
    refresh: vi.fn(),
  });
}

function addPayment(options: {
  name: string;
  amount: string;
  date: string;
  confidence?: 'High' | 'Medium' | 'Low';
  received?: boolean;
}) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: options.name } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: options.amount } });
  fireEvent.change(screen.getByLabelText('Expected date'), { target: { value: options.date } });
  if (options.confidence) {
    fireEvent.change(screen.getByLabelText('Confidence'), {
      target: { value: options.confidence.toLowerCase() },
    });
  }
  if (options.received) {
    fireEvent.click(screen.getByLabelText('Already received (counts as spendable now)'));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add payment' }));
}

describe('ExpectedIncomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockInvoices([]);
  });

  it('renders the heading and an empty state initially', () => {
    render(<ExpectedIncomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /expected vs\. cleared income/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No expected income yet')).toBeInTheDocument();
  });

  it('keeps cleared money spendable now and expected money separate', () => {
    render(<ExpectedIncomePage />);

    // A cleared (received) payment becomes spendable now.
    addPayment({ name: 'Cleared paycheck', amount: '300.00', date: '2026-06-01', received: true });
    // An expected (uncleared) payment must NOT be spendable now.
    addPayment({ name: 'Child support', amount: '500.00', date: '2026-06-25' });

    const realizedCard = screen
      .getByRole('heading', { name: 'Spendable now' })
      .closest('.expected-income__card') as HTMLElement;
    expect(within(realizedCard).getByText('$300.00')).toBeInTheDocument();

    const expectedCard = screen
      .getByRole('heading', { name: 'Expected (not yet received)' })
      .closest('.expected-income__card') as HTMLElement;
    expect(within(expectedCard).getByText('$500.00')).toBeInTheDocument();

    // Both items are listed.
    expect(screen.getByRole('heading', { level: 3, name: 'Cleared paycheck' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Child support' })).toBeInTheDocument();
  });

  it('toggles an expected payment to received and back', () => {
    render(<ExpectedIncomePage />);
    addPayment({ name: 'Child support', amount: '500.00', date: '2026-06-25' });

    const markReceived = screen.getByRole('button', { name: 'Mark received' });
    fireEvent.click(markReceived);

    // After clearing, spendable-now reflects the amount.
    const realizedCard = screen
      .getByRole('heading', { name: 'Spendable now' })
      .closest('.expected-income__card') as HTMLElement;
    expect(within(realizedCard).getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark not received' })).toBeInTheDocument();
  });

  it('deletes a payment', () => {
    render(<ExpectedIncomePage />);
    addPayment({ name: 'One-off gift', amount: '100.00', date: '2026-06-10' });
    expect(screen.getByRole('heading', { level: 3, name: 'One-off gift' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete One-off gift' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Remove expected income' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(
      screen.queryByRole('heading', { level: 3, name: 'One-off gift' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('No expected income yet')).toBeInTheDocument();
  });

  it('keeps the payment when the delete is cancelled', () => {
    render(<ExpectedIncomePage />);
    addPayment({ name: 'One-off gift', amount: '100.00', date: '2026-06-10' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete One-off gift' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('heading', { level: 3, name: 'One-off gift' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('validates the amount field', () => {
    render(<ExpectedIncomePage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bad amount' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add payment' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/amount/i);
  });

  it('surfaces sent and overdue invoices as expected income without re-entry (#3229)', () => {
    mockInvoices([
      {
        id: 'inv-1',
        clientName: 'Studio Delacroix',
        amountCents: 120000,
        currency: 'USD',
        issueDate: '2099-01-01',
        paymentTerm: 'net-30',
        status: 'Sent',
        expectedPayDate: '2099-02-01',
        createdAt: '2099-01-01T00:00:00.000Z',
        updatedAt: '2099-01-01T00:00:00.000Z',
      },
    ]);

    render(<ExpectedIncomePage />);

    const section = screen.getByRole('region', { name: /from your invoices/i });
    expect(
      within(section).getByRole('heading', { level: 3, name: 'Studio Delacroix' }),
    ).toBeInTheDocument();
    const invoiceList = within(section).getByRole('list');
    expect(within(invoiceList).getByText('$1,200.00')).toBeInTheDocument();
  });
});
