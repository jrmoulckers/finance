// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for InvoicesPage.
 *
 * Mocks the useInvoices hook (not localStorage) per project conventions and
 * asserts the page exposes its title as the single level-1 heading so the
 * heading hierarchy stays intact (issue #3203).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { InvoicesPage } from './InvoicesPage';

vi.mock('../hooks/useInvoices', () => ({ useInvoices: vi.fn() }));

import { useInvoices } from '../hooks/useInvoices';

const mockedUseInvoices = vi.mocked(useInvoices);

beforeEach(() => {
  vi.clearAllMocks();
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
});
